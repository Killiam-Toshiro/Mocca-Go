import { randomUUID } from 'node:crypto';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  readyOrders,
} from '../helpers/orders-app';

interface Round {
  id: string;
  status: string;
  zone: { id: string; name: string };
  startedAt: string;
  etaAt: string;
  orders: OrderBody[];
}

describe('Despacho: crear ronda (CA-05 a CA-12)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const create = (body: object = {}, auth = harness.as('repartidor')) =>
    harness
      .send('post', '/dispatch/rounds', body, 'repartidor')
      .set('Authorization', auth);
  const statuses = async () =>
    Object.fromEntries(
      (
        await harness.context.source.query<{ id: string; status: string }[]>(
          `SELECT id, status FROM "${harness.context.ownedSchema}"."orders"`,
        )
      ).map((row) => [row.id, row.status]),
    );
  const count = async (table: string) =>
    (
      await harness.context.source.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "${harness.context.ownedSchema}"."${table}"`,
      )
    )[0].total;
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;

  it('CA-05: la sugerencia toma la zona del pedido más antiguo; salen en camino con evento y ETA', async () => {
    const [a, b, c] = await readyOrders(harness, ana, f, [
      f.flat,
      f.point,
      f.flat,
    ]);
    const before = Date.now();
    const response = await create().expect(201);
    const round = response.body as Round;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(round.status).toBe('activa');
    expect(round.zone.name).toBe('Zona de Canchas');
    expect(round.orders.map((o) => o.id)).toEqual([a.id, c.id]);
    expect(round.orders.every((o) => o.status === 'en_camino')).toBe(true);
    const started = new Date(round.startedAt).getTime();
    expect(started).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(round.etaAt).getTime() - started).toBe(15 * 60_000);
    expect(await statuses()).toMatchObject({
      [a.id]: 'en_camino',
      [c.id]: 'en_camino',
      [b.id]: 'listo',
    });
    const events = await harness.context.source.query<
      { order_id: string; status: string; user_id: string }[]
    >(
      `SELECT order_id, status, user_id FROM "${harness.context.ownedSchema}"."order_events" WHERE status = 'en_camino'`,
    );
    expect(events.map((e) => e.order_id).sort()).toEqual([a.id, c.id].sort());
    const courier = await harness.context.source.query<{ id: string }[]>(
      `SELECT id FROM "${harness.context.ownedSchema}"."users" WHERE username = 'rol_repartidor'`,
    );
    expect(new Set(events.map((e) => e.user_id))).toEqual(
      new Set([courier[0].id]),
    );
  });

  it('CA-06: con más de 5 pedidos en la zona toma solo los 5 más antiguos', async () => {
    const orders = await readyOrders(
      harness,
      ana,
      f,
      Array.from({ length: 7 }, () => f.point),
    );
    const round = (await create().expect(201)).body as Round;
    expect(round.orders.map((o) => o.id)).toEqual(
      orders.slice(0, 5).map((o) => o.id),
    );
    const left = await statuses();
    expect(left[orders[5].id]).toBe('listo');
    expect(left[orders[6].id]).toBe('listo');
  });

  it('CA-07: sin pedidos listo → 409 y no se crea la ronda', async () => {
    const response = await create().expect(409);
    expect(message(response)).toContain('No hay pedidos listos');
    expect(await count('dispatch_rounds')).toBe(0);
  });

  it('CA-08: ruta propia con pedidos de una zona; el resto no se toca', async () => {
    const orders = await readyOrders(harness, ana, f, [
      f.point,
      f.point,
      f.point,
    ]);
    const chosen = [orders[2].id, orders[0].id];
    const round = (await create({ orderIds: chosen }).expect(201))
      .body as Round;
    expect(round.orders.map((o) => o.id).sort()).toEqual([...chosen].sort());
    expect((await statuses())[orders[1].id]).toBe('listo');
  });

  it('CA-09: zonas mezcladas → 409; el resto de formas inválidas → 400; nada cambia', async () => {
    const [a, b] = await readyOrders(harness, ana, f, [f.point, f.flat]);
    const mixed = await create({ orderIds: [a.id, b.id] }).expect(409);
    expect(message(mixed)).toContain('una sola zona');
    const id = a.id;
    const six = Array.from({ length: 6 }, () => randomUUID());
    for (const body of [
      { orderIds: [] },
      { orderIds: [id, id] },
      { orderIds: six },
      { orderIds: 'x' },
      { orderIds: ['no-uuid'] },
      { orderIds: [id], otro: 1 },
      { orderIds: null },
    ])
      await create(body).expect(400);
    expect(await count('dispatch_rounds')).toBe(0);
    expect(await statuses()).toMatchObject({
      [a.id]: 'listo',
      [b.id]: 'listo',
    });
  });

  it('CA-10: pedido inexistente → 404; no listo → 409; no se crea ni se mueve nada', async () => {
    const [a, b] = await readyOrders(harness, ana, f, [f.point, f.point]);
    await create({ orderIds: [a.id, randomUUID()] }).expect(404);
    await harness.context.source.query(
      `UPDATE "${harness.context.ownedSchema}"."orders" SET status = 'en_preparacion' WHERE id = $1`,
      [b.id],
    );
    const response = await create({ orderIds: [a.id, b.id] }).expect(409);
    expect(message(response)).toContain(`#${b.number}`);
    expect(await count('dispatch_rounds')).toBe(0);
    expect((await statuses())[a.id]).toBe('listo');
  });

  it('CA-11: máximo 2 rondas activas; al cerrar una puede crear otra', async () => {
    const orders = await readyOrders(harness, ana, f, [
      f.point,
      f.point,
      f.point,
    ]);
    const first = (await create({ orderIds: [orders[0].id] }).expect(201))
      .body as Round;
    await create({ orderIds: [orders[1].id] }).expect(201);
    const third = await create({ orderIds: [orders[2].id] }).expect(409);
    expect(message(third)).toContain('2 rondas activas');
    expect((await statuses())[orders[2].id]).toBe('listo');
    await harness
      .send(
        'post',
        `/dispatch/orders/${first.orders[0].id}/deliver`,
        undefined,
        'repartidor',
      )
      .expect(200);
    await create({ orderIds: [orders[2].id] }).expect(201);
  });

  it('CA-12: repartidor sin teléfono o sin nombre → 409 indicando qué falta', async () => {
    await readyOrders(harness, ana, f, [f.point]);
    const noPhone = await harness.courier('sin_tel', {
      phone: null,
      fullName: 'Sin Teléfono',
    });
    expect(message(await create({}, noPhone.auth).expect(409))).toContain(
      'el teléfono',
    );
    const nothing = await harness.courier('nada', {
      phone: null,
      fullName: null,
    });
    const response = await create({}, nothing.auth).expect(409);
    expect(message(response)).toContain('el nombre completo ni el teléfono');
    expect(await count('dispatch_rounds')).toBe(0);
  });
});
