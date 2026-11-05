import { seedCredentials } from '../../src/seed/credentials';
import { runCommand } from '../../src/database/commands';

const passwords = {
  SEED_ADMIN_PASSWORD: 'test-only-admin-password',
  SEED_OPERATOR_PASSWORD: 'test-only-operator-password',
};

describe('Credenciales de seed', () => {
  it('requiere ambas contraseñas válidas y conserva su valor', () => {
    expect(seedCredentials(passwords)).toEqual({
      adminPassword: passwords.SEED_ADMIN_PASSWORD,
      operatorPassword: passwords.SEED_OPERATOR_PASSWORD,
    });
  });

  it.each(['SEED_ADMIN_PASSWORD', 'SEED_OPERATOR_PASSWORD'])(
    'rechaza %s inválida sin divulgar su valor',
    (variable) => {
      for (const value of [
        undefined,
        123,
        '',
        'short',
        ' '.repeat(12),
        'x'.repeat(129),
      ]) {
        expect(() =>
          seedCredentials({ ...passwords, [variable]: value }),
        ).toThrow(`${variable} debe tener entre 12 y 128 caracteres.`);
      }
    },
  );

  it.each([12, 128])('acepta el límite de %i caracteres', (length) => {
    expect(
      seedCredentials({
        SEED_ADMIN_PASSWORD: 'x'.repeat(length),
        SEED_OPERATOR_PASSWORD: 'y'.repeat(length),
      }).adminPassword.length,
    ).toBe(length);
  });
});

describe('Errores de comandos', () => {
  it('no divulga errores internos y devuelve estado de fallo', async () => {
    const previous = process.exitCode;
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await runCommand(() =>
        Promise.reject(new Error('sql-with-private-password')),
      );
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join(' ')).not.toContain(
        'sql-with-private-password',
      );
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      process.exitCode = previous;
      error.mockRestore();
    }
  });

  it('ejecuta una operación exitosa sin señalar error', async () => {
    let completed = false;
    await runCommand(() => {
      completed = true;
      return Promise.resolve();
    });
    expect(completed).toBe(true);
  });
});
