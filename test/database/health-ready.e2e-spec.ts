import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Server } from 'node:http';
import request from 'supertest';
import { createApplication } from '../../src/bootstrap';
import { READINESS_TIMEOUT_MS } from '../../src/health/health.controller';

describe('GET /health/ready: readiness con PostgreSQL real', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    app = await createApplication({ logger: false });
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await app.close();
  });

  const ready = () => request(server).get('/api/v1/health/ready');

  it('CA-15: es público y responde 200 {"status":"ok"} con no-store cuando la BD responde', async () => {
    const query = jest.spyOn(app.get(DataSource), 'query');
    await ready()
      .expect(200)
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store')
      .expect({ status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('no tiene límite de peticiones: supera las 20 por minuto de /auth sin 429', async () => {
    for (let index = 0; index < 25; index++) await ready().expect(200);
  });

  it('CA-15: si la consulta falla responde 503 genérico, con no-store y sin detalles', async () => {
    jest
      .spyOn(app.get(DataSource), 'query')
      .mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.7:5432 password=secret'),
      );
    const response = await ready()
      .expect(503)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toEqual({
      statusCode: 503,
      message: 'Base de datos no disponible.',
      error: 'Service Unavailable',
    });
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.7|secret/);
  });

  it('CA-15: si la consulta no responde en 2 s devuelve 503 en lugar de quedar colgada', async () => {
    jest
      .spyOn(app.get(DataSource), 'query')
      .mockReturnValue(new Promise(() => undefined));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const pending = ready().then((r) => r);
    // Espera a que la petición llegue al controlador y arme su temporizador.
    while (jest.getTimerCount() === 0)
      await new Promise((resolve) => setImmediate(resolve));
    await jest.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      message: 'Base de datos no disponible.',
    });
  });

  it('GET /health sigue sin consultar la base y sin no-store', async () => {
    const query = jest.spyOn(app.get(DataSource), 'query');
    const response = await request(server).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('se recupera cuando la base vuelve a responder', async () => {
    const query = jest
      .spyOn(app.get(DataSource), 'query')
      .mockRejectedValueOnce(new Error('caída'));
    await ready().expect(503);
    query.mockRestore();
    await ready().expect(200);
  });
});
