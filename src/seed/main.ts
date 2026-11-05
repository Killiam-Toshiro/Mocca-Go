import {
  configuredDataSource,
  runCommand,
  withDataSource,
} from '../database/commands';
import { seedCredentials } from './credentials';
import { runSeed } from './seed';

export async function seedFromEnvironment(): Promise<void> {
  const source = await configuredDataSource();
  const credentials = seedCredentials(process.env);
  const result = await withDataSource(source, (connection) =>
    runSeed(connection, credentials),
  );
  console.log('Seed completado:', result);
}

if (require.main === module) void runCommand(seedFromEnvironment);
