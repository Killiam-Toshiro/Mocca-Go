export interface AuthEnvironment {
  JWT_SECRET: string;
}

export function validateAuthEnvironment(
  environment: Record<string, unknown>,
): AuthEnvironment {
  const jwt = environment.JWT_SECRET;
  if (typeof jwt !== 'string' || Buffer.byteLength(jwt) < 32)
    throw new Error('JWT_SECRET requiere al menos 32 bytes.');
  return { JWT_SECRET: jwt };
}

export const JWT_ISSUER = 'inventory-api';
export const JWT_AUDIENCE = 'inventory-client';
export const ACCESS_SECONDS = 900;
