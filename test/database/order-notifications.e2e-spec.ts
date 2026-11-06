import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { createDataSource } from '../../src/database/data-source';
import { CatalogHarness } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';
import { StreamClient } from '../helpers/sse';

jest.setTimeout(30_000);

describe('Avisos entre instancias y reconexión (CA-13, CA-18)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  /** Segunda instancia de la API con su propio pool sobre la misma base. */
  const startSecond = async (): Promise<INestApplication> => {
    const own = createDataSource(harness.context.config);
    await own.initialize();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(own)
      .compile();
    const app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    return app;
  };
  const create = async () =>
    (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;

  it('CA-13: un cambio hecho en una instancia llega al canal abierto en la otra', async () => {
    const second = await startSecond();
    const server = second.getHttpServer() as Server;
    const stream = await StreamClient.open(server, '/orders/stream', ana.auth);
    const kitchen = await StreamClient.open(
      server,
      '/kitchen/stream',
      harness.as('operador'),
    );
    try {
      await stream.until(() => stream.events.length >= 1, 'ready');
      const order = await create();
      await harness
        .send(
          'post',
          `/kitchen/orders/${order.id}/start`,
          undefined,
          'operador',
        )
        .expect(200);
      await stream.until(
        () => stream.notices.length >= 2,
        'avisos del cliente',
      );
      await kitchen.until(
        () => kitchen.notices.length >= 2,
        'avisos de cocina',
      );
      expect(stream.notices.map((n) => n.status)).toEqual([
        'recibido',
        'en_preparacion',
      ]);
    } finally {
      stream.close();
      kitchen.close();
      await second.close();
    }
  });

  it('CA-18: si cae la conexión de escucha, la API reconecta, avisa con ready y los avisos vuelven', async () => {
    const stream = await StreamClient.open(
      harness.server,
      '/kitchen/stream',
      harness.as('operador'),
    );
    try {
      await stream.until(() => stream.events.length >= 1, 'ready inicial');
      const order = await create();
      await stream.until(() => stream.notices.length >= 1, 'primer aviso');

      const killed = await harness.context.source.query<{ pid: number }[]>(
        `SELECT pid FROM pg_stat_activity
         WHERE query = 'LISTEN order_events' AND pid <> pg_backend_pid()
           AND datname = current_database()`,
      );
      expect(killed.length).toBeGreaterThanOrEqual(1);
      for (const { pid } of killed)
        await harness.context.source.query(`SELECT pg_terminate_backend($1)`, [
          pid,
        ]);

      // El estado nunca depende del aviso: el cambio durante la caída queda guardado.
      await harness
        .send(
          'post',
          `/kitchen/orders/${order.id}/start`,
          undefined,
          'operador',
        )
        .expect(200);
      await stream.until(
        () => stream.events.filter((e) => e.event === 'ready').length >= 2,
        'ready tras la reconexión',
        15_000,
      );
      await harness
        .send(
          'post',
          `/kitchen/orders/${order.id}/ready`,
          undefined,
          'operador',
        )
        .expect(200);
      await stream.until(
        () => stream.notices.some((n) => n.status === 'listo'),
        'aviso posterior a la reconexión',
        15_000,
      );
      const listed = await harness
        .get('/kitchen/orders?status=listo', 'operador')
        .expect(200);
      expect((listed.body as { total: number }).total).toBe(1);
    } finally {
      stream.close();
    }
  });
});
