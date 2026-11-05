export interface AppEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  TRUST_PROXY_HOPS: number;
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
  };
}
