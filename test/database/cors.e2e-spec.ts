import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createApplication } from '../../src/bootstrap';
import { AppEnvironment } from '../../src/config/environment';
import { configureApplication } from '../../src/configure-app';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

const ALLOWED = 'http://localhost:3001';
const OTHER = 'https://otro-sitio.example.com';

describe('CORS para el frontend de Mocca Go (CA-12, CA-13)', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;

  async function start(corsOrigins?: string[]): Promise<void> {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app, corsOrigins ? { corsOrigins } : undefined);
    await app.init();
    server = app.getHttpServer() as Server;
  }
  const preflight = (origin: string) =>
    request(server)
      .options('/api/v1/products')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  it('responde el preflight de un origen autorizado sin pasar por la autenticación', async () => {
    await start([ALLOWED]);
    const response = await preflight(ALLOWED).expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type',
    );
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(response.headers.vary).toContain('Origin');
  });

  it('una petición real de un origen autorizado recibe el origen exacto y Vary', async () => {
    await start([ALLOWED, 'https://mocca-go.example.com']);
    const response = await request(server)
      .get('/api/v1/health')
      .set('Origin', 'https://mocca-go.example.com')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://mocca-go.example.com',
    );
    expect(response.headers.vary).toContain('Origin');
  });

  it('un origen no listado no recibe cabeceras CORS, ni en el preflight', async () => {
    await start([ALLOWED]);
    const real = await request(server)
      .get('/api/v1/health')
      .set('Origin', OTHER)
      .expect(200);
    expect(real.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await preflight(OTHER);
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sin orígenes configurados CORS queda desactivado', async () => {
    await start();
    const response = await request(server)
      .get('/api/v1/health')
      .set('Origin', ALLOWED)
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await preflight(ALLOWED);
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('createApplication lee CORS_ORIGINS de la configuración; vacío por defecto', async () => {
    const built = await createApplication({ logger: false });
    try {
      expect(
        built
          .get<ConfigService<AppEnvironment, true>>(ConfigService)
          .get('CORS_ORIGINS', { infer: true }),
      ).toEqual([]);
      await built.init();
      const response = await request(built.getHttpServer() as Server)
        .get('/api/v1/health')
        .set('Origin', ALLOWED)
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await built.close();
    }
  });
});
