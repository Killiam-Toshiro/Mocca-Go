import { ClientRequest, IncomingHttpHeaders, request, Server } from 'node:http';
import { AddressInfo } from 'node:net';

export interface SseEvent {
  event: string;
  data: unknown;
}

/** Cliente mínimo de Server-Sent Events para las pruebas (lee la respuesta en flujo). */
export class StreamClient {
  status = 0;
  headers: IncomingHttpHeaders = {};
  ended = false;
  private buffer = '';
  private req!: ClientRequest;

  static open(
    server: Server,
    path: string,
    auth?: string,
  ): Promise<StreamClient> {
    const client = new StreamClient();
    const { port } = server.address() as AddressInfo;
    return new Promise((resolve, reject) => {
      client.req = request(
        {
          host: '127.0.0.1',
          port,
          path: `/api/v1${path}`,
          headers: auth ? { Authorization: auth } : {},
        },
        (response) => {
          client.status = response.statusCode ?? 0;
          client.headers = response.headers;
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (client.buffer += chunk));
          response.on('end', () => (client.ended = true));
          response.on('close', () => (client.ended = true));
          resolve(client);
        },
      );
      client.req.on('error', (error) => {
        if (client.ended) return;
        client.ended = true;
        if (client.status === 0) reject(error);
      });
      client.req.end();
    });
  }

  /** Texto recibido hasta ahora (en una respuesta de error, el cuerpo JSON). */
  get raw(): string {
    return this.buffer;
  }

  /** Eventos con nombre ya completos (los comentarios de latido no cuentan). */
  get events(): SseEvent[] {
    return this.buffer
      .split('\n\n')
      .filter((frame) => frame.startsWith('event: '))
      .map((frame) => {
        const [name, data] = frame.split('\n');
        return {
          event: name.slice('event: '.length),
          data: JSON.parse(data.slice('data: '.length)) as unknown,
        };
      });
  }

  /** Eventos `order` recibidos, solo sus datos. */
  get notices(): Record<string, unknown>[] {
    return this.events
      .filter((event) => event.event === 'order')
      .map((event) => event.data as Record<string, unknown>);
  }

  get heartbeats(): number {
    return this.buffer.split('\n\n').filter((f) => f === ': keep-alive').length;
  }

  async until(
    check: () => boolean,
    label: string,
    timeoutMs = 5000,
  ): Promise<void> {
    const limit = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > limit)
        throw new Error(`Tiempo agotado esperando: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }

  close(): void {
    this.req.destroy();
  }
}

export async function eventually(
  check: () => boolean | Promise<boolean>,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const limit = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > limit)
      throw new Error(`Tiempo agotado esperando: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
