import { isUUID } from 'class-validator';
import { ORDER_STATUSES, OrderStatus } from '../entities/order.entity';

/** Canal de PostgreSQL por el que viajan los avisos de pedidos. */
export const ORDER_CHANNEL = 'order_events';

/** Lo que recibe el navegador: sin nombres, teléfonos, tarjetas ni montos (RN-72). */
export interface OrderNotice {
  orderId: string;
  number: number;
  status: OrderStatus;
  at: string;
}

/** Aviso más el dueño del pedido; el dueño solo sirve para decidir quién lo recibe. */
export interface OrderEnvelope {
  customerId: string;
  notice: OrderNotice;
}

export type StreamScope = 'customer' | 'kitchen';

export const READY_FRAME = 'event: ready\ndata: {}\n\n';
export const HEARTBEAT_FRAME = ': keep-alive\n\n';

export function encodeEnvelope(envelope: OrderEnvelope): string {
  const { customerId, notice } = envelope;
  return JSON.stringify({
    c: customerId,
    o: notice.orderId,
    n: notice.number,
    s: notice.status,
    t: notice.at,
  });
}

/** Devuelve `null` ante cualquier carga que no tenga exactamente la forma esperada. */
export function decodeEnvelope(
  payload: string | undefined,
): OrderEnvelope | null {
  if (payload === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { c, o, n, s, t } = raw as Record<string, unknown>;
  if (
    typeof c !== 'string' ||
    typeof o !== 'string' ||
    !isUUID(c, '4') ||
    !isUUID(o, '4') ||
    typeof n !== 'number' ||
    !Number.isSafeInteger(n) ||
    typeof s !== 'string' ||
    !(ORDER_STATUSES as readonly string[]).includes(s) ||
    typeof t !== 'string' ||
    Number.isNaN(Date.parse(t))
  )
    return null;
  return {
    customerId: c,
    notice: { orderId: o, number: n, status: s as OrderStatus, at: t },
  };
}

/** RN-73: la cocina recibe todo; un cliente, solo lo de sus propios pedidos. */
export function isRecipient(
  scope: StreamScope,
  userId: string,
  envelope: OrderEnvelope,
): boolean {
  return scope === 'kitchen' || envelope.customerId === userId;
}

/** Cuadro SSE con nombre de evento y datos en JSON. */
export function eventFrame(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
