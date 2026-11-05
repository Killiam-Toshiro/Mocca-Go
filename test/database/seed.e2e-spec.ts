import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configuredDataSource,
  withDataSource,
} from '../../src/database/commands';
import { seedCredentials } from '../../src/seed/credentials';
import { Like } from 'typeorm';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../../src/delivery/entities/delivery-zone.entity';
import { costPercent } from '../../src/products/catalog';
import { ProductComponent } from '../../src/products/entities/product-component.entity';
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

// Saldos de partida del menú: los combos no tienen saldo propio.
const EXPECTED_BALANCES = {
  'CAF-AMER': 40,
  'CAF-CAPU': 40,
  'CAF-LATT': 30,
  'CAF-COLD': 30,
  'CAF-LFRI': 30,
  'CAF-FRAP': 25,
  'BEB-JNAR': 25,
  'BEB-JMOR': 25,
  'BEB-GASE': 48,
  'BEB-AGUA': 48,
  'BEB-TEFR': 30,
  'PAN-ESPO': 30,
  'PAN-PAND': 30,
  'PAN-ALMO': 30,
  'PAS-CHEE': 16,
  'PAS-CUPC': 20,
  'SNK-PAPA': 40,
  'SNK-GAAV': 40,
  'SNK-GACH': 40,
  'SNK-MIXF': 30,
  'CMB-CLASICO': 0,
  'CMB-ESTUDIO': 0,
  'CMB-DULCE': 0,
};

