import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

export class Authentication1791244801000 implements MigrationInterface {
  name = 'Authentication1791244801000';
  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }
  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`ALTER TABLE ${schema}."users"
      ADD COLUMN "totp_secret" text,
      ADD COLUMN "last_totp_counter" integer,
      ADD COLUMN "login_failures" integer NOT NULL DEFAULT 0,
      ADD COLUMN "blocked_until" timestamptz,
      ADD COLUMN "totp_failures" integer NOT NULL DEFAULT 0,
      ADD COLUMN "totp_blocked_until" timestamptz,
      ADD CONSTRAINT "users_login_failures_valid" CHECK ("login_failures" BETWEEN 0 AND 5),
      ADD CONSTRAINT "users_totp_failures_valid" CHECK ("totp_failures" BETWEEN 0 AND 5),
      ADD CONSTRAINT "users_totp_counter_valid" CHECK ("last_totp_counter" IS NULL OR "last_totp_counter" >= 0)`);
    await runner.query(`CREATE TABLE ${schema}."auth_proofs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES ${schema}."users"("id") ON DELETE CASCADE,
      "kind" varchar(16) NOT NULL,
      "token_hash" varchar(64) NOT NULL UNIQUE,
      "pending_secret" text,
      "expires_at" timestamptz NOT NULL,
      "consumed_at" timestamptz,
      "attempts" integer NOT NULL DEFAULT 0,
      CONSTRAINT "proofs_kind_valid" CHECK ("kind" IN ('enrollment', 'challenge')),
      CONSTRAINT "proofs_attempts_valid" CHECK ("attempts" BETWEEN 0 AND 5)
    )`);
    await runner.query(
      `CREATE INDEX "proofs_user_kind_idx" ON ${schema}."auth_proofs" ("user_id", "kind")`,
    );
    await runner.query(`CREATE TABLE ${schema}."sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES ${schema}."users"("id") ON DELETE CASCADE,
      "expires_at" timestamptz NOT NULL,
      "revoked_at" timestamptz
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`DROP TABLE ${schema}."sessions"`);
    await runner.query(`DROP TABLE ${schema}."auth_proofs"`);
    await runner.query(`ALTER TABLE ${schema}."users"
      DROP CONSTRAINT "users_login_failures_valid", DROP CONSTRAINT "users_totp_counter_valid", DROP CONSTRAINT "users_totp_failures_valid",
      DROP COLUMN "totp_failures", DROP COLUMN "totp_blocked_until",
      DROP COLUMN "blocked_until", DROP COLUMN "login_failures", DROP COLUMN "last_totp_counter", DROP COLUMN "totp_secret"`);
  }
}
