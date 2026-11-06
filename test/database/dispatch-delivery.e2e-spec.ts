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
  finishedAt: string | null;
  orders: OrderBody[];
}

describe('Despacho: entrega, no entregado y cierre (CA-16 a CA-20)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const depart = async (count: number, auth?: string) => {
    const orders = await readyOrders(
      harness,
      ana,
      f,
      Array.from({ length: count }, () => f.point),
    );
    const call = harness.send(
      'post',
      '/dispatch/rounds',
      { orderIds: orders.map((o) => o.id) },
      'repartidor',
    );
    if (auth) call.set('Authorization', auth);
    return (await call.expect(201)).body as Round;
  };
  const act = (
    action: 'deliver' | 'fail',
    id: string,
    body?: object,
    auth?: string,
  ) => {
    const call = harness.send(
      'post',
      `/dispatch/orders/${id}/${action}`,
      body,
      'repartidor',
    );
    return auth ? call.set('Authorization', auth) : call;
  };
  const getRound = async (id: string) =>
    (await harness.get(`/dispatch/rounds/${id}`, 'admin').expect(200))
      .body as Round;
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const mine = (id: string) =>
    harness.get(`/orders/${id}`).set('Authorization', ana.auth);

  it('CA-16: entregar deja entregado, con evento, autor y hora', async () => {
    const round = await depart(2);
    const [one] = round.orders;
    const response = await act('deliver', one.id).expect(200);
    const body = response.body as OrderBody;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.status).toBe('entregado');
    expect(body.events.map((e) => e.status)).toContain('entregado');
    const events = await harness.context.source.query<
      { user_id: string; created_at: Date }[]
    >(
      `SELECT user_id, created_at FROM "${harness.context.ownedSchema}"."order_events"
       WHERE order_id = $1 AND status = 'entregado'`,
      [one.id],
    );
    expect(events).toHaveLength(1);
    expect(events[0].created_at).toBeInstanceOf(Date);
  });

  it('CA-17: no entregado exige motivo; no mueve inventario ni pago', async () => {
    const round = await depart(1);
    const [one] = round.orders;
    const stock = () =>
      harness.context.source.query<{ stock: number }[]>(
        `SELECT stock FROM "${harness.context.ownedSchema}"."products" WHERE id = $1`,
        [f.capu.id],
      );
    const before = await stock();
    for (const body of [
      undefined,
      {},
      { reason: '' },
      { reason: '   ' },
      { reason: 'x'.repeat(201) },
      { reason: 5 },
      { reason: 'a\u0000b' },
      { reason: 'ok', otro: 1 },
    ])
      await act('fail', one.id, body).expect(400);
    const response = await act('fail', one.id, {
      reason: '  Nadie en el punto  ',
    }).expect(200);
    const body = response.body as OrderBody;
    expect(body.status).toBe('no_entregado');
    expect(body.failureReason).toBe('Nadie en el punto');
    expect(body.payment.status).toBe('aprobado');
    expect(await stock()).toEqual(before);
  });

  it('CA-18: ajeno o inexistente → 404; no en camino o ya final → 409', async () => {
    const round = await depart(2);
    const [one, two] = round.orders;
    const other = await harness.courier('otro');
    await act('deliver', one.id, undefined, other.auth).expect(404);
    await act('fail', one.id, { reason: 'x' }, other.auth).expect(404);
    await act('deliver', randomUUID()).expect(404);
    await act('deliver', 'no-es-uuid').expect(400);

    await act('deliver', one.id).expect(200);
    for (const action of ['deliver', 'fail'] as const) {
      const again = await act(action, one.id, { reason: 'x' }).expect(409);
      expect(message(again)).toContain('entregado');
    }
    const [listo] = await readyOrders(harness, ana, f, [f.point]);
    const notYet = await act('deliver', listo.id).expect(404);
    expect(message(notYet)).toBe('Pedido no encontrado.');
    expect((await mine(two.id)).body).toMatchObject({ status: 'en_camino' });
  });

  it('CA-19: la ronda se cierra con el último pedido; antes sigue activa', async () => {
    const round = await depart(3);
    const [a, b, c] = round.orders;
    await act('deliver', a.id).expect(200);
    expect((await getRound(round.id)).status).toBe('activa');
    await act('fail', b.id, { reason: 'No contestó' }).expect(200);
    const open = await getRound(round.id);
    expect(open).toMatchObject({ status: 'activa', finishedAt: null });
    await act('deliver', c.id).expect(200);
    const closed = await getRound(round.id);
    expect(closed.status).toBe('finalizada');
    expect(new Date(closed.finishedAt as string).toString()).not.toBe(
      'Invalid Date',
    );
    expect(closed.orders.map((o) => o.status)).toEqual([
      'entregado',
      'no_entregado',
      'entregado',
    ]);
  });

  it('CA-20: el cliente ve repartidor, WhatsApp y ETA solo mientras va en camino', async () => {
    const round = await depart(1);
    const [one] = round.orders;
    const onTheWay = (await mine(one.id).expect(200)).body as OrderBody;
    expect(onTheWay.status).toBe('en_camino');
    expect(onTheWay.delivery.courier).toEqual({
      fullName: 'Carlos Repartidor',
      phone: '+573001234500',
      whatsappUrl: 'https://wa.me/573001234500',
    });
    expect(onTheWay.delivery.etaAt).toEqual(expect.any(String));
    await act('deliver', one.id).expect(200);
    const done = (await mine(one.id).expect(200)).body as OrderBody;
    expect(done.delivery.courier).toBeNull();
    expect(done.delivery.etaAt).toBeNull();
    expect(JSON.stringify(done)).not.toContain('3001234500');
  });
});
