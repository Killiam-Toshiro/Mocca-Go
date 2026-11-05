import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'node:http';
import request from 'supertest';
import { createApplication } from '../src/bootstrap';
import { AppEnvironment } from '../src/config/environment';

describe('API: health y configuración real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health es público y solo indica disponibilidad del proceso', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/v1/health')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect({ status: 'ok' });
  });

  it.each(['/health', '/api/v1/no-existe'])(
    'devuelve 404 para %s',
    async (path) => {
      await request(app.getHttpServer() as Server)
        .get(path)
        .expect(404);
    },
  );

  it('ConfigService entrega el puerto validado como número', () => {
    const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
    expect(config.get('PORT', { infer: true })).toBe(3000);
    expect(config.get('NODE_ENV', { infer: true })).toBe('test');
  });
});
