import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

/**
 * Encuesta de satisfacción (`order_surveys`): una respuesta por pedido.
 *
 * `down()` no borra datos: si existe alguna respuesta, aborta sin cambios.
 */
export class Surveys1791244809000 implements MigrationInterface {
  name = 'Surveys1791244809000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`CREATE TABLE ${schema}."order_surveys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "order_id" uuid NOT NULL REFERENCES ${schema}."orders"("id") ON DELETE RESTRICT,
      "customer_id" uuid NOT NULL REFERENCES ${schema}."users"("id") ON DELETE RESTRICT,
      "rating" smallint NOT NULL,
      "comment" varchar(300),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "order_surveys_order_key" UNIQUE ("order_id"),
      CONSTRAINT "order_surveys_rating_valid" CHECK ("rating" BETWEEN 1 AND 5),
      CONSTRAINT "order_surveys_comment_valid" CHECK ("comment" IS NULL OR (char_length("comment") BETWEEN 1 AND 300 AND btrim("comment") <> ''))
    )`);
    await runner.query(
      `CREATE INDEX "order_surveys_created_idx" ON ${schema}."order_surveys" ("created_at" DESC)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const rows = (await runner.query(
      `SELECT 1 FROM ${schema}."order_surveys" LIMIT 1`,
    )) as unknown[];
    if (rows.length > 0)
      throw new Error('No se puede revertir: existen respuestas de encuesta.');
    await runner.query(`DROP TABLE ${schema}."order_surveys"`);
  }
}
