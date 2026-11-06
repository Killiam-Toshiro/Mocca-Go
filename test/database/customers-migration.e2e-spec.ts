import { Surveys1791244809000 } from '../../src/database/migrations/1791244809000-surveys';
import { Orders1791244807000 } from '../../src/database/migrations/1791244807000-orders';
import { Customers1791244804000 } from '../../src/database/migrations/1791244804000-customers';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de clientes (CA-01, CA-02)', () => {
  let context: TestDatabase;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const table = `"customers"`;
  const qualified = () => `"${context.ownedSchema}".${table}`;
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      // Los pedidos dependen de los clientes: se revierten primero.
      const [{ present }] = await context.source.query<{ present: boolean }[]>(
        `SELECT to_regclass('"${context.ownedSchema}"."orders"') IS NOT NULL AS present`,
      );
      if (present) {
        await new Surveys1791244809000().down(runner);
        await new Orders1791244807000().down(runner);
      }
      await new Customers1791244804000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const tableExists = async () =>
    (
      await context.source.query<unknown[]>(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'customers'`,
        [context.ownedSchema],
      )
    ).length === 1;
  const newUser = async (username: string) =>
    (
      await context.source
        .getRepository(User)
        .save({ username, role: 'cliente', passwordHash: 'x' })
    ).id;
  const insert = (
    userId: string,
    email: string,
    fullName: string,
    phone: string,
  ) =>
    context.source.query(
      `INSERT INTO ${qualified()} ("user_id","email","full_name","phone") VALUES ($1,$2,$3,$4)`,
      [userId, email, fullName, phone],
    );

  it('crea la tabla y acepta una fila válida', async () => {
    expect(await tableExists()).toBe(true);
    const id = await newUser('cliente_uno');
    await insert(id, 'ana@u.icesi.edu.co', 'Ana Pérez', '+573001234567');
    const rows = await context.source.query<{ email: string }[]>(
      `SELECT email FROM ${qualified()}`,
    );
    expect(rows).toEqual([{ email: 'ana@u.icesi.edu.co' }]);
  });

  it.each([
    [
      'correo en mayúsculas',
      'Ana@u.icesi.edu.co',
      'Ana Pérez',
      '+573001234567',
    ],
    ['correo sin arroba', 'ana.u.icesi.edu.co', 'Ana Pérez', '+573001234567'],
    ['nombre de un carácter', 'ana@u.icesi.edu.co', 'A', '+573001234567'],
    ['nombre de solo espacios', 'ana@u.icesi.edu.co', '   ', '+573001234567'],
    ['teléfono sin +', 'ana@u.icesi.edu.co', 'Ana Pérez', '573001234567'],
    ['teléfono con letras', 'ana@u.icesi.edu.co', 'Ana Pérez', '+57300abc4567'],
  ])('rechaza %s con un CHECK de PostgreSQL', async (_name, ...values) => {
    const id = await newUser('cliente_check');
    await expect(insert(id, ...values)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
  });

  it('rechaza un correo repetido con el índice único', async () => {
    await insert(
      await newUser('cliente_a'),
      'dup@u.icesi.edu.co',
      'Ana',
      '+573001234567',
    );
    await expect(
      insert(
        await newUser('cliente_b'),
        'dup@u.icesi.edu.co',
        'Beto',
        '+573001234568',
      ),
    ).rejects.toMatchObject({
      driverError: { code: '23505', constraint: 'customers_email_key' },
    });
  });

  it('el teléfono no es único', async () => {
    await insert(
      await newUser('cliente_c'),
      'c@u.icesi.edu.co',
      'Cata',
      '+573001234567',
    );
    await insert(
      await newUser('cliente_d'),
      'd@u.icesi.edu.co',
      'Dani',
      '+573001234567',
    );
  });

  it('eliminar al usuario elimina su fila de clientes (cascada)', async () => {
    const id = await newUser('cliente_e');
    await insert(id, 'e@u.icesi.edu.co', 'Eva', '+573001234567');
    await context.source.getRepository(User).delete({ id });
    expect(
      await context.source.query<unknown[]>(`SELECT 1 FROM ${qualified()}`),
    ).toHaveLength(0);
  });

  it('down() elimina la tabla vacía y aborta sin cambios si hay clientes', async () => {
    await insert(
      await newUser('cliente_f'),
      'f@u.icesi.edu.co',
      'Fer',
      '+573001234567',
    );
    await expect(revert()).rejects.toThrow('No se puede revertir');
    expect(await tableExists()).toBe(true);
    await context.source.query(`DELETE FROM ${qualified()}`);
    await revert();
    expect(await tableExists()).toBe(false);
  });
});