const credentials = {
  adminPassword: 'Test-only-admin-password',
  operatorPassword: 'Test-only-operator-password',
  courierPassword: 'Test-only-courier-password',
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
    const products = await context.source.getRepository(Product).find();
    return Object.fromEntries(
      products.map((product) => [product.sku, product.stock]),
    );
  }

  it('carga usuarios, productos, entradas y saldos sin exponer hashes por defecto', async () => {
    expect(await runSeed(context.source, credentials)).toEqual({
      usersCreated: 3,
      productsCreated: 23,
      movementsCreated: 20,
      zonesCreated: 4,
      pointsCreated: 17,
    });
    expect(await balances()).toEqual(EXPECTED_BALANCES);
    const users = context.source.getRepository(User);
    expect((await users.findOneByOrFail({ username: 'admin' })).role).toBe(
      'admin',
    );
    expect((await users.findOneByOrFail({ username: 'operador' })).role).toBe(
      'operador',
    );
    expect((await users.findOneByOrFail({ username: 'repartidor' })).role).toBe(
      'repartidor',
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
    expect(await context.source.getRepository(StockMovement).count()).toBe(20);
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
    const product = await products.findOneByOrFail({ sku: 'CAF-CAPU' });
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
        courierPassword: 'Other-valid-courier-password',
      }),
    ).toEqual({
      usersCreated: 0,
      productsCreated: 0,
      movementsCreated: 0,
      zonesCreated: 0,
      pointsCreated: 0,
    });
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
      stock: 45,
    });
    expect(await source.getRepository(StockMovement).count()).toBe(21);
  });

  it('dos ejecuciones simultáneas aplican cada entrada una sola vez', async () => {
    const results = await Promise.all([
      runSeed(context.source, credentials),
      runSeed(context.source, credentials),
    ]);
    expect(
      results.reduce((total, result) => total + result.usersCreated, 0),
    ).toBe(3);
    expect(
      results.reduce((total, result) => total + result.movementsCreated, 0),
    ).toBe(20);
    expect(
      results.reduce((total, result) => total + result.productsCreated, 0),
    ).toBe(23);
    expect(await balances()).toEqual(EXPECTED_BALANCES);
    expect(await context.source.getRepository(User).count()).toBe(3);
    expect(await context.source.getRepository(StockMovement).count()).toBe(20);
  });

  it('agrega la entrada faltante a un SKU existente sin reemplazar catálogo ni saldo previo', async () => {
    await context.source
      .getRepository(Product)
      .save({ sku: 'CAF-AMER', name: 'Producto propio', stock: 7 });
    expect(await runSeed(context.source, credentials)).toEqual({
      usersCreated: 3,
      productsCreated: 22,
      movementsCreated: 20,
      zonesCreated: 4,
      pointsCreated: 17,
    });
    expect(
      await context.source
        .getRepository(Product)
        .findOneByOrFail({ sku: 'CAF-AMER' }),
    ).toMatchObject({ name: 'Producto propio', stock: 47 });
  });

  it('revierte toda la carga si falla después de crear usuarios y dos entradas', async () => {
    const products = context.source.getRepository(Product);
    const original = await products.save({
      sku: 'CAF-LATT',
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
      .findOneByOrFail({ sku: 'CAF-AMER' });
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
    ).toBe(40);
    expect(await context.source.getRepository(StockMovement).count()).toBe(20);
  });

  it('CA-26 y CA-27: crea los combos con su composición y todos quedan bajo el 39 % de costo', async () => {
    await runSeed(context.source, credentials);
    expect(await runSeed(context.source, credentials)).toEqual({
      usersCreated: 0,
      productsCreated: 0,
      movementsCreated: 0,
      zonesCreated: 0,
      pointsCreated: 0,
    });
    const products = context.source.getRepository(Product);
    expect(await products.countBy({ sku: Like('INV-%') })).toBe(0);
    const links = await context.source
      .getRepository(ProductComponent)
      .find({ relations: { combo: true, component: true } });
    const composition = (sku: string) =>
      links
        .filter((link) => link.combo?.sku === sku)
        .map((link) => [link.component?.sku, link.quantity])
        .sort();
    expect(composition('CMB-CLASICO')).toEqual([
      ['CAF-CAPU', 1],
      ['PAN-PAND', 1],
    ]);
    expect(composition('CMB-ESTUDIO')).toEqual([
      ['CAF-COLD', 1],
      ['SNK-GAAV', 1],
    ]);
    expect(composition('CMB-DULCE')).toEqual([
      ['CAF-LATT', 1],
      ['PAS-CUPC', 1],
    ]);
    const costs = new Map(
      (await products.find()).map((product) => [product.sku, product]),
    );
    const percent = (sku: string, parts: string[]) => {
      const total = parts.reduce((sum, part) => sum + costs.get(part)!.cost, 0);
      return costPercent(total, costs.get(sku)!.price);
    };
    expect(percent('CMB-CLASICO', ['CAF-CAPU', 'PAN-PAND'])).toBe(38.5);
    expect(percent('CMB-ESTUDIO', ['CAF-COLD', 'SNK-GAAV'])).toBe(37.3);
    expect(percent('CMB-DULCE', ['CAF-LATT', 'PAS-CUPC'])).toBe(38);
    for (const product of costs.values())
      expect(product.price).toBeGreaterThan(0);
  });

  it('el comando por entorno carga y repite el seed cerrando sus conexiones', async () => {
    await inTestEnvironment(context, () => seedFromEnvironment());
    await inTestEnvironment(context, () => seedFromEnvironment());
    expect(await balances()).toEqual(EXPECTED_BALANCES);
    expect(await context.source.getRepository(User).count()).toBe(3);
    expect(await context.source.getRepository(StockMovement).count()).toBe(20);
  });

  it('el cargador de .env conserva las credenciales de seed al validar la conexión', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-seed-env-'));
    const envFile = join(directory, '.env');
    writeFileSync(
      envFile,
      'SEED_ADMIN_PASSWORD=File-only-admin-password\nSEED_OPERATOR_PASSWORD=File-only-operator-password\nSEED_COURIER_PASSWORD=File-only-courier-password\n',
    );
    try {
      await inTestEnvironment(context, async () => {
        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        delete process.env.SEED_ADMIN_PASSWORD;
        delete process.env.SEED_OPERATOR_PASSWORD;
        delete process.env.SEED_COURIER_PASSWORD;
        try {
          const source = await configuredDataSource(envFile);
          const values = seedCredentials(process.env);
          expect(values.adminPassword).toBe('File-only-admin-password');
          expect(values.operatorPassword).toBe('File-only-operator-password');
          expect(values.courierPassword).toBe('File-only-courier-password');
          await withDataSource(source, (connection) =>
            runSeed(connection, values),
          );
          expect(source.isInitialized).toBe(false);
        } finally {
          process.env.NODE_ENV = previousEnvironment;
        }
      });
      expect(await balances()).toEqual(EXPECTED_BALANCES);
    } finally {
      unlinkSync(envFile);
      rmdirSync(directory);
    }
  });

  it('CA-16: crea 4 zonas y 17 puntos con pisos e indicaciones, sin repetir ni pisar ediciones', async () => {
    await runSeed(context.source, credentials);
    const zones = await context.source
      .getRepository(DeliveryZone)
      .find({ order: { name: 'ASC' } });
    expect(zones.map((zone) => zone.name)).toEqual([
      'Zona 1',
      'Zona 2',
      'Zona 3',
      'Zona 4',
    ]);
    const points = await context.source.getRepository(DeliveryPoint).find();
    expect(points).toHaveLength(17);
    const byName = (name: string) =>
      points.find((point) => point.name === name)!;
    const zoneName = (name: string) =>
      zones.find((zone) => zone.id === byName(name).zoneId)!.name;
    expect(zoneName('Edificio M')).toBe('Zona 1');
    expect(zoneName('Zona Samán')).toBe('Zona 1');
    expect(zoneName('Bienestar Universitario')).toBe('Zona 2');
    expect(zoneName('Edificio L')).toBe('Zona 3');
    expect(zoneName('Coliseo')).toBe('Zona 4');
    expect(byName('Edificio M').floors).toBe(4);
    expect(byName('Edificio E').floors).toBe(5);
    expect(byName('Edificio G').floors).toBe(1);
    expect(byName('Canchas').floors).toBeNull();
    expect(byName('Gym')).toMatchObject({
      floors: null,
      hint: 'Se entrega afuera del gym',
    });
    expect(byName('Auditorios')).toMatchObject({
      floors: 1,
      hint: 'Se entrega en la plazoleta de auditorios',
    });
    expect(byName('Biblioteca').hint).toBe('Solo se entrega en el primer piso');
    await context.source
      .getRepository(DeliveryPoint)
      .update(byName('Canchas').id, { name: 'Canchas sintéticas', floors: 2 });
    await context.source
      .getRepository(DeliveryZone)
      .update(zones[0].id, { name: 'Norte', active: false });
    const again = await runSeed(context.source, credentials);
    expect(again).toMatchObject({ zonesCreated: 1, pointsCreated: 1 });
    expect(
      await context.source.getRepository(DeliveryPoint).findOneByOrFail({
        id: byName('Canchas').id,
      }),
    ).toMatchObject({ name: 'Canchas sintéticas', floors: 2 });
  });
});
