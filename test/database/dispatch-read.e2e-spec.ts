import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  readyOrders,
} from '../helpers/orders-app';

interface Queue {
  suggestedZoneId: string | null;
  zones: {
    zoneId: string;
    zoneName: string;
    oldestNumber: number;
    orders: OrderBody[];
  }[];
}
interface Round {
  id: string;
  status: string;
  zone: { id: string; name: string };
  courier: { id: string; fullName: string; phone: string };
  etaAt: string;
  finishedAt: string | null;
  orders: OrderBody[];
}
interface Page {
  data: Round[];
  total: number;
  page: number;
  limit: number;
}

describe('Despacho: cola y consulta de rondas (CA-03, CA-04, CA-13, CA-21, CA-25)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const queue = (role: 'repartidor' | 'admin' | 'operador' | 'cliente') =>
    harness.get('/dispatch/queue', role);
  const startRound = (auth: string, body: object = {}) =>
    harness
      .send('post', '/dispatch/rounds', body, 'repartidor')
      .set('Authorization', auth);

  it('CA-03: agrupa por zona, la del pedido más antiguo primero, sin costos', async () => {
    const [first, second, third] = await readyOrders(harness, ana, f, [
      f.flat,
      f.point,
      f.flat,
    ]);
    const response = await queue('repartidor').expect(200);
    const body = response.body as Queue;
    expect(body.zones.map((zone) => zone.zoneName)).toEqual([
      'Zona de Canchas',
      'Zona de Edificio A',
    ]);
    expect(body.suggestedZoneId).toBe(body.zones[0].zoneId);
    expect(body.zones[0].oldestNumber).toBe(first.number);
    expect(body.zones[0].orders.map((o) => o.id)).toEqual([first.id, third.id]);
    expect(body.zones[1].orders.map((o) => o.id)).toEqual([second.id]);
    expect(body.zones[0].orders[0].customer).toEqual({
      name: 'Cliente ana',
      phone: '+573001112233',
    });
    expect(JSON.stringify(body)).not.toMatch(/"cost"|unitCost|lineCost/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('CA-03: solo cuenta los pedidos listo', async () => {
    const [one, two] = await readyOrders(harness, ana, f, [f.point, f.point]);
    await harness.context.source.query(
      `UPDATE "${harness.context.ownedSchema}"."orders" SET status = 'en_preparacion' WHERE id = $1`,
      [one.id],
    );
    const body = (await queue('repartidor').expect(200)).body as Queue;
    expect(body.zones).toHaveLength(1);
    expect(body.zones[0].orders.map((o) => o.id)).toEqual([two.id]);
  });

  it('CA-04: sin pedidos listo responde vacío', async () => {
    const response = await queue('repartidor').expect(200);
    expect(response.body).toEqual({ suggestedZoneId: null, zones: [] });
  });

  it('CA-13: cliente 403 en todo /dispatch; admin y operador consultan; sin sesión 401', async () => {
    const [order] = await readyOrders(harness, ana, f, [f.point]);
    await queue('cliente').expect(403);
    await harness.get('/dispatch/rounds', 'cliente').expect(403);
    await harness.get(`/dispatch/rounds/${order.id}`, 'cliente').expect(403);
    await harness.send('post', '/dispatch/rounds', {}, 'cliente').expect(403);
    await harness
      .send(
        'post',
        `/dispatch/orders/${order.id}/deliver`,
        undefined,
        'cliente',
      )
      .expect(403);
    await harness.get('/dispatch/stream', 'cliente').expect(403);
    for (const role of ['admin', 'operador'] as const) {
      await queue(role).expect(200);
      await harness.get('/dispatch/rounds', role).expect(200);
      await harness.send('post', '/dispatch/rounds', {}, role).expect(403);
      await harness
        .send('post', `/dispatch/orders/${order.id}/deliver`, undefined, role)
        .expect(403);
      await harness
        .send(
          'post',
          `/dispatch/orders/${order.id}/fail`,
          { reason: 'x' },
          role,
        )
        .expect(403);
    }
    await harness.get('/dispatch/queue').expect(401);
    await harness.get('/dispatch/rounds').expect(401);
    await harness
      .send('post', '/dispatch/rounds', {}, 'repartidor')
      .set('Authorization', 'Bearer invalido')
      .expect(401);
  });

  it('CA-21: el repartidor ve solo sus rondas; admin y operador todas; paginado y filtro', async () => {
    const other = await harness.courier('otro');
    await readyOrders(harness, ana, f, [f.point, f.flat]);
    const mine = (await startRound(harness.as('repartidor'), {}).expect(201))
      .body as Round;
    const theirs = (await startRound(other.auth, {}).expect(201)).body as Round;
    expect(mine.id).not.toBe(theirs.id);

    const own = (
      await harness.get('/dispatch/rounds', 'repartidor').expect(200)
    ).body as Page;
    expect(own.data.map((r) => r.id)).toEqual([mine.id]);
    expect(own.data[0].orders).toHaveLength(1);
    expect(own.data[0].courier).toMatchObject({
      fullName: 'Carlos Repartidor',
      phone: '+573001234500',
    });

    const all = (await harness.get('/dispatch/rounds', 'admin').expect(200))
      .body as Page;
    expect(all.total).toBe(2);
    expect(all.data.map((r) => r.id)).toEqual([theirs.id, mine.id]);
    const paged = (
      await harness
        .get('/dispatch/rounds?limit=1&page=2', 'operador')
        .expect(200)
    ).body as Page;
    expect(paged.data.map((r) => r.id)).toEqual([mine.id]);
    expect(paged.total).toBe(2);

    const finished = (
      await harness
        .get('/dispatch/rounds?status=finalizada', 'admin')
        .expect(200)
    ).body as Page;
    expect(finished.total).toBe(0);
    await harness.get('/dispatch/rounds?status=otra', 'admin').expect(400);

    const detail = await harness
      .get(`/dispatch/rounds/${mine.id}`, 'repartidor')
      .expect(200);
    expect((detail.body as Round).orders[0].customer.phone).toBe(
      '+573001112233',
    );
    await harness
      .get(`/dispatch/rounds/${theirs.id}`, 'repartidor')
      .expect(404);
    await harness.get(`/dispatch/rounds/${theirs.id}`, 'admin').expect(200);
    await harness.get('/dispatch/rounds/no-es-uuid', 'admin').expect(400);
    await harness
      .get('/dispatch/rounds/4f6c2b8e-3b1a-4c5d-9e7f-1a2b3c4d5e6f', 'admin')
      .expect(404);
  });
});
