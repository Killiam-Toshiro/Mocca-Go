import { scrypt } from 'node:crypto';
import { hashPassword } from '../../src/seed/password';

describe('Hash de contraseña', () => {
  it('usa salt aleatoria y guarda parámetros para verificación futura', async () => {
    const password = 'Test-password-con-ñ-😊';
    const hash = await hashPassword(password);
    const other = await hashPassword(password);
    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(hash).not.toBe(other);
    expect(hash).not.toContain(password);
    const [, N, r, p, salt, expected] = hash.split('$');
    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
        (error, value) => {
          if (error) reject(error);
          else resolve(value);
        },
      );
    });
    expect(key.toString('hex')).toBe(expected);
  });
});
