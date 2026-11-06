import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { Order, OrderStatus } from '../../src/orders/entities/order.entity';
import { Product } from '../../src/products/entities/products.entity';
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

describe('Pedidos: lectura y cancelación (CA-20 a CA-24, CA-26)', () => {
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

  const stockOf = async (id: string) => (await harness.stored(id)).stock;
  const create = async (who: Customer, extra: object = {}) =>
    (await placeOrder(harness, who, validBody(f, extra)).expect(201))
      .body as OrderBody;
  /** Los estados de reparto exigen una ronda (RN-84): se crea una de apoyo. */
  const setStatus = async (id: string, status: OrderStatus) => {
    const schema = harness.context.ownedSchema;
    let roundId: string | null = null;
    if (['en_camino', 'entregado', 'no_entregado'].includes(status)) {
      const [round] = await harness.context.source.query<{ id: string }[]>(
        `INSERT INTO "${schema}"."dispatch_rounds"
           (courier_id, zone_id, zone_name, status, started_at, eta_at)
         SELECT (SELECT id FROM "${schema}"."users" WHERE role = 'repartidor' LIMIT 1),
                p.zone_id, o.zone_name, 'activa', now(), now() + interval '15 minutes'
           FROM "${schema}"."orders" o JOIN "${schema}"."delivery_points" p ON p.id = o.point_id
          WHERE o.id = $1
         RETURNING id`,
        [id],
      );
      roundId = round.id;
    }
    await harness.context.source.query(
      `UPDATE "${schema}"."orders"
       SET status = $2::varchar, cancelled_by = NULL, payment_status = 'aprobado', round_id = $3,
           failure_reason = CASE WHEN $2::varchar = 'no_entregado' THEN 'Sin respuesta' ELSE NULL END
       WHERE id = $1`,
      [id, status, roundId],
    );
  };
  const cancel = (auth: string, id: string, body: object = {}) =>
    request(harness.server)
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', auth)
      .send(body);

  it('CA-20: el cliente lista solo los suyos, el más reciente primero y paginados', async () => {
    const first = await create(ana);
    const second = await create(ana);
    await create(bea);
    const all = (
      await harness
        .get('/orders', undefined)
        .set('Authorization', ana.auth)
        .expect(200)
    ).body as Page;
    expect(all.total).toBe(2);
    expect(all.data.map((order) => order.id)).toEqual([second.id, first.id]);
    const paged = (
      await harness
        .get('/orders?limit=1&page=2')
        .set('Authorization', ana.auth)
        .expect(200)
    ).body as Page;
    expect(paged).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(paged.data.map((order) => order.id)).toEqual([first.id]);
    const response = await harness
      .get('/orders')
      .set('Authorization', ana.auth);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('CA-20: detalle propio y ajeno', async () => {
    const mine = await create(ana);
    const theirs = await create(bea);
    const detail = await harness
      .get(`/orders/${mine.id}`)
      .set('Authorization', ana.auth)
      .expect(200);
    expect((detail.body as OrderBody).id).toBe(mine.id);
    await harness
      .get(`/orders/${theirs.id}`)
      .set('Authorization', ana.auth)
      .expect(404);
    await harness
      .get(`/orders/${randomUUID()}`)
      .set('Authorization', ana.auth)
      .expect(404);
    await harness
      .get('/orders/no-es-uuid')
      .set('Authorization', ana.auth)
      .expect(400);
    await harness
      .get('/orders?status=perdido')
      .set('Authorization', ana.auth)
      .expect(400);
  });

  it('CA-21: admin y operador ven todos con datos del cliente y filtran por estado', async () => {
    const one = await create(ana);
    await create(bea);
    for (const role of ['admin', 'operador'] as const) {
      const all = (await harness.get('/orders', role).expect(200)).body as Page;
      expect(all.total).toBe(2);
      expect(all.data.map((order) => order.customer.name).sort()).toEqual([
        'Cliente ana',
        'Cliente bea',
      ]);
      await harness.get(`/orders/${one.id}`, role).expect(200);
    }
    await setStatus(one.id, 'en_preparacion');
    const filtered = (
      await harness.get('/orders?status=en_preparacion', 'admin').expect(200)
    ).body as Page;
    expect(filtered.data.map((order) => order.id)).toEqual([one.id]);
    expect(
      (
        (await harness.get('/orders?status=entregado', 'admin').expect(200))
          .body as Page
      ).total,
    ).toBe(0);
  });

  it('CA-21: el repartidor y quien no inició sesión no acceden', async () => {
    const one = await create(ana);
    await harness.get('/orders', 'repartidor').expect(403);
    await harness.get(`/orders/${one.id}`, 'repartidor').expect(403);
    await cancel(harness.as('repartidor'), one.id).expect(403);
    await harness.get('/orders').expect(401);
    await harness.get(`/orders/${one.id}`).expect(401);
    await request(harness.server)
      .post(`/api/v1/orders/${one.id}/cancel`)
      .send({})
      .expect(401);
  });

  it('CA-22: el cliente cancela su pedido recibido y recupera el saldo', async () => {
    const order = await create(ana, {
      items: [
        { productId: f.capu.id, quantity: 2 },
        { productId: f.combo, quantity: 1 },
      ],
    });
    expect(await stockOf(f.capu.id)).toBe(7);
    const response = await cancel(ana.auth, order.id).expect(200);
    const cancelled = response.body as OrderBody;
    expect(cancelled).toMatchObject({
      status: 'cancelado',
      cancelReason: null,
      payment: { status: 'reembolsado' },
    });
    expect(cancelled.events.map((event) => event.status)).toEqual([
      'recibido',
      'cancelado',
    ]);
    expect(await stockOf(f.capu.id)).toBe(10);
    expect(await stockOf(f.pan.id)).toBe(10);
    const movements = await harness.context.source
      .getRepository(StockMovement)
      .find({ where: { orderId: order.id, type: 'IN' } });
    expect(movements.map((m) => [m.quantity, m.reason]).sort()).toEqual([
      [1, 'Cancelación del pedido #1001'],
      [3, 'Cancelación del pedido #1001'],
    ]);
  });

  it('CA-23: no se cancela dos veces, ni el pedido ajeno, ni fuera de estado', async () => {
    const order = await create(ana);
    await cancel(bea.auth, order.id).expect(404);
    await cancel(ana.auth, order.id).expect(200);
    const again = await cancel(ana.auth, order.id).expect(409);
    expect((again.body as ErrorBody).message).toContain('cancelado');
    await cancel(harness.as('admin'), order.id, { reason: 'Otra vez' }).expect(
      409,
    );
    expect(await stockOf(f.capu.id)).toBe(10);
    const second = await create(ana);
    await setStatus(second.id, 'en_preparacion');
    await cancel(ana.auth, second.id).expect(409);
    for (const status of ['listo', 'en_camino', 'entregado'] as const) {
      await setStatus(second.id, status);
      await cancel(harness.as('admin'), second.id, { reason: 'Tarde' }).expect(
        409,
      );
    }
    expect(await stockOf(f.capu.id)).toBe(9);
    await cancel(ana.auth, randomUUID()).expect(404);
    await cancel(ana.auth, 'no-es-uuid').expect(400);
  });

  it('CA-24: admin y operador cancelan con motivo en recibido y en preparación', async () => {
    const received = await create(ana);
    const preparing = await create(ana);
    await setStatus(preparing.id, 'en_preparacion');
    await cancel(harness.as('admin'), received.id).expect(400);
    await cancel(harness.as('admin'), received.id, { reason: '' }).expect(400);
    const byAdmin = await cancel(harness.as('admin'), received.id, {
      reason: 'Producto dañado',
    }).expect(200);
    expect(byAdmin.body as OrderBody).toMatchObject({
      status: 'cancelado',
      cancelReason: 'Producto dañado',
    });
    const byOperator = await cancel(harness.as('operador'), preparing.id, {
      reason: 'El cliente lo pidió',
    }).expect(200);
    expect((byOperator.body as OrderBody).status).toBe('cancelado');
    expect(await stockOf(f.capu.id)).toBe(10);
  });

  it('CA-24: cancelar devuelve el saldo aunque el producto se haya desactivado', async () => {
    const order = await create(ana);
    await harness.context.source
      .getRepository(Product)
      .update(f.capu.id, { active: false });
    await cancel(ana.auth, order.id).expect(200);
    expect(await stockOf(f.capu.id)).toBe(10);
  });

  it('un cliente con pedidos no se elimina (409) y conserva su historial', async () => {
    const order = await create(ana);
    const response = await harness
      .send('delete', `/users/${ana.id}`)
      .expect(409);
    expect((response.body as ErrorBody).message).toContain(
      'no se puede eliminar',
    );
    await harness
      .get(`/orders/${order.id}`)
      .set('Authorization', ana.auth)
      .expect(200);
  });

  it('CA-26: el historial de movimientos muestra el pedido y deja null en los manuales', async () => {
    await harness
      .send(
        'post',
        '/movements',
        { productId: f.pan.id, type: 'IN', quantity: 1, reason: 'Compra' },
        'operador',
      )
      .expect(201);
    const order = await create(ana);
    await cancel(ana.auth, order.id).expect(200);
    const list = (await harness.get('/movements', 'admin').expect(200))
      .body as {
      data: { orderId: string | null; type: string; reason: string }[];
    };
    const linked = list.data.filter((m) => m.orderId === order.id);
    expect(linked.map((m) => m.type).sort()).toEqual(['IN', 'OUT']);
    expect(list.data.filter((m) => m.orderId === null)).toHaveLength(1);
    const stored = await harness.context.source
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(stored.status).toBe('cancelado');
    expect(stored.cancelledBy).toBe(ana.id);
  });
});
