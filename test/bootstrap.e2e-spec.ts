import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApplication, startApplication } from '../src/bootstrap';
import { AppEnvironment } from '../src/config/environment';

describe('Arranque del listener HTTP', () => {
  let app: INestApplication;
  let configuredPort: number;

  beforeEach(async () => {
    app = await createApplication({ logger: false });
    configuredPort = app
      .get<ConfigService<AppEnvironment, true>>(ConfigService)
      .get('PORT', { infer: true });
  });

  afterEach(async () => {
    try {
      await app.close();
    } finally {
      app
        .get<ConfigService<AppEnvironment, true>>(ConfigService)
        .set('PORT', configuredPort);
    }
  });

  it('escucha peticiones en el puerto indicado por ConfigService', async () => {
    // Puerto efímero solo en el test; la configuración de entorno exige 1..65535.
    app.get<ConfigService<AppEnvironment, true>>(ConfigService).set('PORT', 0);
    await startApplication(app);
    const address = (app.getHttpServer() as Server).address() as AddressInfo;

    expect(address.address).toBe('0.0.0.0');
    expect(address.port).toBeGreaterThan(0);
    await request(`http://127.0.0.1:${address.port}`)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('rechaza el arranque y cierra la aplicación si el puerto está ocupado', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(0, '0.0.0.0', resolve),
    );

    try {
      const address = occupied.address() as AddressInfo;
      app
        .get<ConfigService<AppEnvironment, true>>(ConfigService)
        .set('PORT', address.port);

      await expect(startApplication(app)).rejects.toMatchObject({
        code: 'EADDRINUSE',
      });
      expect((app.getHttpServer() as Server).listening).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupied.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
