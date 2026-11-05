export interface AppEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  TRUST_PROXY_HOPS: number;
  CORS_ORIGINS: string[];
}

export const MAX_TRUST_PROXY_HOPS = 10;

export function parsePort(value: unknown, variable: string): number {
  const message = `${variable} debe ser un entero entre 1 y 65535.`;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(message);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(message);
  }
  return port;
}

export function parseTrustProxyHops(value: unknown): number {
  const message = `TRUST_PROXY_HOPS debe ser un entero entre 0 y ${MAX_TRUST_PROXY_HOPS}.`;
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) {
    throw new Error(message);
  }
  const hops = Number(value);
  if (hops > MAX_TRUST_PROXY_HOPS) throw new Error(message);
  return hops;
}

/**
 * Lista de orígenes permitidos para CORS, separados por comas. Cada entrada
 * debe ser un origen http(s) exacto (esquema, host y puerto opcional), sin
 * ruta ni `/` final ni comodines. Vacío o ausente desactiva CORS. El mensaje
 * de error no repite el valor recibido.
 */
export function parseCorsOrigins(value: unknown): string[] {
  const message =
    'CORS_ORIGINS debe ser una lista de orígenes http(s) separados por comas.';
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new Error(message);
  const origins = value.split(',');
  for (const origin of origins) {
    let canonical: string;
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error(message);
      canonical = url.origin;
    } catch {
      throw new Error(message);
    }
    if (canonical !== origin) throw new Error(message);
  }
  if (new Set(origins).size !== origins.length) throw new Error(message);
  return origins;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const nodeEnv = environment.NODE_ENV ?? 'development';

  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: parsePort(environment.PORT ?? '3000', 'PORT'),
    TRUST_PROXY_HOPS: parseTrustProxyHops(environment.TRUST_PROXY_HOPS ?? '0'),
    CORS_ORIGINS: parseCorsOrigins(environment.CORS_ORIGINS),
  };
}
