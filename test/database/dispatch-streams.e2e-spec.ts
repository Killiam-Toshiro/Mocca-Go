import { CatalogHarness } from '../helpers/catalog-app';
import { Customer, Fixture, fixture, readyOrders } from '../helpers/orders-app';
import { OrderNotificationsService } from '../../src/orders/notifications/order-notifications.service';
import { eventually, StreamClient } from '../helpers/sse';

jest.setTimeout(30_000);

describe('Despacho: canal y avisos (CA-23 a CA-25)', () => {
  const harness = new CatalogHarness();
  const clients: StreamClient[] = [];
  let ana: Customer;
  let bea: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start({ heartbeatMs: 100, maxPerUser: 2 });
    ana = await harness.customer('ana');
    bea = await harness.customer('bea');
    f = await fixture(harness);
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await harness.stop();
  });

  const open = async (path: string, auth?: string) => {
    const client = await StreamClient.open(harness.server, path, auth);
    clients.push(client);
    return client;
  };
  const service = () => harness.app.get(OrderNotificationsService);

  it('CA-23: cliente, cocina y repartidor reciben los avisos que les corresponden', async () => {
    const anaStream = await open('/orders/stream', ana.auth);
    const beaStream = await open('/orders/stream', bea.auth);
    const kitchen = await open('/kitchen/stream', harness.as('operador'));
    const courier = await open('/dispatch/stream', harness.as('repartidor'));
    expect(courier.status).toBe(200);
    expect(courier.headers['content-type']).toContain('text/event-stream');
    expect(courier.headers['cache-control']).toBe('no-store');
    await courier.until(() => courier.events.length >= 1, 'ready');

    const [mine, hers] = await readyOrders(harness, ana, f, [f.point]).then(
      async (first) => [
        first[0],
        (await readyOrders(harness, bea, f, [f.point]))[0],
      ],
    );
    await harness
      .send('post', '/dispatch/rounds', { orderIds: [mine.id] }, 'repartidor')
      .expect(201);
    await harness
      .send('post', '/dispatch/rounds', { orderIds: [hers.id] }, 'repartidor')
      .expect(201);
    await harness
      .send(
        'post',
        `/dispatch/orders/${mine.id}/deliver`,
        undefined,
        'repartidor',
      )
      .expect(200);
    await harness
      .send(
        'post',
        `/dispatch/orders/${hers.id}/fail`,
        { reason: 'No contestó' },
        'repartidor',
      )
      .expect(200);

    const statuses = (stream: StreamClient, id: string) =>
      stream.notices.filter((n) => n.orderId === id).map((n) => n.status);
    await anaStream.until(
      () => statuses(anaStream, mine.id).length >= 3,
      'Ana',
    );
    await beaStream.until(
      () => statuses(beaStream, hers.id).length >= 3,
      'Bea',
    );
    expect(statuses(anaStream, mine.id)).toEqual([
      'recibido',
      'en_camino',
      'entregado',
    ]);
    expect(statuses(anaStream, hers.id)).toEqual([]);
    expect(statuses(beaStream, hers.id)).toEqual([
      'recibido',
      'en_camino',
      'no_entregado',
    ]);
    expect(statuses(beaStream, mine.id)).toEqual([]);
    for (const stream of [kitchen, courier]) {
      await stream.until(() => stream.notices.length >= 6, 'seis avisos');
      expect(statuses(stream, mine.id)).toEqual([
        'recibido',
        'en_camino',
        'entregado',
      ]);
      expect(statuses(stream, hers.id)).toEqual([
        'recibido',
        'en_camino',
        'no_entregado',
      ]);
    }
    expect(courier.raw).not.toMatch(/Cliente|3001112233|Sin respuesta|4242/);
  });

  it('CA-24: solo el repartidor abre el canal; los demás 403 y sin sesión 401', async () => {
    for (const who of [
      harness.as('cliente'),
      harness.as('admin'),
      harness.as('operador'),
    ])
      expect((await open('/dispatch/stream', who)).status).toBe(403);
    expect((await open('/dispatch/stream')).status).toBe(401);
    expect((await open('/dispatch/stream', 'Bearer x')).status).toBe(401);
    expect(service().openStreams).toBe(0);
  });

  it('CA-24: mismos límites que la cocina: el tercer canal del usuario recibe 429', async () => {
    const auth = harness.as('repartidor');
    await open('/dispatch/stream', auth);
    const second = await open('/dispatch/stream', auth);
    const third = await open('/dispatch/stream', auth);
    expect(third.status).toBe(429);
    second.close();
    await eventually(() => service().openStreams === 1, 'canal liberado');
    expect((await open('/dispatch/stream', auth)).status).toBe(200);
  });

  it('CA-25: las respuestas de /dispatch no se guardan en caché, también las de error', async () => {
    for (const [path, role] of [
      ['/dispatch/queue', 'repartidor'],
      ['/dispatch/rounds', 'repartidor'],
      ['/dispatch/queue', 'cliente'],
    ] as const) {
      const response = await harness.get(path, role);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    const unauthorized = await harness.get('/dispatch/queue');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers['cache-control']).toBe('no-store');
  });
});
