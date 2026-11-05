import { randomUUID } from 'node:crypto';
import {
  decodeEnvelope,
  encodeEnvelope,
  eventFrame,
  HEARTBEAT_FRAME,
  isRecipient,
  OrderEnvelope,
  READY_FRAME,
} from '../../src/orders/notifications/order-notice';

const envelope = (): OrderEnvelope => ({
  customerId: randomUUID(),
  notice: {
    orderId: randomUUID(),
    number: 1042,
    status: 'en_preparacion',
    at: '2026-11-05T17:03:11.000Z',
  },
});

describe('avisos de pedidos (funciones puras)', () => {
  it('codifica y decodifica sin perder datos', () => {
    const original = envelope();
    expect(decodeEnvelope(encodeEnvelope(original))).toEqual(original);
  });

  it('la carga cabe de sobra en el límite de pg_notify (8000 bytes)', () => {
    expect(encodeEnvelope(envelope()).length).toBeLessThan(300);
  });

  it.each([
    ['indefinida', undefined],
    ['texto que no es JSON', 'no json'],
    ['JSON que no es objeto', '"x"'],
    ['null', 'null'],
    ['sin campos', '{}'],
  ])('descarta una carga %s', (_name, payload) => {
    expect(decodeEnvelope(payload)).toBeNull();
  });

  it.each([
    ['cliente que no es UUID', { c: 'x' }],
    ['pedido que no es UUID', { o: 'x' }],
    ['número fraccionario', { n: 1.5 }],
    ['número como texto', { n: '1' }],
    ['estado desconocido', { s: 'hackeado' }],
    ['hora inválida', { t: 'ayer' }],
    ['hora que no es texto', { t: 5 }],
  ])('descarta una carga con %s', (_name, change) => {
    const good = JSON.parse(encodeEnvelope(envelope())) as object;
    expect(decodeEnvelope(JSON.stringify({ ...good, ...change }))).toBeNull();
  });

  it('RN-73: la cocina recibe todo y el cliente solo lo suyo', () => {
    const one = envelope();
    expect(isRecipient('kitchen', randomUUID(), one)).toBe(true);
    expect(isRecipient('customer', one.customerId, one)).toBe(true);
    expect(isRecipient('customer', randomUUID(), one)).toBe(false);
  });

  it('da formato a los cuadros SSE', () => {
    expect(eventFrame('order', { a: 1 })).toBe(
      'event: order\ndata: {"a":1}\n\n',
    );
    expect(READY_FRAME).toBe('event: ready\ndata: {}\n\n');
    expect(HEARTBEAT_FRAME).toBe(': keep-alive\n\n');
  });
});
