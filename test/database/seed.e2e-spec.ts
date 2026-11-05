import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configuredDataSource,
  withDataSource,
} from '../../src/database/commands';
import { seedCredentials } from '../../src/seed/credentials';
import { Product } from '../../src/products/entities/products.entity';
import { User } from '../../src/users/entities/user.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { runSeed } from '../../src/seed/seed';
import { seedFromEnvironment } from '../../src/seed/main';
import {
  createTestDatabase,
  disposeTestDatabase,
  inTestEnvironment,
  TestDatabase,
} from '../helpers/database';

const credentials = {
  adminPassword: 'Test-only-admin-password',
  operatorPassword: 'Test-only-operator-password',
};

describe('PostgreSQL: seed transaccional', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });

  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  async function balances() {
    const products = await context.source
      .getRepository(Product)
      .find({ order: { sku: 'ASC' } });
    return products.map((product) => product.stock);
  }

  it('carga usuarios, productos, entradas y saldos sin exponer hashes por defecto', async () => {
    expect(await runSeed(context.source, credentials)).toEqual({
      usersCreated: 2,
      productsCreated: 3,
      movementsCreated: 3,
    });
    expect(await balances()).toEqual([20, 30, 10]);
    const users = context.source.getRepository(User);
    expect((await users.findOneByOrFail({ username: 'admin' })).role).toBe(
      'admin',
    );
    expect((await users.findOneByOrFail({ username: 'operador' })).role).toBe(
      'operador',
    );
    expect(
      (await users.findOneByOrFail({ username: 'admin' })).passwordHash,
    ).toBeUndefined();
    const admin = await users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username: 'admin' })
      .getOneOrFail();
    expect(admin.passwordHash).toMatch(/^scrypt\$/);
    expect(admin.passwordHash).not.toBe(credentials.adminPassword);
    expect(await context.source.getRepository(StockMovement).count()).toBe(3);
  });

  it('la segunda ejecución conserva credenciales, roles, catálogo, saldo e historial posterior', async () => {
    await runSeed(context.source, credentials);
    const source = context.source;
    const users = source.getRepository(User);
    const admin = await users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username: 'admin' })
      .getOneOrFail();
    const products = source.getRepository(Product);
    const product = await products.findOneByOrFail({ sku: 'INV-001' });
    await source.transaction(async (manager) => {
      await manager.increment(Product, { id: product.id }, 'stock', 5);
      await manager.getRepository(StockMovement).save({
        productId: product.id,
        userId: admin.id,
        type: 'IN',
        quantity: 5,
        reason: 'Entrada posterior al seed',
      });
    });
    await users.update(admin.id, { role: 'operador' });
    await products.update(product.id, {
      name: 'Nombre editado',
      description: 'Descripción propia',
      active: false,
    });
    expect(
      await runSeed(source, {
        adminPassword: 'Other-valid-admin-password',
        operatorPassword: 'Other-valid-operator-password',
      }),
    ).toEqual({ usersCreated: 0, productsCreated: 0, movementsCreated: 0 });
    const stored = await users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: admin.id })
      .getOneOrFail();
    expect(stored.passwordHash).toBe(admin.passwordHash);
    expect(stored.role).toBe('operador');
    expect(await products.findOneByOrFail({ id: product.id })).toMatchObject({
      name: 'Nombre editado',
      description: 'Descripción propia',
      active: false,
      stock: 25,
    });
    expect(await source.getRepository(StockMovement).count()).toBe(4);
  });

  it('dos ejecuciones simultáneas aplican cada entrada una sola vez', async () => {
    const results = await Promise.all([
      runSeed(context.source, credentials),
      runSeed(context.source, credentials),
    ]);
    expect(
      results.reduce((total, result) => total + result.usersCreated, 0),
    ).toBe(2);
    expect(
      results.reduce((total, result) => total + result.movementsCreated, 0),
    ).toBe(3);
    expect(await balances()).toEqual([20, 30, 10]);
    expect(await context.source.getRepository(User).count()).toBe(2);
    expect(await context.source.getRepository(StockMovement).count()).toBe(3);
  });

  it('agrega la entrada faltante a un SKU existente sin reemplazar catálogo ni saldo previo', async () => {
    await context.source
      .getRepository(Product)
      .save({ sku: 'INV-001', name: 'Producto propio', stock: 7 });
    expect(await runSeed(context.source, credentials)).toEqual({
      usersCreated: 2,
      productsCreated: 2,
      movementsCreated: 3,
    });
    expect(
      await context.source
        .getRepository(Product)
        .findOneByOrFail({ sku: 'INV-001' }),
    ).toMatchObject({ name: 'Producto propio', stock: 27 });
  });

  it('revierte toda la carga si falla después de crear usuarios y dos entradas', async () => {
    const products = context.source.getRepository(Product);
    const original = await products.save({
      sku: 'INV-003',
      name: 'Inactivo previo',
      active: false,
      stock: 5,
    });
    await expect(runSeed(context.source, credentials)).rejects.toThrow(
      'producto inactivo',
    );
    expect(await context.source.getRepository(User).count()).toBe(0);
    expect(await products.count()).toBe(1);
    expect(await products.findOneByOrFail({ id: original.id })).toMatchObject({
      stock: 5,
      active: false,
    });
    expect(await context.source.getRepository(StockMovement).count()).toBe(0);
  });

  it('un movimiento inválido revierte también el cambio de saldo en la misma transacción', async () => {
    await runSeed(context.source, credentials);
    const product = await context.source
      .getRepository(Product)
      .findOneByOrFail({ sku: 'INV-001' });
    const admin = await context.source
      .getRepository(User)
      .findOneByOrFail({ username: 'admin' });
    await expect(
      context.source.transaction(async (manager) => {
        await manager.increment(Product, { id: product.id }, 'stock', 3);
        await manager.getRepository(StockMovement).insert({
          productId: product.id,
          userId: admin.id,
          type: 'IN',
          quantity: 0,
          reason: 'Movimiento inválido',
        });
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(
      (
        await context.source
          .getRepository(Product)
          .findOneByOrFail({ id: product.id })
      ).stock,
    ).toBe(20);
    expect(await context.source.getRepository(StockMovement).count()).toBe(3);
  });

  it('el comando por entorno carga y repite el seed cerrando sus conexiones', async () => {
    await inTestEnvironment(context, () => seedFromEnvironment());
    await inTestEnvironment(context, () => seedFromEnvironment());
    expect(await balances()).toEqual([20, 30, 10]);
    expect(await context.source.getRepository(User).count()).toBe(2);
    expect(await context.source.getRepository(StockMovement).count()).toBe(3);
  });

  it('el cargador de .env conserva las credenciales de seed al validar la conexión', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-seed-env-'));
    const envFile = join(directory, '.env');
    writeFileSync(
      envFile,
      'SEED_ADMIN_PASSWORD=File-only-admin-password\nSEED_OPERATOR_PASSWORD=File-only-operator-password\n',
    );
    try {
      await inTestEnvironment(context, async () => {
        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        delete process.env.SEED_ADMIN_PASSWORD;
        delete process.env.SEED_OPERATOR_PASSWORD;
        try {
          const source = await configuredDataSource(envFile);
          const values = seedCredentials(process.env);
          expect(values.adminPassword).toBe('File-only-admin-password');
          expect(values.operatorPassword).toBe('File-only-operator-password');
          await withDataSource(source, (connection) =>
            runSeed(connection, values),
          );
          expect(source.isInitialized).toBe(false);
        } finally {
          process.env.NODE_ENV = previousEnvironment;
        }
      });
      expect(await balances()).toEqual([20, 30, 10]);
    } finally {
      unlinkSync(envFile);
      rmdirSync(directory);
    }
  });
});
