import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

const STATES_BEFORE = `'recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'`;
const STATES_AFTER = `'recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'no_entregado', 'cancelado'`;

/**
 * Rondas de despacho (`dispatch_rounds`), el estado `no_entregado` y el
 * contacto del personal (`users.phone`, `users.full_name`).
 *
 * `down()` no borra datos: si existe alguna ronda o algún usuario con teléfono
 * o nombre de contacto, aborta sin cambios.
 */
export class Dispatch1791244808000 implements MigrationInterface {
  name = 'Dispatch1791244808000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`ALTER TABLE ${schema}."users"
      ADD COLUMN "phone" varchar(16),
      ADD COLUMN "full_name" varchar(80),
      ADD CONSTRAINT "users_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\\+[1-9][0-9]{7,14}$'),
      ADD CONSTRAINT "users_full_name_valid" CHECK ("full_name" IS NULL OR char_length(btrim("full_name")) BETWEEN 2 AND 80)`);
    await runner.query(`CREATE TABLE ${schema}."dispatch_rounds" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "courier_id" uuid NOT NULL REFERENCES ${schema}."users"("id") ON DELETE RESTRICT,
      "zone_id" uuid NOT NULL REFERENCES ${schema}."delivery_zones"("id") ON DELETE RESTRICT,
      "zone_name" varchar(60) NOT NULL,
      "status" varchar(10) NOT NULL DEFAULT 'activa',
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "eta_at" timestamptz NOT NULL,
      "finished_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "dispatch_rounds_status_valid" CHECK ("status" IN ('activa', 'finalizada')),
      CONSTRAINT "dispatch_rounds_finished_consistent" CHECK (("status" = 'finalizada') = ("finished_at" IS NOT NULL)),
      CONSTRAINT "dispatch_rounds_eta_after_start" CHECK ("eta_at" > "started_at")
    )`);
    await runner.query(
      `CREATE INDEX "dispatch_rounds_courier_status_idx" ON ${schema}."dispatch_rounds" ("courier_id", "status", "started_at" DESC)`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."orders" DROP CONSTRAINT "orders_status_valid"`,
    );
    await runner.query(`ALTER TABLE ${schema}."orders"
      ADD COLUMN "round_id" uuid REFERENCES ${schema}."dispatch_rounds"("id") ON DELETE RESTRICT,
      ADD COLUMN "failure_reason" varchar(200),
      ADD CONSTRAINT "orders_status_valid" CHECK ("status" IN (${STATES_AFTER})),
      ADD CONSTRAINT "orders_failure_consistent" CHECK (
        ("status" = 'no_entregado') = ("failure_reason" IS NOT NULL)
        AND ("failure_reason" IS NULL OR char_length(btrim("failure_reason")) >= 1)
      ),
      ADD CONSTRAINT "orders_round_consistent" CHECK (
        ("status" IN ('en_camino', 'entregado', 'no_entregado')) = ("round_id" IS NOT NULL)
      )`);
    await runner.query(
      `CREATE INDEX "orders_round_idx" ON ${schema}."orders" ("round_id") WHERE "round_id" IS NOT NULL`,
    );
    await runner.query(
      `CREATE INDEX "orders_listo_idx" ON ${schema}."orders" ("created_at") WHERE "status" = 'listo'`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."order_events" DROP CONSTRAINT "order_events_status_valid"`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."order_events" ADD CONSTRAINT "order_events_status_valid" CHECK ("status" IN (${STATES_AFTER}))`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const rounds = (await runner.query(
      `SELECT 1 FROM ${schema}."dispatch_rounds" LIMIT 1`,
    )) as unknown[];
    if (rounds.length > 0)
      throw new Error('No se puede revertir: existen rondas de despacho.');
    const contact = (await runner.query(
      `SELECT 1 FROM ${schema}."users" WHERE "phone" IS NOT NULL OR "full_name" IS NOT NULL LIMIT 1`,
    )) as unknown[];
    if (contact.length > 0)
      throw new Error(
        'No se puede revertir: hay personal con teléfono o nombre de contacto.',
      );
    await runner.query(
      `ALTER TABLE ${schema}."order_events" DROP CONSTRAINT "order_events_status_valid"`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."order_events" ADD CONSTRAINT "order_events_status_valid" CHECK ("status" IN (${STATES_BEFORE}))`,
    );
    await runner.query(`DROP INDEX ${schema}."orders_listo_idx"`);
    await runner.query(`DROP INDEX ${schema}."orders_round_idx"`);
    await runner.query(`ALTER TABLE ${schema}."orders"
      DROP CONSTRAINT "orders_round_consistent",
      DROP CONSTRAINT "orders_failure_consistent",
      DROP CONSTRAINT "orders_status_valid",
      DROP COLUMN "failure_reason",
      DROP COLUMN "round_id",
      ADD CONSTRAINT "orders_status_valid" CHECK ("status" IN (${STATES_BEFORE}))`);
    await runner.query(`DROP TABLE ${schema}."dispatch_rounds"`);
    await runner.query(`ALTER TABLE ${schema}."users"
      DROP CONSTRAINT "users_full_name_valid",
      DROP CONSTRAINT "users_phone_e164",
      DROP COLUMN "full_name",
      DROP COLUMN "phone"`);
  }
}
