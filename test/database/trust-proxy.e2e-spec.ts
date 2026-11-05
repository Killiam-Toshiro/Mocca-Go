import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

// El cuerpo vacío produce 400 antes de consultar cuentas: solo cuenta el límite por IP.
const LIMIT = 20;

describe('IP del cliente detrás de un proxy (DP-07)', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;

  async function start(trustProxyHops?: number): Promise<void> {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(
      app,
      trustProxyHops === undefined ? undefined : { trustProxyHops },
    );
    await app.init();
    server = app.getHttpServer() as Server;
  }

  function login(forwardedFor?: string) {
    const call = request(server).post('/api/v1/auth/login');
    if (forwardedFor) call.set('X-Forwarded-For', forwardedFor);
    return call.send({});
  }

  async function exhaust(forwardedFor?: string): Promise<void> {
    for (let i = 0; i < LIMIT; i++) await login(forwardedFor).expect(400);
    await login(forwardedFor).expect(429);
  }

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  it('con un proxy de confianza, cada IP reenviada tiene su propio límite', async () => {
    await start(1);
    await exhaust('203.0.113.10');
    await login('203.0.113.10').expect(429);
    await login('198.51.100.20').expect(400);
  });

  it('con un proxy de confianza, se usa la IP añadida por el proxy y no la que inventa el cliente', async () => {
    await start(1);
    await exhaust('192.0.2.1, 203.0.113.10');
    await login('192.0.2.99, 203.0.113.10').expect(429);
  });

  it('por defecto ignora X-Forwarded-For: cambiar la cabecera no evita el 429', async () => {
    await start();
    await exhaust('203.0.113.10');
    await login('198.51.100.20').expect(429);
    await login().expect(429);
  });

  it('con 0 proxies se comporta igual que el valor por defecto', async () => {
    await start(0);
    await exhaust();
    await login('198.51.100.20').expect(429);
  });
});
