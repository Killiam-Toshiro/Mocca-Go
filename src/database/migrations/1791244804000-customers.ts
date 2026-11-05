import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

/**
 * Crea `customers`: los datos propios del cliente de Mocca Go (correo, nombre
 * y teléfono en E.164), 1 a 1 con `users`.
 *
 * `down()` no borra datos de clientes: si existe alguna fila aborta sin
 * cambios. Revertir solo es posible en bases descartables o sin clientes.
 */
export class Customers1791244804000 implements MigrationInterface {
  name = 'Customers1791244804000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`CREATE TABLE ${schema}."customers" (
      "user_id" uuid PRIMARY KEY REFERENCES ${schema}."users"("id") ON DELETE CASCADE,
      "email" varchar(254) NOT NULL,
      "full_name" varchar(100) NOT NULL,
      "phone" varchar(16) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "customers_email_key" UNIQUE ("email"),
      CONSTRAINT "customers_email_lower" CHECK ("email" = lower("email")),
      CONSTRAINT "customers_email_format" CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
      CONSTRAINT "customers_full_name_valid" CHECK (char_length(btrim("full_name")) >= 2),
      CONSTRAINT "customers_phone_e164" CHECK ("phone" ~ '^\\+[1-9][0-9]{7,14}$')
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const rows = (await runner.query(
      `SELECT 1 FROM ${schema}."customers" LIMIT 1`,
    )) as unknown[];
    if (rows.length > 0)
      throw new Error('No se puede revertir: existen clientes registrados.');
    await runner.query(`DROP TABLE ${schema}."customers"`);
  }
}
