import { CatalogHarness } from '../helpers/catalog-app';
import { Customer, Fixture, fixture, readyOrders } from '../helpers/orders-app';

interface Round {
  id: string;
  orders: { id: string }[];
}

describe('Despacho: concurrencia (CA-14, CA-15)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const create = (auth: string, body: object = {}) =>
    harness
      .send('post', '/dispatch/rounds', body, 'repartidor')
      .set('Authorization', auth);
  const events = (status: string) =>
    harness.context.source.query<{ order_id: string }[]>(
      `SELECT order_id FROM "${harness.context.ownedSchema}"."order_events" WHERE status = $1`,
      [status],
    );

  it('CA-14: dos repartidores piden la sugerencia a la vez y reciben grupos distintos', async () => {
    const orders = await readyOrders(harness, ana, f, [
      ...Array.from({ length: 3 }, () => f.point),
      ...Array.from({ length: 3 }, () => f.flat),
    ]);
    const one = await harness.courier('uno');
    const two = await harness.courier('dos');
    const [a, b] = await Promise.all([create(one.auth), create(two.auth)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const groups = [a, b].map((r) =>
      (r.body as Round).orders.map((o) => o.id).sort(),
    );
    const taken = groups.flat();
    expect(new Set(taken).size).toBe(orders.length);
    expect(groups[0].some((id) => groups[1].includes(id))).toBe(false);
    expect((await events('en_camino')).map((e) => e.order_id).sort()).toEqual(
      [...taken].sort(),
    );
  });

  it('CA-15: dos repartidores eligen el mismo pedido: uno 201, el otro 409, un solo evento', async () => {
    const [order] = await readyOrders(harness, ana, f, [f.point]);
    const one = await harness.courier('uno');
    const two = await harness.courier('dos');
    const body = { orderIds: [order.id] };
    const [a, b] = await Promise.all([
      create(one.auth, body),
      create(two.auth, body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await events('en_camino')).toHaveLength(1);
    const rounds = await harness.context.source.query<unknown[]>(
      `SELECT id FROM "${harness.context.ownedSchema}"."dispatch_rounds"`,
    );
    expect(rounds).toHaveLength(1);
  });

  it('CA-11: tres rondas simultáneas del mismo repartidor: solo dos prosperan', async () => {
    const orders = await readyOrders(harness, ana, f, [
      f.point,
      f.point,
      f.point,
    ]);
    const attempts = await Promise.all(
      orders.map((order) =>
        create(harness.as('repartidor'), { orderIds: [order.id] }),
      ),
    );
    expect(attempts.map((a) => a.status).sort()).toEqual([201, 201, 409]);
  });
});
