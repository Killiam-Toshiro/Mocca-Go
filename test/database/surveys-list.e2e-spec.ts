import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  forceOrder,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

interface Row {
  orderId: string;
  number: number;
  rating: number;
  comment: string | null;
  customer: { name: string };
  zoneName: string;
  createdAt: string;
}
interface Page {
  data: Row[];
  total: number;
  page: number;
  limit: number;
}

describe('Encuesta: listado para el admin (CA-10)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  let orders: OrderBody[];
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
    orders = [];
    const ratings = [5, 3, 4];
    for (const [index, rating] of ratings.entries()) {
      const placed = (await placeOrder(harness, ana, validBody(f)).expect(201))
        .body as OrderBody;
      const at = new Date('2026-11-03T15:00:00Z');
      await forceOrder(harness, placed.id, ana, {
        status: 'entregado',
        createdAt: at,
        events: { recibido: at },
      });
      await harness
        .send(
          'post',
          `/orders/${placed.id}/survey`,
          { rating, comment: `c${index}` },
          'cliente',
        )
        .set('Authorization', ana.auth)
        .expect(201);
      orders.push(placed);
    }
    // Fechas conocidas: la primera respuesta el 1 de noviembre a las 23:30 en Colombia.
    const dates = [
      '2026-11-01T23:30:00-05:00',
      '2026-11-02T10:00:00-05:00',
      '2026-11-03T10:00:00-05:00',
    ];
    for (const [index, placed] of orders.entries())
      await harness.context.source.query(
        `UPDATE "${harness.context.ownedSchema}"."order_surveys" SET created_at = $2 WHERE order_id = $1`,
        [placed.id, dates[index]],
      );
  });
  afterEach(() => harness.stop());

  const list = (
    query = '',
    role: 'admin' | 'operador' | 'cliente' | 'repartidor' = 'admin',
  ) => harness.get(`/surveys${query}`, role);

  it('la más reciente primero, con cliente, zona y número de pedido', async () => {
    const response = await list().expect(200);
    const body = response.body as Page;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.total).toBe(3);
    expect(body.data.map((row) => row.rating)).toEqual([4, 3, 5]);
    expect(body.data[0]).toMatchObject({
      orderId: orders[2].id,
      number: orders[2].number,
      comment: 'c2',
      customer: { name: 'Cliente ana' },
      zoneName: 'Zona de Edificio A',
    });
  });

  it('filtra por calificación y por rango de fechas en hora de Colombia', async () => {
    expect(
      ((await list('?rating=5').expect(200)).body as Page).data,
    ).toHaveLength(1);
    const from = (await list('?from=2026-11-02').expect(200)).body as Page;
    expect(from.data.map((r) => r.rating)).toEqual([4, 3]);
    const to = (await list('?to=2026-11-01').expect(200)).body as Page;
    expect(to.data.map((r) => r.rating)).toEqual([5]);
    const both = (await list('?from=2026-11-02&to=2026-11-02').expect(200))
      .body as Page;
    expect(both.data.map((r) => r.rating)).toEqual([3]);
    const combined = (
      await list('?rating=3&from=2026-11-01&to=2026-11-03').expect(200)
    ).body as Page;
    expect(combined.total).toBe(1);
  });

  it('pagina', async () => {
    const page = (await list('?limit=2&page=2').expect(200)).body as Page;
    expect(page).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(page.data.map((r) => r.rating)).toEqual([5]);
  });

  it('valores inválidos son 400', async () => {
    for (const query of [
      '?rating=0',
      '?rating=6',
      '?rating=x',
      '?from=2026-13-01',
      '?from=2026-02-30',
      '?to=ayer',
      '?from=2026-11-05&to=2026-11-01',
      '?limit=0',
    ])
      await list(query).expect(400);
  });

  it('solo el admin: los demás roles 403 y sin sesión 401', async () => {
    for (const role of ['operador', 'cliente', 'repartidor'] as const)
      await list('', role).expect(403);
    await harness.get('/surveys').expect(401);
  });
});
