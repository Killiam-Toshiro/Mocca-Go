import { databaseOptions } from '../../src/database/data-source';
import {
  quoteIdentifier,
  validateDatabaseEnvironment,
} from '../../src/database/database.config';
import { validateRuntimeEnvironment } from '../../src/config/runtime-environment';
import { assertTestTarget } from '../helpers/database';

const base = { DB_PASSWORD: 'test-only-password' };

describe('Configuración PostgreSQL', () => {
  it('aplica valores locales y exige password explícita', () => {
    expect(validateDatabaseEnvironment(base)).toEqual({
      DB_HOST: '127.0.0.1',
      DB_PORT: 5433,
      DB_NAME: 'inventory',
      DB_USERNAME: 'inventory',
      DB_PASSWORD: base.DB_PASSWORD,
      DB_SCHEMA: 'public',
      DB_SSL: false,
    });
    expect(() => validateDatabaseEnvironment({})).toThrow('DB_PASSWORD');
  });

  it('compone entorno HTTP y conexión sin alterar las credenciales', () => {
    const config = validateRuntimeEnvironment({
      ...base,
      JWT_SECRET: process.env.JWT_SECRET,
      NODE_ENV: 'production',
      PORT: '9000',
      DB_PORT: '5432',
      DB_SSL: 'true',
    });
    expect(config.PORT).toBe(9000);
    expect(config.DB_PORT).toBe(5432);
    expect(config.DB_PASSWORD).toBe(base.DB_PASSWORD);
    expect(config.DB_SSL).toBe(true);
  });

  it.each(['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD'])(
    'rechaza %s vacío o de otro tipo',
    (variable) => {
      for (const value of ['', '  ', 42]) {
        expect(() =>
          validateDatabaseEnvironment({ ...base, [variable]: value }),
        ).toThrow(variable);
      }
    },
  );

  it.each(['DB_NAME', 'DB_SCHEMA'])(
    'rechaza identificadores inválidos en %s',
    (variable) => {
      for (const value of [
        '',
        'UPPERCASE',
        'has space',
        'a;DROP TABLE users',
        '1abc',
        'a'.repeat(64),
      ]) {
        expect(() =>
          validateDatabaseEnvironment({ ...base, [variable]: value }),
        ).toThrow(variable);
      }
    },
  );

  it('rechaza conexión de test hacia la base de desarrollo', () => {
    expect(() =>
      validateDatabaseEnvironment({ ...base, NODE_ENV: 'test' }),
    ).toThrow('DB_NAME debe terminar en _test');
    expect(
      validateDatabaseEnvironment({
        ...base,
        NODE_ENV: 'test',
        DB_NAME: 'inventory_test',
      }).DB_NAME,
    ).toBe('inventory_test');
  });

  it.each(['0', '65536', '54x', '1.5'])(
    'rechaza DB_PORT inválido %s',
    (DB_PORT) => {
      expect(() => validateDatabaseEnvironment({ ...base, DB_PORT })).toThrow(
        'DB_PORT',
      );
    },
  );

  it.each(['', 'yes', true])('rechaza DB_SSL inválido %s', (DB_SSL) => {
    expect(() => validateDatabaseEnvironment({ ...base, DB_SSL })).toThrow(
      'DB_SSL',
    );
  });

  it.each(['true', 'false'])(
    'crea opciones ORM sin sincronización ni migraciones automáticas (SSL=%s)',
    (DB_SSL) => {
      const config = validateDatabaseEnvironment({ ...base, DB_SSL });
      expect(databaseOptions(config)).toMatchObject({
        type: 'postgres',
        synchronize: false,
        dropSchema: false,
        migrationsRun: false,
        logging: false,
        ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
      });
    },
  );

  it('escapa identificadores con comillas sin interpretarlos como SQL', () => {
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
  });
});

describe('Protección de limpieza de pruebas', () => {
  const schema = 'it_0123456789abcdef';
  const config = validateDatabaseEnvironment({
    ...base,
    NODE_ENV: 'test',
    DB_NAME: 'inventory_test',
    DB_SCHEMA: schema,
  });

  it('admite solo la base y esquema exclusivos', () => {
    expect(() => assertTestTarget(config, schema)).not.toThrow();
  });

  it.each([
    { ...config, DB_NAME: 'inventory' },
    { ...config, DB_SCHEMA: 'public' },
  ])('rechaza un destino distinto del creado por la suite', (invalid) => {
    expect(() => assertTestTarget(invalid, schema)).toThrow(
      'La limpieza requiere',
    );
  });

  it.each(['public', 'it_bad', 'it_0123456789abcdef;DROP SCHEMA public'])(
    'rechaza el esquema %s',
    (invalid) => {
      expect(() =>
        assertTestTarget({ ...config, DB_SCHEMA: invalid }, invalid),
      ).toThrow('La limpieza requiere');
    },
  );

  it('rechaza limpieza fuera de NODE_ENV=test', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => assertTestTarget(config, schema)).toThrow(
        'La limpieza requiere',
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
