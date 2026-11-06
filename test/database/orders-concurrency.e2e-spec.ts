import { randomUUID } from 'node:crypto';
import { Order } from '../../src/orders/entities/order.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { Product } from '../../src/products/entities/products.entity';
import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';
import request from 'supertest';

describe('Pedidos: concurrencia (CA-18, CA-19, CA-25)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const stockOf = async (id: string) => (await harness.stored(id)).stock;

  it('CA-18: diez peticiones con la misma clave crean un solo pedido', async () => {
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        placeOrder(
          harness,
          ana,
          validBody(f, { items: [{ productId: f.combo, quantity: 1 }] }),
          key,
        ),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 201,
    ]);
    const ids = new Set(
      responses.map((response) => (response.body as OrderBody).id),
    );
    expect(ids.size).toBe(1);
    expect(await harness.context.source.getRepository(Order).count()).toBe(1);
    expect(
      await harness.context.source.getRepository(StockMovement).count(),
    ).toBe(2);
    expect(await stockOf(f.capu.id)).toBe(9);
    expect(await stockOf(f.pan.id)).toBe(9);
  });

  it('CA-19: dos clientes compran a la vez la última unidad', async () => {
    const bea = await harness.customer('bea');
    await harness.context.source
      .getRepository(Product)
      .update(f.capu.id, { stock: 1 });
    const [a, b] = await Promise.all([
      placeOrder(harness, ana, validBody(f)),
      placeOrder(harness, bea, validBody(f)),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(f.capu.id)).toBe(0);
    expect(await harness.context.source.getRepository(Order).count()).toBe(1);
  });

  it('CA-19: pedidos cruzados con los mismos productos no se interbloquean', async () => {
    const bea = await harness.customer('bea');
    const items = (first: string, second: string) => [
      { productId: first, quantity: 1 },
      { productId: second, quantity: 1 },
    ];
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        placeOrder(
          harness,
          index % 2 === 0 ? ana : bea,
          validBody(f, {
            items:
              index % 2 === 0
                ? items(f.capu.id, f.pan.id)
                : items(f.pan.id, f.capu.id),
          }),
        ),
      ),
    );
    expect(results.map((response) => response.status)).toEqual([
      201, 201, 201, 201,
    ]);
    expect(await stockOf(f.capu.id)).toBe(6);
    expect(await stockOf(f.pan.id)).toBe(6);
  });

  it('CA-25: cancelaciones simultáneas del mismo pedido devuelven el saldo una sola vez', async () => {
    const order = (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;
    expect(await stockOf(f.capu.id)).toBe(9);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(harness.server)
          .post(`/api/v1/orders/${order.id}/cancel`)
          .set('Authorization', ana.auth)
          .send({}),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409, 409, 409,
    ]);
    expect(await stockOf(f.capu.id)).toBe(10);
    expect(
      await harness.context.source
        .getRepository(StockMovement)
        .count({ where: { orderId: order.id, type: 'IN' } }),
    ).toBe(1);
  });
});
