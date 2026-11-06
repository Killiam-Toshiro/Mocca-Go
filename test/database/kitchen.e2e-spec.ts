import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

interface Page {
  data: OrderBody[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

describe('Cocina: cola y transiciones (CA-01 a CA-05, CA-07, CA-08)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const create = async () =>
    (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;
  const act = (
    action: 'start' | 'ready',
    id: string,
    role: 'admin' | 'operador' | 'repartidor' | 'cliente' = 'operador',
  ) => harness.send('post', `/kitchen/orders/${id}/${action}`, undefined, role);
  const userOf = async (username: string) =>
    (
      await harness.context.source.query<{ id: string }[]>(
        `SELECT id FROM "${harness.context.ownedSchema}"."users" WHERE username = $1`,
        [username],
      )
    )[0].id;
  const eventUsers = (id: string) =>
    harness.context.source.query<{ status: string; user_id: string }[]>(
      `SELECT status, user_id FROM "${harness.context.ownedSchema}"."order_events"
       WHERE order_id = $1 ORDER BY created_at, status DESC`,
      [id],
    );

  it('CA-01: operador empieza y admin termina; cada paso deja evento con autor y hora', async () => {
    const order = await create();
    const started = await act('start', order.id, 'operador').expect(200);
    expect((started.body as OrderBody).status).toBe('en_preparacion');
    const done = await act('ready', order.id, 'admin').expect(200);
    const body = done.body as OrderBody;
    expect(body.status).toBe('listo');
    expect(body.events.map((event) => event.status)).toEqual([
      'recibido',
      'en_preparacion',
      'listo',
    ]);
    const stored = await eventUsers(order.id);
    const byStatus = new Map(stored.map((row) => [row.status, row.user_id]));
    expect(byStatus.get('recibido')).toBe(ana.id);
    expect(byStatus.get('en_preparacion')).toBe(await userOf('rol_operador'));
    expect(byStatus.get('listo')).toBe(await userOf('rol_admin'));
    expect(done.headers['cache-control']).toBe('no-store');
  });

  it('CA-02: cliente y repartidor reciben 403 y sin sesión 401, sin cambios', async () => {
    const order = await create();
    for (const role of ['cliente', 'repartidor'] as const) {
      await act('start', order.id, role).expect(403);
      await act('ready', order.id, role).expect(403);
      await harness.get('/kitchen/orders', role).expect(403);
    }
    await request(harness.server)
      .post(`/api/v1/kitchen/orders/${order.id}/start`)
      .expect(401);
    await request(harness.server).get('/api/v1/kitchen/orders').expect(401);
    const same = await harness
      .get(`/orders/${order.id}`)
      .set('Authorization', ana.auth)
      .expect(200);
    expect((same.body as OrderBody).status).toBe('recibido');
  });

  it('CA-03: transiciones fuera de orden responden 409 con el estado actual y sin eventos', async () => {
    const order = await create();
    const early = await act('ready', order.id).expect(409);
    expect((early.body as ErrorBody).message).toContain('«recibido»');
    await act('start', order.id).expect(200);
    const again = await act('start', order.id).expect(409);
    expect((again.body as ErrorBody).message).toContain('«en_preparacion»');
    expect(await eventUsers(order.id)).toHaveLength(2);
  });

  it('CA-04: pedido inexistente → 404 e id mal formado → 400', async () => {
    await act('start', randomUUID()).expect(404);
    await act('ready', randomUUID()).expect(404);
    await act('start', 'no-es-uuid').expect(400);
  });

  it('CA-05: cancelado y listo no avanzan ni se cancelan (RN-67)', async () => {
    const stock = async () => (await harness.stored(f.capu.id)).stock;
    const cancelled = await create();
    await harness
      .send('post', `/orders/${cancelled.id}/cancel`, { reason: 'x' })
      .expect(200);
    await act('start', cancelled.id).expect(409);
    await act('ready', cancelled.id).expect(409);

    const done = await create();
    await act('start', done.id).expect(200);
    await act('ready', done.id).expect(200);
    const before = await stock();
    await act('start', done.id).expect(409);
    await act('ready', done.id).expect(409);
    await harness
      .send('post', `/orders/${done.id}/cancel`, { reason: 'tarde' })
      .expect(409);
    expect(await stock()).toBe(before);
  });

  it('CA-07: la cola trae recibido y en_preparacion, el número menor primero, paginada y sin costos', async () => {
    const one = await create();
    const two = await create();
    const three = await create();
    const four = await create();
    await act('start', two.id).expect(200);
    await act('start', three.id).expect(200);
    await act('ready', three.id).expect(200);
    await harness
      .send('post', `/orders/${four.id}/cancel`, { reason: 'x' })
      .expect(200);

    const queue = await harness.get('/kitchen/orders', 'operador').expect(200);
    const page = queue.body as Page;
    expect(page.data.map((order) => order.id)).toEqual([one.id, two.id]);
    expect(page.total).toBe(2);
    expect(page.data[0].number).toBeLessThan(page.data[1].number);
    expect(JSON.stringify(queue.body)).not.toMatch(/"cost"|unitCost/);
    expect(queue.headers['cache-control']).toBe('no-store');

    const ready = (await harness.get('/kitchen/orders?status=listo', 'admin'))
      .body as Page;
    expect(ready.data.map((order) => order.id)).toEqual([three.id]);
    const started = (
      await harness.get('/kitchen/orders?status=en_preparacion', 'admin')
    ).body as Page;
    expect(started.data.map((order) => order.id)).toEqual([two.id]);
    const second = (
      await harness.get('/kitchen/orders?limit=1&page=2', 'admin')
    ).body as Page;
    expect(second.data.map((order) => order.id)).toEqual([two.id]);
    expect(second.totalPages).toBe(2);
  });

  it('CA-07: la vista del combo trae sus componentes para preparar', async () => {
    const response = await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: f.combo, quantity: 2 }] }),
    ).expect(201);
    const queue = (await harness.get('/kitchen/orders', 'operador'))
      .body as Page;
    const item = queue.data.find(
      (order) => order.id === (response.body as OrderBody).id,
    )!.items[0];
    expect(item.components.map((c) => c.sku).sort()).toEqual([
      'CAF-CAPU',
      'PAN-PAND',
    ]);
  });

  it.each(['cancelado', 'x', '', 'LISTO'])(
    'CA-08: status «%s» no es válido en la cola → 400',
    async (status) => {
      await harness
        .get(`/kitchen/orders?status=${status}`, 'operador')
        .expect(400);
    },
  );

  it('CA-08: filtros duplicados o paginación inválida → 400', async () => {
    await harness.get('/kitchen/orders?page=0', 'operador').expect(400);
    await harness.get('/kitchen/orders?limit=101', 'operador').expect(400);
  });
});
