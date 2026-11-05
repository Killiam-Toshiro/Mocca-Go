import { validateAuthEnvironment } from '../../src/auth/auth.config';
import { verifyPassword } from '../../src/auth/crypto';
import { validateRuntimeEnvironment } from '../../src/config/runtime-environment';
import { hashPassword } from '../../src/seed/password';

describe('Configuración y verificación de contraseñas', () => {
  const JWT_SECRET = 'test-only-secret-for-jwt-more-than-32-bytes';
  it('acepta un JWT_SECRET suficiente y rechaza configuración débil sin revelar valores', () => {
    expect(validateAuthEnvironment({ JWT_SECRET })).toEqual({ JWT_SECRET });
    for (const weak of [undefined, 3, 'short-secret-value']) {
      let message = '';
      try {
        validateAuthEnvironment({ JWT_SECRET: weak });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain('short-secret-value');
    }
  });
  it('ignora variables obsoletas de segundo factor de un .env antiguo', () => {
    const legacy = { JWT_SECRET, TOTP_ENCRYPTION_KEY: 'a1'.repeat(32) };
    expect(validateAuthEnvironment(legacy)).toEqual({ JWT_SECRET });
    expect(
      validateRuntimeEnvironment({
        ...legacy,
        DB_PASSWORD: 'fixture-password',
      }),
    ).not.toHaveProperty('TOTP_ENCRYPTION_KEY');
  });
  it('verifica hashes reales de seed, rechaza contraseña errónea, formato o parámetros no permitidos', async () => {
    const hash = await hashPassword('Test-only-long-password');
    expect(await verifyPassword('Test-only-long-password', hash)).toBe(true);
    expect(await verifyPassword('Another-long-password', hash)).toBe(false);
    expect(await verifyPassword('Another-long-password')).toBe(false);
    expect(
      await verifyPassword(
        'Test-only-long-password',
        hash.replace('32768', '999999999'),
      ),
    ).toBe(false);
  });
});
