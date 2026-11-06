import { randomUUID } from 'node:crypto';
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
import { MetricsView } from '../../src/metrics/metrics.view';

const at = (iso: string, plusMinutes = 0) =>
  new Date(new Date(iso).getTime() + plusMinutes * 60_000);

describe('Métricas del negocio (CA-11 a CA-18)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let bea: Customer;
  let f: Fixture;
  let category: string;
  beforeAll(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    bea = await harness.customer('bea');
    f = await fixture(harness);

    const make = async (
      who: Customer,
      point: Fixture['point'],
      status: string,
      created: string,
      minutes: { listo?: number; en_camino?: number; entregado?: number } = {},
      rate?: number,
    ) => {
      const placed = (
        await placeOrder(
          harness,
          who,
          validBody(f, {
            pointId: point.id,
            ...(point === f.flat ? { floor: undefined } : {}),
          }),
        ).expect(201)
      ).body as OrderBody;
      category = placed.items[0].category;
      const start = new Date(created);
      const events: Record<string, Date> = { recibido: start };
      for (const [name, m] of Object.entries(minutes))
        events[name] = at(created, m);
      await forceOrder(harness, placed.id, who, {
        status,
        createdAt: start,
        events,
      });
      if (rate)
        await harness.context.source.query(
          `INSERT INTO "${harness.context.ownedSchema}"."order_surveys" (order_id, customer_id, rating) VALUES ($1, $2, $3)`,
          [placed.id, who.id, rate],
        );
    };
    // Zona de Edificio A (Ana)
    await make(
      ana,
      f.point,
      'entregado',
      '2026-11-02T15:00:00Z',
      { listo: 10, en_camino: 14, entregado: 24 },
      5,
    );
    await make(
      ana,
      f.point,
      'entregado',
      '2026-11-02T16:00:00Z',
      { listo: 20, en_camino: 25, entregado: 45 },
      3,
    );
    await make(ana, f.point, 'cancelado', '2026-11-03T15:00:00Z');
    await make(ana, f.point, 'no_entregado', '2026-11-03T16:00:00Z', {
      listo: 5,
      en_camino: 8,
    });
    await make(ana, f.point, 'recibido', '2026-11-04T15:00:00Z');
    // Zona de Canchas (Bea): 23:30 del 2 de noviembre en Colombia
    await make(
      bea,
      f.flat,
      'entregado',
      '2026-11-03T04:30:00Z',
      { listo: 5, en_camino: 6, entregado: 16 },
      4,
    );
    // Fuera del periodo
    await make(bea, f.flat, 'entregado', '2026-10-20T15:00:00Z', {
      listo: 5,
      en_camino: 6,
      entregado: 16,
    });
    // Cambia el costo del producto: las ventas ya hechas conservan el suyo (RN-109)
    await harness.context.source.query(
      `UPDATE "${harness.context.ownedSchema}"."products" SET cost = 3000`,
    );
  });
  afterAll(() => harness.stop());

  const metrics = (
    query = '',
    role: 'admin' | 'operador' | 'cliente' | 'repartidor' = 'admin',
  ) => harness.get(`/metrics${query}`, role);
  const range = '?from=2026-11-01&to=2026-11-05';
  const report = async (query = range) =>
    (await metrics(query).expect(200)).body as MetricsView;

  it('CA-11: ventas por día en hora de Colombia, con ceros en los días sin ventas', async () => {
    const response = await metrics(range).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { sales, period } = response.body as MetricsView;
    expect(period).toEqual({
      from: '2026-11-01',
      to: '2026-11-05',
      days: 5,
      zoneId: null,
    });
    expect(sales).toMatchObject({
      orders: 5,
      revenue: 22500,
      averageTicket: 4500,
    });
    expect(sales.daily).toEqual([
      { date: '2026-11-01', orders: 0, revenue: 0 },
      { date: '2026-11-02', orders: 3, revenue: 13500 },
      { date: '2026-11-03', orders: 1, revenue: 4500 },
      { date: '2026-11-04', orders: 1, revenue: 4500 },
      { date: '2026-11-05', orders: 0, revenue: 0 },
    ]);
  });

  it('CA-12: margen con el costo guardado en cada línea', async () => {
    const { margin } = await report();
    expect(margin).toMatchObject({
      revenue: 22500,
      variableCost: 8000,
      margin: 14500,
      variableCostRate: 0.3556,
    });
    expect(margin.byCategory).toEqual([
      expect.objectContaining({ category, revenue: 22500, variableCost: 8000 }),
    ]);
  });

  it('CA-13 y CA-14: tiempos del reparto, a tiempo y etapas', async () => {
    const { delivery } = await report();
    expect(delivery).toMatchObject({
      onTimeThresholdMinutes: 15,
      delivered: 3,
      onTimeRate: 0.6667,
      totalMinutes: { average: 28.3, median: 24, p90: 40.8 },
      stageMinutes: { kitchen: 11.7, waiting: 3.3, delivery: 13.3 },
    });
    expect(delivery.byZone).toEqual([
      expect.objectContaining({
        zoneName: 'Zona de Canchas',
        delivered: 1,
        onTimeRate: 1,
      }),
      expect.objectContaining({
        zoneName: 'Zona de Edificio A',
        delivered: 2,
        onTimeRate: 0.5,
      }),
    ]);
    expect(delivery.byZone[1].totalMinutes.average).toBe(34.5);
  });

  it('CA-15: satisfacción', async () => {
    const { satisfaction } = await report();
    expect(satisfaction).toEqual({
      responses: 3,
      average: 4,
      responseRate: 1,
      distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 },
    });
  });

  it('CA-16: recompra', async () => {
    const { retention } = await report();
    expect(retention).toEqual({
      customers: 2,
      repeatCustomers: 1,
      repeatRate: 0.5,
    });
  });

  it('CA-17: resultados de los pedidos del periodo', async () => {
    const { outcomes } = await report();
    expect(outcomes).toEqual({
      entregado: 3,
      no_entregado: 1,
      cancelado: 1,
      enCurso: 1,
    });
  });

  it('CA-18: filtro por zona', async () => {
    const zoneId = f.point.zoneId;
    const body = await report(`${range}&zoneId=${zoneId}`);
    expect(body.period.zoneId).toBe(zoneId);
    expect(body.sales).toMatchObject({ orders: 4, revenue: 18000 });
    expect(body.outcomes).toEqual({
      entregado: 2,
      no_entregado: 1,
      cancelado: 1,
      enCurso: 1,
    });
    expect(body.delivery.byZone).toHaveLength(1);
    expect(body.satisfaction.responses).toBe(2);
    expect(body.retention).toMatchObject({ customers: 1, repeatCustomers: 1 });
    const empty = await metrics(`?from=2026-01-01&to=2026-01-02`).expect(200);
    const none = empty.body as MetricsView;
    expect(none.sales).toMatchObject({
      orders: 0,
      revenue: 0,
      averageTicket: 0,
    });
    expect(none.delivery).toMatchObject({ delivered: 0, onTimeRate: null });
    expect(none.delivery.totalMinutes.average).toBeNull();
    expect(none.satisfaction).toMatchObject({ responses: 0, average: null });
    expect(none.retention.repeatRate).toBeNull();
  });

  it('periodo por defecto y errores', async () => {
    const body = (await metrics().expect(200)).body as MetricsView;
    expect(body.period.days).toBe(30);
    for (const query of [
      '?from=2026-11-06&to=2026-11-05',
      '?from=2024-01-01&to=2026-11-05',
      '?from=2026-02-30',
      '?to=ayer',
      '?zoneId=no-es-uuid',
    ])
      await metrics(query).expect(400);
    await metrics(`?zoneId=${randomUUID()}`).expect(404);
  });

  it('solo el admin: los demás roles 403 y sin sesión 401', async () => {
    for (const role of ['operador', 'cliente', 'repartidor'] as const)
      await metrics('', role).expect(403);
    await harness.get('/metrics').expect(401);
  });
});
