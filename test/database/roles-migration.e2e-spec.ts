import { MoccaRoles1791244803000 } from '../../src/database/migrations/1791244803000-mocca-roles';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de roles de Mocca Go (CA-02)', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      await new MoccaRoles1791244803000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const roleCheck = async () =>
    (
      await context.source.query<{ definition: string }[]>(
        `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'users_role_valid' AND n.nspname = $1`,
        [context.ownedSchema],
      )
    )[0].definition;

  it('down() aborta sin cambios si existen repartidores o clientes', async () => {
    await context.source
      .getRepository(User)
      .save({ username: 'cliente_uno', role: 'cliente', passwordHash: 'x' });
    await expect(revert()).rejects.toThrow('No se puede revertir');
    expect(await roleCheck()).toContain('cliente');
    expect(await context.source.getRepository(User).count()).toBe(1);
  });

  it('down() restaura el CHECK de dos roles cuando no hay cuentas nuevas', async () => {
    await context.source
      .getRepository(User)
      .save({ username: 'operador_uno', role: 'operador', passwordHash: 'x' });
    await revert();
    const definition = await roleCheck();
    expect(definition).toContain('admin');
    expect(definition).not.toContain('repartidor');
    await expect(
      context.source.query(
        `INSERT INTO "${context.ownedSchema}"."users" ("username","password_hash","role") VALUES ('repartidor_x','x','repartidor')`,
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
});
