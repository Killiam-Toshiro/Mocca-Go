import { Surveys1791244809000 } from '../../src/database/migrations/1791244809000-surveys';
import { Dispatch1791244808000 } from '../../src/database/migrations/1791244808000-dispatch';
import { Orders1791244807000 } from '../../src/database/migrations/1791244807000-orders';
import { DeliveryZonesPoints1791244806000 } from '../../src/database/migrations/1791244806000-delivery-zones-points';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de zonas y puntos (CA-01, CA-02)', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const qualified = (name: string) => `"${context.ownedSchema}"."${name}"`;
  const tables = async () =>
    (
      await context.source.query<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name LIKE 'delivery_%' ORDER BY 1`,
        [context.ownedSchema],
      )
    ).map((row) => row.table_name);
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      // El despacho y los pedidos dependen de los puntos: se revierten primero.
      const [{ present }] = await context.source.query<{ present: boolean }[]>(
        `SELECT to_regclass('"${context.ownedSchema}"."orders"') IS NOT NULL AS present`,
      );
      if (present) {
        await new Surveys1791244809000().down(runner);
        await new Dispatch1791244808000().down(runner);
        await new Orders1791244807000().down(runner);
      }
      await new DeliveryZonesPoints1791244806000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const zone = async (name: string) =>
    (
      await context.source.query<{ id: string }[]>(
        `INSERT INTO ${qualified('delivery_zones')} (name) VALUES ($1) RETURNING id`,
        [name],
      )
    )[0].id;
  const point = (zoneId: string, name: string, floors: number | null = null) =>
    context.source.query(
      `INSERT INTO ${qualified('delivery_points')} (zone_id, name, floors) VALUES ($1, $2, $3)`,
      [zoneId, name, floors],
    );

  it('CA-01: crea ambas tablas; down() elimina las vacías y aborta con datos', async () => {
    expect(await tables()).toEqual(['delivery_points', 'delivery_zones']);
    await revert();
    expect(await tables()).toEqual([]);
    const runner = context.source.createQueryRunner();
    try {
      await new DeliveryZonesPoints1791244806000().up(runner);
    } finally {
      await runner.release();
    }
    await zone('Zona 1');
    await expect(revert()).rejects.toThrow(/existen zonas de entrega/);
    expect(await tables()).toEqual(['delivery_points', 'delivery_zones']);
  });

  it('CA-02: rechaza nombres vacíos o repetidos sin distinguir mayúsculas', async () => {
    await expect(zone('   ')).rejects.toThrow(/delivery_zones_name_valid/);
    const id = await zone('Zona 1');
    await expect(zone('ZONA 1')).rejects.toThrow(/delivery_zones_name_key/);
    await point(id, 'Edificio A', 2);
    await expect(point(id, 'edificio a')).rejects.toThrow(
      /delivery_points_name_key/,
    );
    await expect(point(id, ' ')).rejects.toThrow(/delivery_points_name_valid/);
  });

  it('CA-02: rechaza pisos fuera de 1 a 30, indicación vacía y zona inexistente', async () => {
    const id = await zone('Zona 1');
    await expect(point(id, 'Cero', 0)).rejects.toThrow(
      /delivery_points_floors_range/,
    );
    await expect(point(id, 'Treinta y uno', 31)).rejects.toThrow(
      /delivery_points_floors_range/,
    );
    await point(id, 'Treinta', 30);
    await expect(
      context.source.query(
        `INSERT INTO ${qualified('delivery_points')} (zone_id, name, hint) VALUES ($1, 'X', '  ')`,
        [id],
      ),
    ).rejects.toThrow(/delivery_points_hint_valid/);
    await expect(
      point('00000000-0000-4000-8000-000000000000', 'Huérfano'),
    ).rejects.toThrow(/delivery_points_zone_id_fkey/);
  });

  it('CA-02: no permite borrar una zona con puntos', async () => {
    const id = await zone('Zona 1');
    await point(id, 'Edificio A');
    await expect(
      context.source.query(
        `DELETE FROM ${qualified('delivery_zones')} WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/delivery_points_zone_id_fkey/);
  });
});
