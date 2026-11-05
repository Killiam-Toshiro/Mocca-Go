import {
  parseCorsOrigins,
  validateEnvironment,
} from '../../src/config/environment';
import { validateRuntimeEnvironment } from '../../src/config/runtime-environment';
import {
  parseAccessTokenTtl,
  validateAuthEnvironment,
} from '../../src/auth/auth.config';

describe('Configuración de la aplicación', () => {
  it('usa valores por defecto cuando no hay variables', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY_HOPS: 0,
      CORS_ORIGINS: [],
    });
  });

  it.each(['development', 'test', 'production'])(
    'acepta el entorno %s',
    (NODE_ENV) => {
      expect(validateEnvironment({ NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
    },
  );

  it.each(['1', '3000', '65535'])(
    'convierte el puerto válido %s a número',
    (PORT) => {
      expect(validateEnvironment({ PORT }).PORT).toBe(Number(PORT));
    },
  );

  it.each([
    '',
    '0',
    '-1',
    '65536',
    '3000.5',
    '3000abc',
    ' 3000 ',
    '1e3',
    '9007199254740993',
    3000,
  ])('rechaza un puerto inválido (%s)', (PORT) => {
    expect(() => validateEnvironment({ PORT })).toThrow(
      'PORT debe ser un entero entre 1 y 65535.',
    );
  });

  it.each(['', 'staging', 123])(
    'rechaza un entorno inválido (%s)',
    (NODE_ENV) => {
      expect(() => validateEnvironment({ NODE_ENV })).toThrow(
        'NODE_ENV debe ser development, test o production.',
      );
    },
  );

  it.each(['0', '1', '2', '10'])(
    'acepta TRUST_PROXY_HOPS=%s como número de proxies de confianza',
    (TRUST_PROXY_HOPS) => {
      expect(validateEnvironment({ TRUST_PROXY_HOPS }).TRUST_PROXY_HOPS).toBe(
        Number(TRUST_PROXY_HOPS),
      );
    },
  );

  it.each(['', '-1', '11', '99', '100', '1.5', ' 1', 'true', 'abc', 1])(
    'rechaza TRUST_PROXY_HOPS inválido (%s)',
    (TRUST_PROXY_HOPS) => {
      expect(() => validateEnvironment({ TRUST_PROXY_HOPS })).toThrow(
        /^TRUST_PROXY_HOPS debe ser un entero entre 0 y 10\.$/,
      );
    },
  );

  it('el error no expone valores recibidos ni otras variables', () => {
    expect(() =>
      validateEnvironment({
        PORT: 'valor-confidencial',
        OTHER: 'dato-privado',
      }),
    ).toThrow(/^PORT debe ser un entero entre 1 y 65535\.$/);
  });
});

describe('CORS_ORIGINS', () => {
  it.each([undefined, ''])('%p desactiva CORS', (value) => {
    expect(parseCorsOrigins(value)).toEqual([]);
    expect(validateEnvironment({ CORS_ORIGINS: value }).CORS_ORIGINS).toEqual(
      [],
    );
  });

  it.each([
    ['http://localhost:3001', ['http://localhost:3001']],
    [
      'http://localhost:3001,https://mocca-go.example.com',
      ['http://localhost:3001', 'https://mocca-go.example.com'],
    ],
  ])('acepta la lista válida %s', (value, expected) => {
    expect(parseCorsOrigins(value)).toEqual(expected);
  });

  it.each([
    '*',
    'localhost:3001',
    'http://localhost:3001/',
    'http://localhost:3001/app',
    'ftp://localhost:3001',
    'http://localhost:3001,',
    ',http://localhost:3001',
    'http://localhost:3001,,https://a.example.com',
    'http://localhost:3001, https://a.example.com',
    'http://localhost:3001,http://localhost:3001',
    'HTTP://LOCALHOST:3001',
    'http://localhost:3001?x=1',
    123,
  ])('rechaza %p sin divulgar su valor', (value) => {
    let message = '';
    try {
      parseCorsOrigins(value);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      'CORS_ORIGINS debe ser una lista de orígenes http(s) separados por comas.',
    );
    expect(message).not.toContain(String(value));
  });
});

describe('ACCESS_TOKEN_TTL_SECONDS', () => {
  const secret = 'unit-integration-test-jwt-secret-32-bytes';

  it('usa 900 segundos por defecto', () => {
    expect(parseAccessTokenTtl(undefined)).toBe(900);
    expect(
      validateAuthEnvironment({ JWT_SECRET: secret }).ACCESS_TOKEN_TTL_SECONDS,
    ).toBe(900);
  });

  it.each(['60', '120', '28800', '86400'])('acepta %s', (value) => {
    expect(parseAccessTokenTtl(value)).toBe(Number(value));
  });

  it.each(['59', '86401', '12.5', 'abc', '', ' 120', '1e3', '-60', 120])(
    'rechaza %p',
    (value) => {
      expect(() => parseAccessTokenTtl(value)).toThrow(
        'ACCESS_TOKEN_TTL_SECONDS debe ser un entero entre 60 y 86400.',
      );
    },
  );
});

describe('Entorno de ejecución completo (arranque)', () => {
  const valid = {
    DB_PASSWORD: 'test-only-password',
    JWT_SECRET: 'unit-integration-test-jwt-secret-32-bytes',
  };

  it('compone CORS_ORIGINS y ACCESS_TOKEN_TTL_SECONDS', () => {
    const config = validateRuntimeEnvironment({
      ...valid,
      CORS_ORIGINS: 'http://localhost:3001',
      ACCESS_TOKEN_TTL_SECONDS: '120',
    });
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3001']);
    expect(config.ACCESS_TOKEN_TTL_SECONDS).toBe(120);
  });

  it.each(['59', '86401', '12.5', 'abc'])(
    'no arranca con ACCESS_TOKEN_TTL_SECONDS=%s',
    (ACCESS_TOKEN_TTL_SECONDS) => {
      expect(() =>
        validateRuntimeEnvironment({ ...valid, ACCESS_TOKEN_TTL_SECONDS }),
      ).toThrow('ACCESS_TOKEN_TTL_SECONDS');
    },
  );

  it.each(['*', 'http://localhost:3001/', 'localhost:3001'])(
    'no arranca con CORS_ORIGINS=%s y no divulga el valor',
    (CORS_ORIGINS) => {
      expect(() =>
        validateRuntimeEnvironment({ ...valid, CORS_ORIGINS }),
      ).toThrow(
        new Error(
          'CORS_ORIGINS debe ser una lista de orígenes http(s) separados por comas.',
        ),
      );
    },
  );
});
