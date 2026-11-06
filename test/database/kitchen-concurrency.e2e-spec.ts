import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

describe('Cocina: concurrencia (CA-06)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const events = (id: string) =>
    harness.context.source.query<{ status: string }[]>(
      `SELECT status FROM "${harness.context.ownedSchema}"."order_events" WHERE order_id = $1`,
      [id],
    );

  it('seis operadores empiezan el mismo pedido a la vez: uno gana, el resto recibe 409', async () => {
    const order = (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;
    const roles = ['operador', 'admin'] as const;
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        harness.send(
          'post',
          `/kitchen/orders/${order.id}/start`,
          undefined,
          roles[index % 2],
        ),
      ),
    );
    const codes = attempts.map((attempt) => attempt.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409, 409]);
    expect((await events(order.id)).map((e) => e.status).sort()).toEqual([
      'en_preparacion',
      'recibido',
    ]);
  });

  it('lo mismo al marcar listo, y la cancelación simultánea no deja estados cruzados', async () => {
    const order = (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;
    await harness
      .send('post', `/kitchen/orders/${order.id}/start`, undefined, 'operador')
      .expect(200);
    const attempts = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        harness.send(
          'post',
          `/kitchen/orders/${order.id}/ready`,
          undefined,
          'operador',
        ),
      ),
      harness.send('post', `/orders/${order.id}/cancel`, { reason: 'carrera' }),
    ]);
    const ready = attempts.slice(0, 4).filter((a) => a.status === 200).length;
    const cancelled = attempts[4].status === 200;
    // O gana la cocina (y la cancelación recibe 409) o gana la cancelación
    // (y ninguna de las cuatro marcas de «listo» prospera): nunca ambas.
    expect(ready + (cancelled ? 1 : 0)).toBe(1);
    const statuses = (await events(order.id)).map((e) => e.status).sort();
    expect(statuses).toEqual(
      cancelled
        ? ['cancelado', 'en_preparacion', 'recibido']
        : ['en_preparacion', 'listo', 'recibido'],
    );
    const stock = (await harness.stored(f.capu.id)).stock;
    expect(stock).toBe(cancelled ? 10 : 9);
  });
});
