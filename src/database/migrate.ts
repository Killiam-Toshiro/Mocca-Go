import { configuredDataSource, executeMigration, runCommand } from './commands';

export async function migrateFromEnvironment(
  command = process.argv[2],
): Promise<void> {
  const source = await configuredDataSource();
  await executeMigration(source, command);
  console.log('Migración completada.');
}

if (require.main === module) void runCommand(migrateFromEnvironment);
