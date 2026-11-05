import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

/**
 * Amplía `products` con categoría, precio, costo y «agotado», y crea
 * `product_components` para los combos.
 *
 * Las filas anteriores quedan como `snack`, precio 0 y costo 0 (nunca
 * disponibles hasta que un admin las edite).
 *
 * `down()` no borra composiciones: si existe algún combo aborta sin cambios.
 */
export class CatalogAndCombos1791244805000 implements MigrationInterface {
  name = 'CatalogAndCombos1791244805000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`ALTER TABLE ${schema}."products"
      ADD COLUMN "category" varchar(16) NOT NULL DEFAULT 'snack',
      ADD COLUMN "price" integer NOT NULL DEFAULT 0,
      ADD COLUMN "cost" integer NOT NULL DEFAULT 0,
      ADD COLUMN "sold_out" boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT "products_category_valid" CHECK ("category" IN ('cafe', 'bebida', 'panaderia', 'pasteleria', 'snack', 'combo')),
      ADD CONSTRAINT "products_price_range" CHECK ("price" BETWEEN 0 AND 1000000),
      ADD CONSTRAINT "products_cost_range" CHECK ("cost" BETWEEN 0 AND 1000000),
      ADD CONSTRAINT "products_combo_no_stock" CHECK ("category" <> 'combo' OR "stock" = 0)`);
    await runner.query(`CREATE TABLE ${schema}."product_components" (
      "combo_id" uuid NOT NULL REFERENCES ${schema}."products"("id") ON DELETE CASCADE,
      "component_id" uuid NOT NULL REFERENCES ${schema}."products"("id") ON DELETE RESTRICT,
      "quantity" integer NOT NULL,
      CONSTRAINT "product_components_pkey" PRIMARY KEY ("combo_id", "component_id"),
      CONSTRAINT "product_components_quantity_range" CHECK ("quantity" BETWEEN 1 AND 10),
      CONSTRAINT "product_components_not_self" CHECK ("combo_id" <> "component_id")
    )`);
    await runner.query(
      `CREATE INDEX "product_components_component_id_idx" ON ${schema}."product_components" ("component_id")`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const combos = (await runner.query(
      `SELECT 1 FROM ${schema}."products" WHERE "category" = 'combo' LIMIT 1`,
    )) as unknown[];
    if (combos.length > 0)
      throw new Error('No se puede revertir: existen combos registrados.');
    await runner.query(`DROP TABLE ${schema}."product_components"`);
    await runner.query(`ALTER TABLE ${schema}."products"
      DROP CONSTRAINT "products_combo_no_stock",
      DROP CONSTRAINT "products_cost_range",
      DROP CONSTRAINT "products_price_range",
      DROP CONSTRAINT "products_category_valid",
      DROP COLUMN "sold_out",
      DROP COLUMN "cost",
      DROP COLUMN "price",
      DROP COLUMN "category"`);
  }
}
