import { CatalogAndCombos1791244805000 } from '../../src/database/migrations/1791244805000-catalog-and-combos';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de catálogo y combos (CA-01 a CA-03)', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const qualified = (name: string) => `"${context.ownedSchema}"."${name}"`;
  const columns = async () =>
    (
      await context.source.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'products'`,
        [context.ownedSchema],
      )
    ).map((row) => row.column_name);
  const componentsTable = async () =>
    (
      await context.source.query<unknown[]>(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 'product_components'`,
        [context.ownedSchema],
      )
    ).length === 1;
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      await new CatalogAndCombos1791244805000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const insertProduct = async (
    sku: string,
    values: Partial<{
      category: string;
      price: number;
      cost: number;
      stock: number;
    }> = {},
  ): Promise<string> => {
    const row = {
      category: 'cafe',
      price: 1000,
      cost: 400,
      stock: 0,
      ...values,
    };
    const rows = await context.source.query<{ id: string }[]>(
      `INSERT INTO ${qualified('products')} (sku, name, category, price, cost, stock)
       VALUES ($1, $1, $2, $3, $4, $5) RETURNING id`,
      [sku, row.category, row.price, row.cost, row.stock],
    );
    return rows[0].id;
  };
  const link = (comboId: string, componentId: string, quantity: number) =>
    context.source.query(
      `INSERT INTO ${qualified('product_components')} (combo_id, component_id, quantity)
       VALUES ($1, $2, $3)`,
      [comboId, componentId, quantity],
    );

  it('CA-01: los productos del taller conservan sus datos y quedan con valores por defecto', async () => {
    await revert();
    // Estado anterior: el producto existe sin columnas de catálogo.
    await context.source.query(
      `INSERT INTO ${qualified('products')} (sku, name, description, stock)
       VALUES ('INV-001', 'Teclado', 'Mecánico', 20)`,
    );
    await context.source.query(
      `DELETE FROM ${qualified('schema_migrations')} WHERE name = $1`,
      ['CatalogAndCombos1791244805000'],
    );
    await context.source.runMigrations();
    const rows = await context.source.query<Record<string, unknown>[]>(
      `SELECT sku, name, description, stock, category, price, cost, sold_out
       FROM ${qualified('products')}`,
    );
    expect(rows).toEqual([
      {
        sku: 'INV-001',
        name: 'Teclado',
        description: 'Mecánico',
        stock: 20,
        category: 'snack',
        price: 0,
        cost: 0,
        sold_out: false,
      },
    ]);
    expect(await componentsTable()).toBe(true);
  });

  it('CA-02: down con un combo aborta sin cambios; sin combos elimina tabla y columnas', async () => {
    const combo = await insertProduct('CMB-1', { category: 'combo' });
    const a = await insertProduct('A-1');
    const b = await insertProduct('B-1');
    await link(combo, a, 1);
    await link(combo, b, 2);
    await expect(revert()).rejects.toThrow(/existen combos/);
    expect(await componentsTable()).toBe(true);
    expect(await columns()).toEqual(
      expect.arrayContaining(['category', 'price', 'cost', 'sold_out']),
    );
    await context.source.query(
      `DELETE FROM ${qualified('products')} WHERE id = $1`,
      [combo],
    );
    await revert();
    expect(await componentsTable()).toBe(false);
    const present = await columns();
    for (const column of ['category', 'price', 'cost', 'sold_out'])
      expect(present).not.toContain(column);
    expect(present).toEqual(expect.arrayContaining(['sku', 'stock']));
  });

  it.each([
    ['categoría desconocida', { category: 'postre' }],
    ['categoría en mayúsculas', { category: 'CAFE' }],
    ['precio negativo', { price: -1 }],
    ['precio mayor al máximo', { price: 1_000_001 }],
    ['costo negativo', { cost: -1 }],
    ['costo mayor al máximo', { cost: 1_000_001 }],
    ['combo con saldo propio', { category: 'combo', stock: 1 }],
  ])('CA-03: rechaza %s', async (_caso, values) => {
    await expect(insertProduct('MAL-1', values)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
  });

  it('CA-03: acepta los límites y rechaza una composición inválida', async () => {
    const combo = await insertProduct('CMB-1', {
      category: 'combo',
      price: 1_000_000,
      cost: 0,
    });
    const a = await insertProduct('A-1', { price: 0, cost: 1_000_000 });
    await expect(link(combo, combo, 1)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    for (const quantity of [0, 11])
      await expect(link(combo, a, quantity)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    await link(combo, a, 10);
    await expect(link(combo, a, 1)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    await expect(
      link(combo, '00000000-0000-4000-8000-000000000000', 1),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('el componente no se elimina mientras un combo lo use; el combo arrastra su composición', async () => {
    const combo = await insertProduct('CMB-1', { category: 'combo' });
    const a = await insertProduct('A-1');
    await link(combo, a, 1);
    await expect(
      context.source.query(`DELETE FROM ${qualified('products')} WHERE id=$1`, [
        a,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await context.source.query(
      `DELETE FROM ${qualified('products')} WHERE id = $1`,
      [combo],
    );
    const left = await context.source.query<unknown[]>(
      `SELECT 1 FROM ${qualified('product_components')}`,
    );
    expect(left).toHaveLength(0);
    await context.source.query(
      `DELETE FROM ${qualified('products')} WHERE id = $1`,
      [a],
    );
  });
});
