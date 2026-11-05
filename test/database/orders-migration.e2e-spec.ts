import { Orders1791244807000 } from '../../src/database/migrations/1791244807000-orders';
import { Customer } from '../../src/customers/entities/customer.entity';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../../src/delivery/entities/delivery-zone.entity';
import { Product } from '../../src/products/entities/products.entity';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de pedidos (CA-01, CA-02)', () => {
  let context: TestDatabase;
  let customerId: string;
  let pointId: string;
  let productId: string;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    const user = await context.source
      .getRepository(User)
      .save({ username: 'cli', role: 'cliente', passwordHash: 'x' });
    customerId = user.id;
    await context.source.getRepository(Customer).save({
      userId: user.id,
      email: 'cli@example.com',
      fullName: 'Cliente Uno',
      phone: '+573001112233',
    });
    const zone = await context.source
      .getRepository(DeliveryZone)
      .save({ name: 'Zona 1' });
    pointId = (
      await context.source
        .getRepository(DeliveryPoint)
        .save({ zoneId: zone.id, name: 'Edificio A', floors: 2 })
    ).id;
    productId = (
      await context.source.getRepository(Product).save({
        sku: 'CAF-CAPU',
        name: 'Capuchino',
        category: 'cafe',
        price: 4500,
        cost: 1600,
      })
    ).id;
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const qualified = (name: string) => `"${context.ownedSchema}"."${name}"`;
  const tables = async () =>
    (
      await context.source.query<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name LIKE 'order%' ORDER BY 1`,
        [context.ownedSchema],
      )
    ).map((row) => row.table_name);
  const movementColumn = async () =>
    (
      await context.source.query<unknown[]>(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'stock_movements' AND column_name = 'order_id'`,
        [context.ownedSchema],
      )
    ).length === 1;
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      await new Orders1791244807000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const insertOrder = (
    values: Partial<{
      status: string;
      total: number;
      floor: number | null;
      key: string;
      paymentStatus: string;
      cancelledBy: string | null;
      last4: string;
    }> = {},
  ) => {
    const row = {
      status: 'recibido',
      total: 4500,
      floor: 1,
      key: '11111111-1111-4111-8111-111111111111',
      paymentStatus: 'aprobado',
      cancelledBy: null,
      last4: '4242',
      ...values,
    };
    return context.source.query<{ id: string; number: number }[]>(
      `INSERT INTO ${qualified('orders')}
         (customer_id, status, point_id, point_name, zone_name, floor, total,
          payment_method, payment_last4, payment_status, idempotency_key, request_hash, cancelled_by)
       VALUES ($1, $2, $3, 'Edificio A', 'Zona 1', $4, $5, 'tarjeta_demo', $6, $7, $8, $9, $10)
       RETURNING id, number`,
      [
        customerId,
        row.status,
        pointId,
        row.floor,
        row.total,
        row.last4,
        row.paymentStatus,
        row.key,
        'a'.repeat(64),
        row.cancelledBy,
      ],
    );
  };

  it('CA-01: crea las tablas y la columna; down() aborta con pedidos y limpia sin ellos', async () => {
    expect(await tables()).toEqual([
      'order_events',
      'order_item_components',
      'order_items',
      'orders',
    ]);
    expect(await movementColumn()).toBe(true);
    const [order] = await insertOrder();
    expect(order.number).toBe(1001);
    await expect(revert()).rejects.toThrow(/existen pedidos registrados/);
    expect(await tables()).toHaveLength(4);
    await context.source.query(`DELETE FROM ${qualified('orders')}`);
    await revert();
    expect(await tables()).toEqual([]);
    expect(await movementColumn()).toBe(false);
  });

  it('CA-01: el número de pedido es consecutivo', async () => {
    const [first] = await insertOrder({
      key: '11111111-1111-4111-8111-111111111111',
    });
    const [second] = await insertOrder({
      key: '22222222-2222-4222-8222-222222222222',
    });
    expect(second.number).toBe(first.number + 1);
  });

  it('CA-02: rechaza estado, total y piso inválidos', async () => {
    await expect(insertOrder({ status: 'perdido' })).rejects.toThrow(
      /orders_status_valid/,
    );
    await expect(insertOrder({ total: 0 })).rejects.toThrow(
      /orders_total_range/,
    );
    await expect(insertOrder({ total: 200001 })).rejects.toThrow(
      /orders_total_range/,
    );
    await expect(insertOrder({ floor: 31 })).rejects.toThrow(
      /orders_floor_range/,
    );
    await expect(insertOrder({ last4: '42' })).rejects.toThrow();
  });

  it('CA-02: la cancelación y el reembolso van siempre juntos', async () => {
    await expect(insertOrder({ paymentStatus: 'reembolsado' })).rejects.toThrow(
      /orders_cancel_consistent/,
    );
    await expect(
      insertOrder({ status: 'cancelado', cancelledBy: customerId }),
    ).rejects.toThrow(/orders_cancel_consistent/);
    await insertOrder({
      status: 'cancelado',
      paymentStatus: 'reembolsado',
      cancelledBy: customerId,
    });
  });

  it('CA-02: la clave de idempotencia es única por cliente', async () => {
    await insertOrder();
    await expect(insertOrder()).rejects.toThrow(/orders_idempotency_key/);
  });

  it('CA-02: rechaza cantidades y líneas inconsistentes', async () => {
    const [order] = await insertOrder();
    const item = (quantity: number, lineTotal: number) =>
      context.source.query(
        `INSERT INTO ${qualified('order_items')}
           (order_id, product_id, sku, name, category, quantity, unit_price, unit_cost, line_total)
         VALUES ($1, $2, 'CAF-CAPU', 'Capuchino', 'cafe', $3, 4500, 1600, $4)`,
        [order.id, productId, quantity, lineTotal],
      );
    await expect(item(0, 0)).rejects.toThrow(/order_items_quantity_range/);
    await expect(item(11, 49500)).rejects.toThrow(/order_items_quantity_range/);
    await expect(item(2, 4500)).rejects.toThrow(/order_items_line_total/);
    await item(2, 9000);
  });

  it('CA-02: no permite borrar un producto, punto o cliente con pedidos', async () => {
    const [order] = await insertOrder();
    await context.source.query(
      `INSERT INTO ${qualified('order_items')}
         (order_id, product_id, sku, name, category, quantity, unit_price, unit_cost, line_total)
       VALUES ($1, $2, 'CAF-CAPU', 'Capuchino', 'cafe', 1, 4500, 1600, 4500)`,
      [order.id, productId],
    );
    await expect(
      context.source.query(
        `DELETE FROM ${qualified('products')} WHERE id = $1`,
        [productId],
      ),
    ).rejects.toThrow(/order_items_product_id_fkey/);
    await expect(
      context.source.query(
        `DELETE FROM ${qualified('delivery_points')} WHERE id = $1`,
        [pointId],
      ),
    ).rejects.toThrow(/orders_point_id_fkey/);
    await expect(
      context.source.query(
        `DELETE FROM ${qualified('customers')} WHERE user_id = $1`,
        [customerId],
      ),
    ).rejects.toThrow(/orders_customer_id_fkey/);
  });
});
