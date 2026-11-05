import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { AddressInfo } from 'node:net';
import { createDataSource } from '../../src/database/data-source';
import { executeMigration, withDataSource } from '../../src/database/commands';
import { migrateFromEnvironment } from '../../src/database/migrate';
import { Product } from '../../src/products/entities/products.entity';
import { User } from '../../src/users/entities/user.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  inTestEnvironment,
  TestDatabase,
} from '../helpers/database';

describe('PostgreSQL: migración, integridad y persistencia', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });

  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  async function fixtures() {
    const user = await context.source.getRepository(User).save({
      username: 'fixture_user',
      passwordHash: 'fixture-hash',
      role: 'operador',
    });
    const product = await context.source
      .getRepository(Product)
      .save({ sku: 'FIXTURE-001', name: 'Fixture' });
    return { user, product };
  }

  it('la migración se registra una sola vez y se revierte solo en el esquema descartable', async () => {
    expect(await context.source.runMigrations()).toHaveLength(0);
    await inTestEnvironment(context, () => migrateFromEnvironment('run'));
    const rows = await context.source.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM "${context.ownedSchema}"."schema_migrations"`,
    );
    expect(rows[0].total).toBe(3);
    for (let revertido = 0; revertido < 3; revertido++)
      await inTestEnvironment(context, () => migrateFromEnvironment('revert'));
    const tables = await context.source.query<{ table_name: string }[]>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=$1',
      [context.ownedSchema],
    );
    expect(tables.map((row) => row.table_name)).toEqual(['schema_migrations']);
    await inTestEnvironment(context, () => migrateFromEnvironment('run'));
    expect(await context.source.getRepository(User).count()).toBe(0);
  });

  it('conserva datos y relaciones al cerrar y reabrir la conexión', async () => {
    const { user, product } = await fixtures();
    const movement = await context.source.getRepository(StockMovement).save({
      productId: product.id,
      userId: user.id,
      type: 'IN',
      quantity: 4,
      reason: 'Entrada de prueba',
    });
    await context.source.destroy();
    await context.source.initialize();
    const stored = await context.source
      .getRepository(StockMovement)
      .findOneOrFail({
        where: { id: movement.id },
        relations: { product: true, user: true },
      });
    expect(stored.product.sku).toBe(product.sku);
    expect(stored.user.username).toBe(user.username);
    expect(stored.user.passwordHash).toBeUndefined();
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('rechaza username/SKU duplicados y conserva el registro original', async () => {
    const { user, product } = await fixtures();
    await expect(
      context.source
        .getRepository(User)
        .insert({ username: user.username, passwordHash: 'other-hash' }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(
      context.source
        .getRepository(Product)
        .insert({ sku: product.sku, name: 'Duplicado' }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    expect(await context.source.getRepository(User).count()).toBe(1);
    expect(await context.source.getRepository(Product).count()).toBe(1);
  });

  it.each([
    { sku: 'lowercase', name: 'Producto' },
    { sku: 'VALID', name: '  ' },
    { sku: 'VALID', name: 'Producto', stock: -1 },
  ])('rechaza producto inválido %j', async (values) => {
    await expect(
      context.source.getRepository(Product).insert(values),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it.each([
    { username: 'Uppercase', role: 'operador' },
    { username: 'abc', role: 'superadmin' },
  ])('rechaza usuario inválido %j', async (values) => {
    await expect(
      context.source.getRepository(User).insert({
        ...values,
        passwordHash: 'fixture-hash',
        role: values.role as User['role'],
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it.each([
    { type: 'IN', quantity: 0, reason: 'Prueba' },
    { type: 'OUT', quantity: -1, reason: 'Prueba' },
    { type: 'BAD', quantity: 1, reason: 'Prueba' },
    { type: 'IN', quantity: 1, reason: ' ' },
  ])('rechaza movimiento inválido %j', async (values) => {
    const { user, product } = await fixtures();
    await expect(
      context.source.getRepository(StockMovement).insert({
        ...values,
        type: values.type as StockMovement['type'],
        productId: product.id,
        userId: user.id,
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('rechaza cantidades decimales y referencias inexistentes', async () => {
    const { user, product } = await fixtures();
    const movements = context.source.getRepository(StockMovement);
    await expect(
      movements.insert({
        productId: product.id,
        userId: user.id,
        type: 'IN',
        quantity: 1.5,
        reason: 'Decimal',
      }),
    ).rejects.toMatchObject({ driverError: { code: '22P02' } });
    await expect(
      movements.insert({
        productId: randomUUID(),
        userId: user.id,
        type: 'IN',
        quantity: 1,
        reason: 'FK',
      }),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      movements.insert({
        productId: product.id,
        userId: randomUUID(),
        type: 'IN',
        quantity: 1,
        reason: 'FK',
      }),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('impide borrar usuarios y productos que tienen historial', async () => {
    const { user, product } = await fixtures();
    await context.source.getRepository(StockMovement).save({
      productId: product.id,
      userId: user.id,
      type: 'IN',
      quantity: 1,
      reason: 'Historial',
    });
    await expect(
      context.source.getRepository(User).delete(user.id),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      context.source.getRepository(Product).delete(product.id),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    expect(await context.source.getRepository(StockMovement).count()).toBe(1);
  });

  it('rechaza comandos inválidos antes de abrir conexión', async () => {
    const source = createDataSource(context.config);
    await expect(executeMigration(source, 'invalid')).rejects.toThrow(
      'Comando de migración inválido',
    );
    expect(source.isInitialized).toBe(false);
  });

  it('cierra la conexión cuando falla una operación del comando', async () => {
    const source = createDataSource(context.config);
    await expect(
      withDataSource(source, () =>
        Promise.reject(new Error('operation-failed')),
      ),
    ).rejects.toThrow('operation-failed');
    expect(source.isInitialized).toBe(false);
  });

  it('falla sin ejecutar la operación cuando no puede abrir conexión', async () => {
    const reserve = createServer();
    await new Promise<void>((resolve) =>
      reserve.listen(0, '127.0.0.1', resolve),
    );
    const port = (reserve.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    const source = createDataSource({ ...context.config, DB_PORT: port });
    let executed = false;
    await expect(
      withDataSource(source, () => {
        executed = true;
        return Promise.resolve();
      }),
    ).rejects.toBeDefined();
    expect(executed).toBe(false);
    expect(source.isInitialized).toBe(false);
  });
});
