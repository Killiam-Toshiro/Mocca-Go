import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

export class InitialInventory1791244800000 implements MigrationInterface {
  name = 'InitialInventory1791244800000';

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(options.schema ?? 'public');
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`CREATE TABLE ${schema}."users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "username" varchar(64) NOT NULL UNIQUE,
      "password_hash" text NOT NULL,
      "role" varchar(16) NOT NULL DEFAULT 'operador',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "users_username_format" CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
      CONSTRAINT "users_role_valid" CHECK ("role" IN ('admin', 'operador'))
    )`);
    await queryRunner.query(`CREATE TABLE ${schema}."products" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "sku" varchar(48) NOT NULL UNIQUE,
      "name" varchar(120) NOT NULL,
      "description" text,
      "active" boolean NOT NULL DEFAULT true,
      "stock" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "products_sku_format" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9._-]{0,47}$'),
      CONSTRAINT "products_name_nonempty" CHECK (length(trim("name")) > 0),
      CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0)
    )`);
    await queryRunner.query(`CREATE TABLE ${schema}."stock_movements" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "product_id" uuid NOT NULL REFERENCES ${schema}."products"("id") ON DELETE RESTRICT,
      "user_id" uuid NOT NULL REFERENCES ${schema}."users"("id") ON DELETE RESTRICT,
      "type" varchar(3) NOT NULL,
      "quantity" integer NOT NULL,
      "reason" varchar(300) NOT NULL,
      "seed_key" varchar(80) UNIQUE,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "movements_type_valid" CHECK ("type" IN ('IN', 'OUT')),
      CONSTRAINT "movements_quantity_positive" CHECK ("quantity" > 0),
      CONSTRAINT "movements_reason_nonempty" CHECK (length(trim("reason")) > 0)
    )`);
    await queryRunner.query(
      `CREATE INDEX "movements_product_created_idx" ON ${schema}."stock_movements" ("product_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."stock_movements"`);
    await queryRunner.query(`DROP TABLE ${schema}."products"`);
    await queryRunner.query(`DROP TABLE ${schema}."users"`);
  }
}
