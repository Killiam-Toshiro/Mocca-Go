import { randomUUID } from 'node:crypto';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  forceOrder,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

interface SurveyBody {
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

describe('Encuesta: responder y verla en el pedido (CA-03 a CA-09, CA-19)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let bea: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    bea = await harness.customer('bea');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const order = async (who: Customer, status = 'entregado') => {
    const created = (await placeOrder(harness, who, validBody(f)).expect(201))
      .body as OrderBody;
    const at = new Date('2026-11-03T15:00:00Z');
    await forceOrder(harness, created.id, who, {
      status,
      createdAt: at,
      events: { recibido: at },
    });
    return created;
  };
  const answer = (id: string, body: object, auth = ana.auth) =>
    harness
      .send('post', `/orders/${id}/survey`, body, 'cliente')
      .set('Authorization', auth);
  const read = (who: Customer, id: string) =>
    harness.get(`/orders/${id}`).set('Authorization', who.auth);
  const count = async () =>
    (
      await harness.context.source.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "${harness.context.ownedSchema}"."order_surveys"`,
      )
    )[0].total;
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;

  it('CA-03 y CA-09: el cliente responde y el pedido muestra su encuesta', async () => {
    const placed = await order(ana);
    expect(((await read(ana, placed.id)).body as OrderBody).survey).toBeNull();
    const response = await answer(placed.id, {
      rating: 5,
      comment: '  Llegó caliente y rápido  ',
    }).expect(201);
    const body = response.body as SurveyBody;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      orderId: placed.id,
      rating: 5,
      comment: 'Llegó caliente y rápido',
    });
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date');
    const seen = (await read(ana, placed.id)).body as OrderBody;
    expect(seen.survey).toMatchObject({
      rating: 5,
      comment: 'Llegó caliente y rápido',
    });
    for (const role of ['admin', 'operador'] as const) {
      const staff = await harness.get(`/orders/${placed.id}`, role).expect(200);
      expect((staff.body as OrderBody).survey).toMatchObject({ rating: 5 });
    }
    const list = await harness.get('/orders', 'admin').expect(200);
    expect(
      (list.body as { data: OrderBody[] }).data.find((o) => o.id === placed.id)
        ?.survey,
    ).toMatchObject({ rating: 5 });
  });

  it('CA-03: el comentario es opcional', async () => {
    const placed = await order(ana);
    const response = await answer(placed.id, { rating: 3 }).expect(201);
    expect((response.body as SurveyBody).comment).toBeNull();
  });

  it('CA-04: solo se responde un pedido entregado', async () => {
    for (const status of [
      'recibido',
      'en_preparacion',
      'listo',
      'en_camino',
      'no_entregado',
      'cancelado',
    ]) {
      const placed = await order(ana, status);
      const response = await answer(placed.id, { rating: 4 }).expect(409);
      expect(message(response)).toContain(status);
    }
    expect(await count()).toBe(0);
  });

  it('CA-05: una sola respuesta por pedido, también en paralelo', async () => {
    const placed = await order(ana);
    const attempts = await Promise.all(
      [1, 2, 3, 4, 5].map((rating) => answer(placed.id, { rating })),
    );
    expect(attempts.map((a) => a.status).sort()).toEqual([
      201, 409, 409, 409, 409,
    ]);
    expect(await count()).toBe(1);
    const again = await answer(placed.id, { rating: 2 }).expect(409);
    expect(message(again)).toContain('ya tiene una respuesta');
  });

  it('CA-06: un pedido ajeno o inexistente es 404', async () => {
    const hers = await order(bea);
    await answer(hers.id, { rating: 5 }).expect(404);
    await answer(randomUUID(), { rating: 5 }).expect(404);
    await answer('no-es-uuid', { rating: 5 }).expect(400);
    expect(await count()).toBe(0);
  });

  it('CA-07: un cuerpo inválido es 400 y no guarda nada', async () => {
    const placed = await order(ana);
    for (const body of [
      {},
      { comment: 'sin calificación' },
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: '4' },
      { rating: null },
      { rating: 4, comment: '' },
      { rating: 4, comment: '   ' },
      { rating: 4, comment: 'x'.repeat(301) },
      { rating: 4, comment: null },
      { rating: 4, comment: 5 },
      { rating: 4, comment: 'a\u0000b' },
      { rating: 4, otro: 1 },
    ])
      await answer(placed.id, body).expect(400);
    expect(await count()).toBe(0);
    await answer(placed.id, { rating: 4, comment: 'x'.repeat(300) }).expect(
      201,
    );
  });

  it('CA-08: los demás roles no responden y sin sesión es 401', async () => {
    const placed = await order(ana);
    for (const role of ['admin', 'operador', 'repartidor'] as const)
      await harness
        .send('post', `/orders/${placed.id}/survey`, { rating: 5 }, role)
        .expect(403);
    await harness
      .send('post', `/orders/${placed.id}/survey`, { rating: 5 }, 'cliente')
      .set('Authorization', 'Bearer invalido')
      .expect(401);
    expect(await count()).toBe(0);
  });

  it('CA-19: un cliente con encuestas no se elimina (409)', async () => {
    const placed = await order(ana);
    await answer(placed.id, { rating: 5 }).expect(201);
    await harness.send('delete', `/users/${ana.id}`).expect(409);
  });
});
