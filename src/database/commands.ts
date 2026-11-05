import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { validateRuntimeEnvironment } from '../config/runtime-environment';
import { createDataSource } from './data-source';

export async function configuredDataSource(
  envFilePath = '.env',
): Promise<DataSource> {
  await ConfigModule.forRoot({
    envFilePath,
    ignoreEnvFile: process.env.NODE_ENV === 'test',
    validate: (environment: Record<string, unknown>) => ({
      ...environment,
      ...validateRuntimeEnvironment(environment),
    }),
  });
  return createDataSource(validateRuntimeEnvironment(process.env));
}

export async function withDataSource<T>(
  source: DataSource,
  operation: (source: DataSource) => Promise<T>,
): Promise<T> {
  try {
    await source.initialize();
    return await operation(source);
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

export async function executeMigration(
  source: DataSource,
  command: string | undefined,
): Promise<void> {
  if (command !== 'run' && command !== 'revert') {
    throw new Error('Comando de migración inválido: usa run o revert.');
  }
  await withDataSource(source, async (connection) => {
    if (command === 'run') await connection.runMigrations();
    else await connection.undoLastMigration();
  });
}

export async function runCommand(
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch {
    console.error(
      'No se pudo completar el comando. Revisa configuración, conexión y migraciones.',
    );
    process.exitCode = 1;
  }
}
