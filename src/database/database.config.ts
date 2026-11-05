import { parsePort } from '../config/environment';

export interface DatabaseEnvironment {
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_SCHEMA: string;
  DB_SSL: boolean;
}

function text(
  environment: Record<string, unknown>,
  variable: string,
  fallback?: string,
): string {
  const value = environment[variable] ?? fallback;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${variable} debe ser texto no vacío.`);
  }
  return value;
}

export function validateDatabaseEnvironment(
  environment: Record<string, unknown>,
): DatabaseEnvironment {
  const DB_NAME = text(environment, 'DB_NAME', 'inventory');
  const DB_SCHEMA = text(environment, 'DB_SCHEMA', 'public');
  for (const [variable, value] of Object.entries({ DB_NAME, DB_SCHEMA })) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
      throw new Error(
        `${variable} debe ser un identificador válido de hasta 63 caracteres.`,
      );
    }
  }
  if (environment.NODE_ENV === 'test' && !DB_NAME.endsWith('_test')) {
    throw new Error('DB_NAME debe terminar en _test cuando NODE_ENV=test.');
  }
  const ssl = environment.DB_SSL ?? 'false';
  if (ssl !== 'true' && ssl !== 'false') {
    throw new Error('DB_SSL debe ser true o false.');
  }
  return {
    DB_HOST: text(environment, 'DB_HOST', '127.0.0.1'),
    DB_PORT: parsePort(environment.DB_PORT ?? '5433', 'DB_PORT'),
    DB_NAME,
    DB_USERNAME: text(environment, 'DB_USERNAME', 'inventory'),
    DB_PASSWORD: text(environment, 'DB_PASSWORD'),
    DB_SCHEMA,
    DB_SSL: ssl === 'true',
  };
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
