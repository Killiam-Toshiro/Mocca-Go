import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuthService, Identity } from '../../auth/auth.service';
import { OrderStatus } from '../entities/order.entity';
import {
  decodeEnvelope,
  encodeEnvelope,
  eventFrame,
  HEARTBEAT_FRAME,
  isRecipient,
  ORDER_CHANNEL,
  OrderEnvelope,
  READY_FRAME,
  StreamScope,
} from './order-notice';

export interface StreamOptions {
  /** Milisegundos entre latidos (cada latido también verifica la sesión). */
  heartbeatMs: number;
  /** Canales abiertos a la vez por usuario. */
  maxPerUser: number;
}

export const STREAM_OPTIONS = Symbol('ORDER_STREAM_OPTIONS');
export const DEFAULT_STREAM_OPTIONS: StreamOptions = {
  heartbeatMs: 25_000,
  maxPerUser: 5,
};

/** Lo único que se usa de la petición HTTP. */
export interface StreamRequest {
  on(event: 'close', listener: () => void): unknown;
}

/** Lo único que se usa de la respuesta HTTP. */
export interface StreamResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  on(event: 'error', listener: () => void): unknown;
  readonly writableEnded: boolean;
}

/** Subconjunto del cliente de `pg` que usa la escucha. */
interface ListenClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query(sql: string): Promise<unknown>;
  on(
    event: 'notification',
    listener: (message: { channel: string; payload?: string }) => void,
  ): unknown;
  on(event: 'error' | 'end', listener: (error?: Error) => void): unknown;
  removeAllListeners(): unknown;
}
/** El pool de `pg` que usa TypeORM: da la configuración y la clase de cliente. */
interface ListenPool {
  options: object;
  Client: new (config: object) => ListenClient;
}

const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;
const IGNORE = () => undefined;

/**
 * Avisos de pedidos en tiempo real (D-99 a D-104).
 *
 * Publicar usa `pg_notify` dentro de la transacción del cambio, de modo que
 * PostgreSQL entrega el aviso solo si esa transacción se confirma. Cada
 * instancia mantiene una conexión dedicada con `LISTEN` y reparte lo que llega
 * a los canales SSE abiertos, incluso a los de la propia instancia: así hay un
 * único camino sin importar cuántas instancias haya.
 */
@Injectable()
export class OrderNotificationsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private running = false;
  private listener?: ListenClient;
  private retry?: NodeJS.Timeout;
  private attempts = 0;
  private needsResync = false;
  private readonly notices = new Set<(envelope: OrderEnvelope) => void>();
  private readonly resyncs = new Set<() => void>();
  private readonly closers = new Set<() => void>();
  private readonly open = new Map<string, number>();

  constructor(
    private readonly source: DataSource,
    private readonly auth: AuthService,
    @Inject(STREAM_OPTIONS) private readonly options: StreamOptions,
  ) {}

  /** Cantidad de canales abiertos (para pruebas y diagnóstico). */
  get openStreams(): number {
    return this.closers.size;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.running = true;
    await this.connect();
  }

  onModuleDestroy(): void {
    this.running = false;
    clearTimeout(this.retry);
    for (const close of [...this.closers]) close();
    this.dropListener();
  }

  /** Emite el aviso dentro de la transacción del cambio de estado (RN-71). */
  async publish(
    manager: EntityManager,
    order: { id: string; number: number; customerId: string },
    status: OrderStatus,
  ): Promise<void> {
    const payload = encodeEnvelope({
      customerId: order.customerId,
      notice: {
        orderId: order.id,
        number: order.number,
        status,
        at: new Date().toISOString(),
      },
    });
    await manager.query('SELECT pg_notify($1, $2)', [ORDER_CHANNEL, payload]);
  }

  /** Abre un canal SSE para la identidad (RN-74 a RN-78). */
  serve(
    identity: Identity,
    scope: StreamScope,
    request: StreamRequest,
    response: StreamResponse,
  ): void {
    const current = this.open.get(identity.id) ?? 0;
    if (current >= this.options.maxPerUser)
      throw new HttpException(
        'Demasiados canales abiertos para este usuario.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.open.set(identity.id, current + 1);

    let closed = false;
    const onNotice = (envelope: OrderEnvelope) => {
      if (isRecipient(scope, identity.id, envelope))
        response.write(eventFrame('order', envelope.notice));
    };
    const onResync = () => {
      response.write(READY_FRAME);
    };
    const heartbeat = setInterval(() => {
      void this.auth
        .isSessionActive(identity)
        .then((active) => {
          if (closed) return;
          if (active) response.write(HEARTBEAT_FRAME);
          else close();
        })
        // Un fallo pasajero de la base no debe tumbar el canal: se reintenta.
        .catch(IGNORE);
    }, this.options.heartbeatMs);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.notices.delete(onNotice);
      this.resyncs.delete(onResync);
      this.closers.delete(close);
      const left = (this.open.get(identity.id) ?? 1) - 1;
      if (left <= 0) this.open.delete(identity.id);
      else this.open.set(identity.id, left);
      if (!response.writableEnded) response.end();
    };

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(READY_FRAME);
    this.notices.add(onNotice);
    this.resyncs.add(onResync);
    this.closers.add(close);
    request.on('close', close);
    response.on('error', close);
  }

  private async connect(): Promise<void> {
    if (!this.running || this.listener) return;
    let client: ListenClient | undefined;
    try {
      const pool = (this.source.driver as unknown as { master: ListenPool })
        .master;
      // Conexión propia, fuera del pool: así `DataSource.destroy()` nunca
      // queda esperando una conexión con `LISTEN` abierto.
      client = new pool.Client(pool.options);
      const own = client;
      own.on('notification', (message) => {
        if (message.channel !== ORDER_CHANNEL) return;
        const envelope = decodeEnvelope(message.payload);
        if (envelope) for (const notify of [...this.notices]) notify(envelope);
      });
      own.on('error', () => this.lose(own));
      own.on('end', () => this.lose(own));
      await own.connect();
      if (!this.running) {
        this.discard(own);
        return;
      }
      await own.query(`LISTEN ${ORDER_CHANNEL}`);
      this.listener = client;
      this.attempts = 0;
      if (this.needsResync) {
        this.needsResync = false;
        for (const resync of [...this.resyncs]) resync();
      }
    } catch {
      if (client) this.discard(client);
      this.scheduleRetry();
    }
  }

  /** La conexión de escucha se cayó: se descarta y se reconecta (RN-79). */
  private lose(client: ListenClient): void {
    if (this.listener !== client) return;
    this.listener = undefined;
    this.needsResync = true;
    this.discard(client);
    if (this.running) this.scheduleRetry();
  }

  /** Cierra la conexión de escucha sin dejar manejadores ni errores sin atender. */
  private discard(client: ListenClient): void {
    client.removeAllListeners();
    client.on('error', IGNORE);
    try {
      client.end().catch(IGNORE);
    } catch {
      // Ya estaba cerrada.
    }
  }

  private dropListener(): void {
    const client = this.listener;
    this.listener = undefined;
    if (client) this.discard(client);
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.attempts);
    this.attempts += 1;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), delay);
    this.retry.unref();
  }
}
