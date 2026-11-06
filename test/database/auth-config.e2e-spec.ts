import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Session } from '../../src/auth/entities/session.entity';
import { validateRuntimeEnvironment } from '../../src/config/runtime-environment';
import { configureApplication } from '../../src/configure-app';
import { hashPassword } from '../../src/seed/password';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

const password = 'Integration-only-password';

describe('Duración e identidad del JWT (CA-15 a CA-17)', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let user: User;

  // ConfigModule valida el entorno al importar AppModule, así que la duración
  // se inyecta sustituyendo ConfigService con el entorno ya validado.
  async function start(ttl?: number): Promise<void> {
    const values: Record<string, unknown> = {
      ...validateRuntimeEnvironment(process.env),
    };
    if (ttl !== undefined) values.ACCESS_TOKEN_TTL_SECONDS = ttl;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .overrideProvider(ConfigService)
      .useValue({ get: (key: string) => values[key] })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
    server = app.getHttpServer() as Server;
  }
  const login = () =>
    request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'ttl_admin', password });

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    user = await context.source.getRepository(User).save({
      username: 'ttl_admin',
      role: 'admin',
      passwordHash: await hashPassword(password),
    });
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  it('con ACCESS_TOKEN_TTL_SECONDS=120 el JWT y la sesión duran 120 segundos', async () => {
    await start(120);
    const before = Date.now();
    const response = await login().expect(200);
    const body = response.body as { accessToken: string; expiresIn: number };
    expect(body.expiresIn).toBe(120);
    const claims = app.get(JwtService).decode<{
      exp: number;
      iat: number;
      iss: string;
      aud: string;
    }>(body.accessToken);
    expect(claims.exp - claims.iat).toBe(120);
    expect(claims.iss).toBe('mocca-go-api');
    expect(claims.aud).toBe('mocca-go-client');
    const session = await context.source
      .getRepository(Session)
      .findOneByOrFail({ userId: user.id });
    const remaining = session.expiresAt.getTime() - before;
    expect(remaining).toBeGreaterThan(115_000);
    expect(remaining).toBeLessThan(125_000);
  });

  it('sin la variable la duración es de 900 segundos', async () => {
    await start();
    const response = await login().expect(200);
    expect((response.body as { expiresIn: number }).expiresIn).toBe(900);
  });

  it('rechaza un JWT con el issuer y la audience anteriores', async () => {
    await start();
    const session = await context.source
      .getRepository(Session)
      .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
    const legacy = await new JwtService({
      secret: process.env.JWT_SECRET,
    }).signAsync(
      { sub: user.id, sid: session.id, typ: 'access' },
      {
        issuer: 'inventory-api',
        audience: 'inventory-client',
        expiresIn: 600,
      },
    );
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${legacy}`)
      .expect(401);
    const current = await new JwtService({
      secret: process.env.JWT_SECRET,
    }).signAsync(
      { sub: user.id, sid: session.id, typ: 'access' },
      {
        issuer: 'mocca-go-api',
        audience: 'mocca-go-client',
        expiresIn: 600,
      },
    );
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${current}`)
      .expect(200);
  });
});
