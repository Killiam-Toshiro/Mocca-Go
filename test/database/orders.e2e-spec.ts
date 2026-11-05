import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../../src/delivery/entities/delivery-zone.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { Order } from '../../src/orders/entities/order.entity';
import { Product } from '../../src/products/entities/products.entity';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  APPROVED,
  Customer,
  DECLINED,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

describe('Pedidos: creación y pago (CA-03 a CA-17, CA-27)', () => {
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
  const orderCount = () => harness.context.source.getRepository(Order).count();
  const movementCount = () =>
    harness.context.source.getRepository(StockMovement).count();

  it('CA-03: crea un pedido con producto simple y combo, con copia de precios y sin costos', async () => {
    const response = await placeOrder(
      harness,
      ana,
      validBody(f, {
        items: [
          { productId: f.capu.id, quantity: 2 },
          { productId: f.combo, quantity: 1 },
        ],
        deliveryNote: 'Junto a la puerta',
        note: 'Sin azúcar',
      }),
    ).expect(201);
    const order = response.body as OrderBody;
    expect(order).toMatchObject({
      number: 1001,
      status: 'recibido',
      total: 15000,
      note: 'Sin azúcar',
      delivery: {
        pointId: f.point.id,
        pointName: 'Edificio A',
        floor: 2,
        deliveryNote: 'Junto a la puerta',
      },
      payment: { method: 'tarjeta_demo', last4: '4242', status: 'aprobado' },
      customer: { name: 'Cliente ana', phone: '+573001112233' },
      cancelReason: null,
    });
    expect(order.items.map((item) => item.sku)).toEqual([
      'CAF-CAPU',
      'CMB-UNO',
    ]);
    expect(order.items[0]).toMatchObject({
      name: 'Capuchino',
      quantity: 2,
      unitPrice: 4500,
      lineTotal: 9000,
      components: [],
    });
    expect(order.items[1].components.map((c) => c.sku)).toEqual([
      'CAF-CAPU',
      'PAN-PAND',
    ]);
    expect(order.events).toHaveLength(1);
    expect(order.events[0].status).toBe('recibido');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toMatch(
      /unitCost|"cost"|requestHash|idempotency/i,
    );
  });

  it('CA-03: los siguientes pedidos reciben el siguiente número', async () => {
    const first = await placeOrder(harness, ana, validBody(f)).expect(201);
    const second = await placeOrder(harness, ana, validBody(f)).expect(201);
    expect((second.body as OrderBody).number).toBe(
      (first.body as OrderBody).number + 1,
    );
  });

  it('CA-04: descuenta el saldo con un OUT por producto simple ligado al pedido', async () => {
    const response = await placeOrder(
      harness,
      ana,
      validBody(f, {
        items: [
          { productId: f.capu.id, quantity: 2 },
          { productId: f.combo, quantity: 1 },
        ],
      }),
    ).expect(201);
    const order = response.body as OrderBody;
    expect(await stockOf(f.capu.id)).toBe(7);
    expect(await stockOf(f.pan.id)).toBe(9);
    const movements = await harness.context.source
      .getRepository(StockMovement)
      .find({ where: { orderId: order.id }, order: { quantity: 'DESC' } });
    expect(
      movements.map((m) => [m.productId, m.type, m.quantity, m.reason]),
    ).toEqual([
      [f.capu.id, 'OUT', 3, 'Pedido #1001'],
      [f.pan.id, 'OUT', 1, 'Pedido #1001'],
    ]);
    expect(movements.every((m) => m.userId === ana.id)).toBe(true);
  });

  it('CA-05: solo el cliente compra; la autorización va antes de validar', async () => {
    for (const role of ['admin', 'operador', 'repartidor'] as const) {
      await placeOrder(harness, harness.as(role), validBody(f)).expect(403);
      await placeOrder(harness, harness.as(role), { extra: 1 }).expect(403);
    }
    await request(harness.server)
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send(validBody(f))
      .expect(401);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(f.capu.id)).toBe(10);
  });

  it('CA-06: rechaza cuerpos inválidos sin efectos', async () => {
    const bodies = [
      validBody(f, { items: [] }),
      validBody(f, {
        items: Array.from({ length: 11 }, () => ({
          productId: randomUUID(),
          quantity: 1,
        })),
      }),
      validBody(f, { items: [{ productId: f.capu.id, quantity: 0 }] }),
      validBody(f, { items: [{ productId: f.capu.id, quantity: 11 }] }),
      validBody(f, {
        items: [
          { productId: f.capu.id, quantity: 1 },
          { productId: f.capu.id, quantity: 2 },
        ],
      }),
      validBody(f, { extra: true }),
      validBody(f, { payment: undefined }),
      validBody(f, { note: '   ' }),
    ];
    for (const body of bodies) await placeOrder(harness, ana, body).expect(400);
    expect(await orderCount()).toBe(0);
    expect(await movementCount()).toBe(0);
  });

  it('CA-07: producto inexistente, inactivo o agotado', async () => {
    await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: randomUUID(), quantity: 1 }] }),
    ).expect(404);
    await harness.context.source
      .getRepository(Product)
      .update(f.capu.id, { soldOut: true });
    const soldOut = await placeOrder(harness, ana, validBody(f)).expect(409);
    expect((soldOut.body as ErrorBody).message).toContain('Capuchino');
    await harness.context.source
      .getRepository(Product)
      .update(f.capu.id, { soldOut: false, active: false });
    await placeOrder(harness, ana, validBody(f)).expect(409);
    expect(await orderCount()).toBe(0);
  });

  it('CA-07: un combo con un componente sin saldo no se puede pedir', async () => {
    await harness.context.source
      .getRepository(Product)
      .update(f.pan.id, { stock: 0 });
    const response = await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: f.combo, quantity: 1 }] }),
    ).expect(409);
    expect((response.body as ErrorBody).message).toContain('Combo Uno');
    expect(await stockOf(f.capu.id)).toBe(10);
    expect(await orderCount()).toBe(0);
  });

  it('CA-08: el total no puede superar 200.000 COP', async () => {
    const dear = await harness.simple('CAR-001', {
      name: 'Caro',
      price: 150000,
      stock: 5,
    });
    await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: dear.id, quantity: 2 }] }),
    ).expect(400);
    expect(await stockOf(dear.id)).toBe(5);
    await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: dear.id, quantity: 1 }] }),
    ).expect(201);
  });

  it('CA-09: punto inexistente, inactivo o con zona inactiva', async () => {
    await placeOrder(
      harness,
      ana,
      validBody(f, { pointId: randomUUID() }),
    ).expect(404);
    await harness.context.source
      .getRepository(DeliveryPoint)
      .update(f.point.id, { active: false });
    await placeOrder(harness, ana, validBody(f)).expect(409);
    await harness.context.source
      .getRepository(DeliveryPoint)
      .update(f.point.id, { active: true });
    await harness.context.source
      .getRepository(DeliveryZone)
      .update(f.point.zoneId, { active: false });
    await placeOrder(harness, ana, validBody(f)).expect(409);
    expect(await orderCount()).toBe(0);
  });

  it('CA-10: el piso se exige y se acota según el punto', async () => {
    for (const floor of [undefined, 0, 4])
      await placeOrder(harness, ana, validBody(f, { floor })).expect(400);
    await placeOrder(
      harness,
      ana,
      validBody(f, { pointId: f.flat.id, floor: 1 }),
    ).expect(400);
    const flat = await placeOrder(
      harness,
      ana,
      validBody(f, { pointId: f.flat.id, floor: undefined }),
    ).expect(201);
    expect((flat.body as OrderBody).delivery.floor).toBeNull();
    const top = await placeOrder(
      harness,
      ana,
      validBody(f, { floor: 3 }),
    ).expect(201);
    expect((top.body as OrderBody).delivery.floor).toBe(3);
  });

  it('CA-11: una tarjeta rechazada responde 402 sin pedido, sin saldo movido y sin gastar la clave', async () => {
    const key = randomUUID();
    const declined = await placeOrder(
      harness,
      ana,
      validBody(f, {
        payment: { method: 'tarjeta_demo', cardNumber: DECLINED },
      }),
      key,
    ).expect(402);
    expect((declined.body as ErrorBody).message).toBe('Pago rechazado.');
    expect(await orderCount()).toBe(0);
    expect(await movementCount()).toBe(0);
    expect(await stockOf(f.capu.id)).toBe(10);
    await placeOrder(harness, ana, validBody(f), key).expect(201);
  });

  it('CA-12: una tarjeta desconocida o mal formada responde 400', async () => {
    for (const cardNumber of [
      '4111111111111111',
      '4242',
      '4242 4242 4242 4242',
    ])
      await placeOrder(
        harness,
        ana,
        validBody(f, { payment: { method: 'tarjeta_demo', cardNumber } }),
      ).expect(400);
    await placeOrder(
      harness,
      ana,
      validBody(f, { payment: { method: 'efectivo', cardNumber: APPROVED } }),
    ).expect(400);
    expect(await orderCount()).toBe(0);
  });

  it('CA-13: el número de tarjeta no se guarda ni se devuelve', async () => {
    const response = await placeOrder(harness, ana, validBody(f)).expect(201);
    expect(response.text).not.toContain(APPROVED);
    const rows = await harness.context.source.query<{ doc: string }[]>(
      `SELECT row_to_json(o)::text AS doc FROM "${harness.context.ownedSchema}"."orders" o`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].doc).not.toContain(APPROVED);
    expect(rows[0].doc).toContain('4242');
  });

  it('CA-14: sin saldo suficiente en un producto no se mueve ninguno', async () => {
    await harness.context.source
      .getRepository(Product)
      .update(f.capu.id, { stock: 1 });
    const response = await placeOrder(
      harness,
      ana,
      validBody(f, {
        items: [
          { productId: f.pan.id, quantity: 1 },
          { productId: f.capu.id, quantity: 2 },
        ],
      }),
    ).expect(409);
    expect((response.body as ErrorBody).message).toContain('Capuchino');
    expect(await stockOf(f.capu.id)).toBe(1);
    expect(await stockOf(f.pan.id)).toBe(10);
    expect(await orderCount()).toBe(0);
    expect(await movementCount()).toBe(0);
  });

  it('CA-15: exige un Idempotency-Key UUID', async () => {
    await placeOrder(harness, ana, validBody(f), null).expect(400);
    await placeOrder(harness, ana, validBody(f), 'no-es-uuid').expect(400);
    expect(await orderCount()).toBe(0);
  });

  it('CA-16: repetir la clave con el mismo contenido devuelve el pedido sin descontar de nuevo', async () => {
    const key = randomUUID();
    const first = await placeOrder(harness, ana, validBody(f), key).expect(201);
    const again = await placeOrder(harness, ana, validBody(f), key).expect(200);
    expect((again.body as OrderBody).id).toBe((first.body as OrderBody).id);
    expect(await stockOf(f.capu.id)).toBe(9);
    expect(await orderCount()).toBe(1);
  });

  it('CA-17: la misma clave con otro contenido responde 409', async () => {
    const key = randomUUID();
    await placeOrder(harness, ana, validBody(f), key).expect(201);
    await placeOrder(
      harness,
      ana,
      validBody(f, { items: [{ productId: f.capu.id, quantity: 2 }] }),
      key,
    ).expect(409);
    // La clave es de cada cliente: otro cliente puede usar el mismo valor.
    const bea = await harness.customer('bea');
    await placeOrder(harness, bea, validBody(f), key).expect(201);
    expect(await stockOf(f.capu.id)).toBe(8);
  });

  it('CA-27: limita POST /orders a 10 por minuto por IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await placeOrder(harness, ana, { items: [] })).status);
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
