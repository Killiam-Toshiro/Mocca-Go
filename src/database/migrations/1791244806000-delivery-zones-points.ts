import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

/**
 * Crea `delivery_zones` (grupos de despacho) y `delivery_points` (lugares
 * concretos del campus donde se entrega). Los nombres son únicos sin
 * distinguir mayúsculas.
 *
 * `down()` no borra datos: si existe alguna zona o punto aborta sin cambios.
 */
export class DeliveryZonesPoints1791244806000 implements MigrationInterface {
  name = 'DeliveryZonesPoints1791244806000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`CREATE TABLE ${schema}."delivery_zones" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar(60) NOT NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "delivery_zones_name_valid" CHECK (char_length(btrim("name")) >= 1)
    )`);
    await runner.query(
      `CREATE UNIQUE INDEX "delivery_zones_name_key" ON ${schema}."delivery_zones" (lower("name"))`,
    );
    await runner.query(`CREATE TABLE ${schema}."delivery_points" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "zone_id" uuid NOT NULL REFERENCES ${schema}."delivery_zones"("id") ON DELETE RESTRICT,
      "name" varchar(80) NOT NULL,
      "hint" varchar(200),
      "floors" smallint,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "delivery_points_name_valid" CHECK (char_length(btrim("name")) >= 1),
      CONSTRAINT "delivery_points_hint_valid" CHECK ("hint" IS NULL OR char_length(btrim("hint")) >= 1),
      CONSTRAINT "delivery_points_floors_range" CHECK ("floors" IS NULL OR "floors" BETWEEN 1 AND 30)
    )`);
    await runner.query(
      `CREATE UNIQUE INDEX "delivery_points_name_key" ON ${schema}."delivery_points" (lower("name"))`,
    );
    await runner.query(
      `CREATE INDEX "delivery_points_zone_id_idx" ON ${schema}."delivery_points" ("zone_id")`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const rows = (await runner.query(
      `SELECT 1 FROM ${schema}."delivery_zones" LIMIT 1`,
    )) as unknown[];
    if (rows.length > 0)
      throw new Error('No se puede revertir: existen zonas de entrega.');
    await runner.query(`DROP TABLE ${schema}."delivery_points"`);
    await runner.query(`DROP TABLE ${schema}."delivery_zones"`);
  }
}
