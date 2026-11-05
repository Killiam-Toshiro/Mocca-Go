import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  DatabaseEnvironment,
  quoteIdentifier,
  validateDatabaseEnvironment,
} from '../../src/database/database.config';
import { createDataSource } from '../../src/database/data-source';

export interface TestDatabase {
  source: DataSource;
  config: DatabaseEnvironment;
  ownedSchema: string;
}

export function assertTestTarget(
  config: DatabaseEnvironment,
  ownedSchema: string,
): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    !config.DB_NAME.endsWith('_test') ||
    !/^it_[a-f0-9]{16}$/.test(ownedSchema) ||
    config.DB_SCHEMA !== ownedSchema
  ) {
    throw new Error(
      'La limpieza requiere una base de pruebas y el esquema exclusivo de la suite.',
    );
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const ownedSchema = `it_${randomBytes(8).toString('hex')}`;
  const config = validateDatabaseEnvironment({
    ...process.env,
    DB_SCHEMA: ownedSchema,
  });
  assertTestTarget(config, ownedSchema);
  const source = createDataSource(config);
  try {
    await source.initialize();
    await source.query(`CREATE SCHEMA ${quoteIdentifier(ownedSchema)}`);
    return { source, config, ownedSchema };
  } catch (error) {
    if (source.isInitialized) await source.destroy();
    throw error;
  }
}

export async function disposeTestDatabase(
  context: TestDatabase,
): Promise<void> {
  assertTestTarget(context.config, context.ownedSchema);
  const options = context.source.options;
  if (
    options.type !== 'postgres' ||
    options.database !== context.config.DB_NAME ||
    options.schema !== context.ownedSchema
  ) {
    throw new Error(
      'La conexión no coincide con el esquema de pruebas creado.',
    );
  }
  try {
    if (!context.source.isInitialized) await context.source.initialize();
    const rows = await context.source.query<{ name: string }[]>(
      'SELECT current_database() AS name',
    );
    if (rows[0].name !== context.config.DB_NAME)
      throw new Error('La base conectada no coincide con la base de pruebas.');
    await context.source.query(
      `DROP SCHEMA ${quoteIdentifier(context.ownedSchema)} CASCADE`,
    );
  } finally {
    if (context.source.isInitialized) await context.source.destroy();
  }
}

export async function inTestEnvironment<T>(
  context: TestDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  assertTestTarget(context.config, context.ownedSchema);
  const changes: Record<string, string> = {
    DB_SCHEMA: context.ownedSchema,
    SEED_ADMIN_PASSWORD: 'Test-only-admin-password',
    SEED_OPERATOR_PASSWORD: 'Test-only-operator-password',
  };
  const previous = Object.fromEntries(
    Object.keys(changes).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, changes);
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
