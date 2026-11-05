import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Session } from '../../src/auth/entities/session.entity';
import { OrderNotificationsService } from '../../src/orders/notifications/order-notifications.service';
import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';
import { eventually, StreamClient } from '../helpers/sse';

jest.setTimeout(30_000);

describe('Canales en tiempo real (CA-09 a CA-12, CA-14 a CA-17, CA-19)', () => {
  const harness = new CatalogHarness();
  const clients: StreamClient[] = [];
  let ana: Customer;
  let bea: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start({ heartbeatMs: 100, maxPerUser: 2 });
    ana = await harness.customer('ana');
    bea = await harness.customer('bea');
    f = await fixture(harness);
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await harness.stop();
  });

  const open = async (path: string, auth?: string) => {
    const client = await StreamClient.open(harness.server, path, auth);
    clients.push(client);
    return client;
  };
  const create = async (who: Customer) =>
    (await placeOrder(harness, who, validBody(f)).expect(201))
      .body as OrderBody;
  const act = (action: 'start' | 'ready', id: string) =>
    harness
      .send('post', `/kitchen/orders/${id}/${action}`, undefined, 'operador')
      .expect(200);
  const service = () => harness.app.get(OrderNotificationsService);

  it('CA-09 y CA-19: el cliente recibe ready y luego el aviso de su pedido, sin datos personales', async () => {
    const stream = await open('/orders/stream', ana.auth);
    expect(stream.status).toBe(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.headers['cache-control']).toBe('no-store');
    expect(stream.headers['x-accel-buffering']).toBe('no');
    await stream.until(() => stream.events.length >= 1, 'ready');
    expect(stream.events[0]).toEqual({ event: 'ready', data: {} });

    const order = await create(ana);
    await act('start', order.id);
    await stream.until(() => stream.notices.length >= 2, 'avisos');
    expect(stream.notices[0]).toMatchObject({
      orderId: order.id,
      number: order.number,
      status: 'recibido',
    });
    const started = stream.notices[1];
    expect(Object.keys(started).sort()).toEqual([
      'at',
      'number',
      'orderId',
      'status',
    ]);
    expect(started.status).toBe('en_preparacion');
    expect(new Date(started.at as string).toString()).not.toBe('Invalid Date');
    expect(stream.raw).not.toMatch(/Ana|Cliente|3001112233|ana@|4242|"c"/);
  });

  it('CA-10: cada cliente recibe solo los avisos de sus propios pedidos', async () => {
    const anaStream = await open('/orders/stream', ana.auth);
    const beaStream = await open('/orders/stream', bea.auth);
    const mine = await create(ana);
    await act('start', mine.id);
    const hers = await create(bea);
    await act('start', hers.id);
    await beaStream.until(() => beaStream.notices.length >= 2, 'avisos de Bea');
    await anaStream.until(() => anaStream.notices.length >= 2, 'avisos de Ana');
    expect(new Set(anaStream.notices.map((n) => n.orderId))).toEqual(
      new Set([mine.id]),
    );
    expect(new Set(beaStream.notices.map((n) => n.orderId))).toEqual(
      new Set([hers.id]),
    );
  });

  it('CA-11: la cocina recibe pedido nuevo, cada cambio y la cancelación', async () => {
    const kitchen = await open('/kitchen/stream', harness.as('operador'));
    const admin = await open('/kitchen/stream', harness.as('admin'));
    const order = await create(ana);
    await act('start', order.id);
    await act('ready', order.id);
    const other = await create(bea);
    await request(harness.server)
      .post(`/api/v1/orders/${other.id}/cancel`)
      .set('Authorization', bea.auth)
      .send({})
      .expect(200);
    for (const stream of [kitchen, admin]) {
      await stream.until(() => stream.notices.length >= 5, 'cinco avisos');
      const statuses = (id: string) =>
        stream.notices.filter((n) => n.orderId === id).map((n) => n.status);
      expect(statuses(order.id)).toEqual([
        'recibido',
        'en_preparacion',
        'listo',
      ]);
      expect(statuses(other.id)).toEqual(['recibido', 'cancelado']);
    }
  });

  it('CA-12: si la transacción se revierte no sale ningún aviso', async () => {
    const stream = await open('/orders/stream', ana.auth);
    await stream.until(() => stream.events.length >= 1, 'ready');
    const ghost = { id: randomUUID(), number: 9999, customerId: ana.id };
    await expect(
      harness.context.source.transaction(async (manager) => {
        await service().publish(manager, ghost, 'listo');
        throw new Error('revertir');
      }),
    ).rejects.toThrow('revertir');
    const real = { id: randomUUID(), number: 1, customerId: ana.id };
    await harness.context.source.transaction((manager) =>
      service().publish(manager, real, 'recibido'),
    );
    await stream.until(() => stream.notices.length >= 1, 'aviso confirmado');
    expect(stream.notices.map((n) => n.orderId)).toEqual([real.id]);
  });

  it('CA-14: los roles equivocados reciben 403 y sin sesión 401', async () => {
    for (const role of ['admin', 'operador', 'repartidor'] as const) {
      const denied = await open('/orders/stream', harness.as(role));
      expect(denied.status).toBe(403);
    }
    for (const role of ['cliente', 'repartidor'] as const) {
      const denied = await open('/kitchen/stream', harness.as(role));
      expect(denied.status).toBe(403);
    }
    expect((await open('/orders/stream')).status).toBe(401);
    expect((await open('/kitchen/stream')).status).toBe(401);
    expect(service().openStreams).toBe(0);
  });

  it('CA-15: el latido llega y, con la sesión revocada, el canal se cierra', async () => {
    const stream = await open('/orders/stream', ana.auth);
    await stream.until(() => stream.heartbeats >= 2, 'latidos');
    await harness.context.source
      .getRepository(Session)
      .update({ userId: ana.id }, { revokedAt: new Date() });
    await stream.until(() => stream.ended, 'cierre por sesión revocada');
    await eventually(() => service().openStreams === 0, 'canal liberado');
  });

  it('CA-16: el tercer canal simultáneo del mismo usuario recibe 429 y al cerrar uno vuelve a abrir', async () => {
    const first = await open('/orders/stream', ana.auth);
    await open('/orders/stream', ana.auth);
    const third = await open('/orders/stream', ana.auth);
    expect(third.status).toBe(429);
    expect(third.raw).toContain('Demasiados canales');
    first.close();
    await eventually(() => service().openStreams === 1, 'un canal liberado');
    expect((await open('/orders/stream', ana.auth)).status).toBe(200);
    // Otro usuario no se ve afectado por el límite de Ana.
    expect((await open('/orders/stream', bea.auth)).status).toBe(200);
  });

  it('CA-16: más de 30 aperturas por minuto desde una IP reciben 429', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const stream = await open('/orders/stream', ana.auth);
      statuses.push(stream.status);
      stream.close();
      await eventually(() => service().openStreams === 0, 'liberado');
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('CA-17: abrir y cerrar muchos canales no deja suscripciones', async () => {
    for (let round = 0; round < 6; round += 1) {
      const stream = await open('/kitchen/stream', harness.as('operador'));
      await stream.until(() => stream.events.length >= 1, 'ready');
      stream.close();
    }
    await eventually(() => service().openStreams === 0, 'sin canales');
    const order = await create(ana);
    await act('start', order.id);
  });

  it('al apagar la aplicación los canales abiertos se cierran y el apagado no se queda esperando', async () => {
    const other = new CatalogHarness();
    await other.start();
    try {
      const stream = await StreamClient.open(
        other.server,
        '/kitchen/stream',
        other.as('operador'),
      );
      await stream.until(() => stream.events.length >= 1, 'ready');
      await other.app.close();
      await stream.until(() => stream.ended, 'canal cerrado al apagar');
    } finally {
      await other.context.source.destroy().catch(() => undefined);
    }
  });
});
