import { MigrationInterface, QueryRunner } from 'typeorm';
import { quoteIdentifier } from '../database.config';

/**
 * Amplía los roles de usuario para Mocca Go: además de `admin` y `operador`
 * (cocina) se aceptan `repartidor` y `cliente`.
 *
 * `down()` no reclasifica ni elimina cuentas: si existe algún `repartidor` o
 * `cliente` aborta sin cambios. Revertir solo es posible en bases descartables
 * o sin esos usuarios.
 */
export class MoccaRoles1791244803000 implements MigrationInterface {
  name = 'MoccaRoles1791244803000';

  private schema(runner: QueryRunner): string {
    if (runner.connection.options.type !== 'postgres')
      throw new Error('La migración requiere PostgreSQL.');
    return quoteIdentifier(runner.connection.options.schema ?? 'public');
  }

  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(
      `ALTER TABLE ${schema}."users" DROP CONSTRAINT "users_role_valid"`,
    );
    await runner.query(`ALTER TABLE ${schema}."users"
      ADD CONSTRAINT "users_role_valid"
      CHECK ("role" IN ('admin', 'operador', 'repartidor', 'cliente'))`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    const rows = (await runner.query(
      `SELECT 1 FROM ${schema}."users" WHERE "role" IN ('repartidor', 'cliente') LIMIT 1`,
    )) as unknown[];
    if (rows.length > 0)
      throw new Error(
        'No se puede revertir: existen usuarios con rol repartidor o cliente.',
      );
    await runner.query(
      `ALTER TABLE ${schema}."users" DROP CONSTRAINT "users_role_valid"`,
    );
    await runner.query(`ALTER TABLE ${schema}."users"
      ADD CONSTRAINT "users_role_valid"
      CHECK ("role" IN ('admin', 'operador'))`);
  }
}
