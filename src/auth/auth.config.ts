export interface AuthEnvironment {
  JWT_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
}

export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
export const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;
export const MAX_ACCESS_TOKEN_TTL_SECONDS = 86_400;

export function parseAccessTokenTtl(value: unknown): number {
  if (value === undefined) return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const message = `ACCESS_TOKEN_TTL_SECONDS debe ser un entero entre ${MIN_ACCESS_TOKEN_TTL_SECONDS} y ${MAX_ACCESS_TOKEN_TTL_SECONDS}.`;
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value))
    throw new Error(message);
  const seconds = Number(value);
  if (
    seconds < MIN_ACCESS_TOKEN_TTL_SECONDS ||
    seconds > MAX_ACCESS_TOKEN_TTL_SECONDS
  )
    throw new Error(message);
  return seconds;
}

export function validateAuthEnvironment(
  environment: Record<string, unknown>,
): AuthEnvironment {
  const jwt = environment.JWT_SECRET;
  if (typeof jwt !== 'string' || Buffer.byteLength(jwt) < 32)
    throw new Error('JWT_SECRET requiere al menos 32 bytes.');
  return {
    JWT_SECRET: jwt,
    ACCESS_TOKEN_TTL_SECONDS: parseAccessTokenTtl(
      environment.ACCESS_TOKEN_TTL_SECONDS,
    ),
  };
}

export const JWT_ISSUER = 'mocca-go-api';
export const JWT_AUDIENCE = 'mocca-go-client';
