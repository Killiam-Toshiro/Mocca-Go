import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryRunner } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { Session } from '../../src/auth/entities/session.entity';
import { User, UserRole } from '../../src/users/entities/user.entity';
import { Product } from '../../src/products/entities/products.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { MAX_STOCK } from '../../src/movements/movements.dto';
import { runSeed } from '../../src/seed/seed';
import { hashPassword } from '../../src/seed/password';
import { quoteIdentifier } from '../../src/database/database.config';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

interface MovementBody {
  id: string;
  productId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  user: { id: string; username: string };
  createdAt: string;
}
interface Created {
  movement: MovementBody;
  stock: number;
}
interface History {
  data: MovementBody[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

describe('Movimientos HTTP, saldo e historial con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let admin: User;
  let operator: User;
  let token: string;
  let operatorToken: string;
  let session: Session;
  let product: Product;
  let hash: string;
  const schema = () => quoteIdentifier(context.ownedSchema);
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    hash = await hashPassword('Movement-test-password');
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    admin = await user('admin', 'admin');
    operator = await user('operador', 'operador');
    product = await context.source
      .getRepository(Product)
      .save({ sku: 'MOV-001', name: 'Producto de prueba' });
    await openApp();
    const access = await credentials(admin);
    token = access.token;
    session = access.session;
    operatorToken = (await credentials(operator)).token;
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  async function openApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
  }
  function user(username: string, role: UserRole) {
    return context.source
      .getRepository(User)
      .save({ username, role, passwordHash: hash });
  }
  async function credentials(actor: User) {
    const actorSession = await context.source
      .getRepository(Session)
      .save({ userId: actor.id, expiresAt: new Date(Date.now() + 900_000) });
    const jwt = await app
      .get(JwtService)
      .signAsync({ sub: actor.id, sid: actorSession.id, typ: 'access' });
    return { token: jwt, session: actorSession };
  }
  const payload = (changes: object = {}) => ({
    productId: product.id,
    type: 'IN',
    quantity: 10,
    reason: 'Carga de prueba',
    ...changes,
  });
  const create = (body: object = payload(), bearer = token) =>
    request(server)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);
  const list = (query = '', bearer = token) =>
    request(server)
      .get('/api/v1/movements' + query)
      .set('Authorization', `Bearer ${bearer}`);
  const stored = () =>
    context.source.getRepository(Product).findOneByOrFail({ id: product.id });
  const count = () => context.source.getRepository(StockMovement).count();
  function assertSafe(movement: MovementBody) {
    expect(Object.keys(movement).sort()).toEqual([
      'createdAt',
      'id',
      'productId',
      'quantity',
      'reason',
      'type',
      'user',
    ]);
    expect(Object.keys(movement.user).sort()).toEqual(['id', 'username']);
    expect(new Date(movement.createdAt).toISOString()).toBe(movement.createdAt);
    expect(JSON.stringify(movement)).not.toMatch(
      /password|totp|seedKey|sessionId/,
    );
  }

  it('ambas rutas exigen sesión y no aceptan JWT inválidos, con sesión inexistente o de otro tipo, ni sesión revocada/vencida', async () => {
    await request(server)
      .get('/api/v1/movements')
      .expect(401)
      .expect('Cache-Control', 'no-store');
    await request(server).post('/api/v1/movements').send(payload()).expect(401);
    const jwt = app.get(JwtService);
    const forgedBearers = [
      'invalid',
      await jwt.signAsync({ sub: admin.id, sid: randomUUID(), typ: 'access' }),
      await jwt.signAsync({ sub: admin.id, sid: session.id, typ: 'other' }),
    ];
    for (const bearer of forgedBearers) {
      await create(payload(), bearer).expect(401);
      await list('', bearer).expect(401);
    }
    await context.source
      .getRepository(Session)
      .update(session.id, { revokedAt: new Date() });
    await create().expect(401);
    await context.source
      .getRepository(Session)
      .update(session.id, { revokedAt: null, expiresAt: new Date(0) });
    await list().expect(401);
    expect(await count()).toBe(0);
  });

  it('admin/operador registran entrada 10 y salida 4 con responsable, saldo 6 y consulta segura', async () => {
    const incoming = (
      await create().expect(201).expect('Cache-Control', 'no-store')
    ).body as Created;
    const outgoing = (
      await create(payload({ type: 'OUT', quantity: 4 }), operatorToken).expect(
        201,
      )
    ).body as Created;
    expect(incoming.stock).toBe(10);
    expect(outgoing.stock).toBe(6);
    expect(incoming.movement.user).toEqual({ id: admin.id, username: 'admin' });
    expect(outgoing.movement.user).toEqual({
      id: operator.id,
      username: 'operador',
    });
    assertSafe(incoming.movement);
    assertSafe(outgoing.movement);
    expect((await stored()).stock).toBe(6);
    const history = (
      await list('', operatorToken)
        .expect(200)
        .expect('Cache-Control', 'no-store')
    ).body as History;
    expect(history.total).toBe(2);
    expect(history.data.map((m) => m.type)).toEqual(['OUT', 'IN']);
    history.data.forEach(assertSafe);
  });

  it('consume saldo exacto y POST repetido registra otra entrada', async () => {
    await create(payload({ quantity: 2 })).expect(201);
    await create(payload({ quantity: 2 })).expect(201);
    expect((await stored()).stock).toBe(4);
    await create(payload({ type: 'OUT', quantity: 4 })).expect(201);
    expect((await stored()).stock).toBe(0);
    expect(await count()).toBe(3);
  });

  it.each([
    { productId: 'bad' },
    { productId: null },
    { productId: undefined },
    { type: 'in' },
    { type: 'ADJUST' },
    { type: undefined },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 0.1 },
    { quantity: '1' },
    { quantity: true },
    { quantity: null },
    { quantity: undefined },
    { quantity: MAX_STOCK + 1 },
    { reason: '' },
    { reason: ' \t\n' },
    { reason: 'a\u0000b' },
    { reason: 'a'.repeat(301) },
    { reason: null },
    { reason: undefined },
    { userId: randomUUID() },
    { stock: 100 },
    { seedKey: 'injected' },
    { createdAt: '2026-01-01' },
  ])('400 para body inválido %j sin modificar datos', async (changes) => {
    await create(payload(changes))
      .expect(400)
      .expect('Cache-Control', 'no-store');
    expect((await stored()).stock).toBe(0);
    expect(await count()).toBe(0);
  });

  it('acepta límites de motivo/cantidad y rechaza overflow sin error SQL', async () => {
    await create(
      payload({ quantity: MAX_STOCK, reason: 'x'.repeat(300) }),
    ).expect(201);
    const response = await create(payload({ quantity: 1 })).expect(409);
    expect(JSON.stringify(response.body)).not.toMatch(
      /integer|SQL|postgres|stock_movements/i,
    );
    expect((await stored()).stock).toBe(MAX_STOCK);
    expect(await count()).toBe(1);
    await create(payload({ type: 'OUT', quantity: MAX_STOCK })).expect(201);
    expect((await stored()).stock).toBe(0);
  });

  it('404 inexistente, 409 insuficiente/inactivo; preserva stock y registros', async () => {
    await create(payload({ productId: randomUUID() })).expect(404);
    await create(payload({ type: 'OUT', quantity: 1 })).expect(409);
    await create().expect(201);
    await request(server)
      .patch(`/api/v1/products/${product.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false })
      .expect(200);
    await create().expect(409);
    await create(payload({ type: 'OUT' })).expect(409);
    expect((await stored()).stock).toBe(10);
    expect(await count()).toBe(1);
    expect(((await list().expect(200)).body as History).total).toBe(1);
  });

  it('un fallo real al insertar historial revierte stock y devuelve 500 sin SQL', async () => {
    await context.source.query(
      `CREATE FUNCTION ${schema()}.reject_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced_private_error'; END; $$`,
    );
    await context.source.query(
      `CREATE TRIGGER reject_movement BEFORE INSERT ON ${schema()}.stock_movements FOR EACH ROW EXECUTE FUNCTION ${schema()}.reject_movement()`,
    );
    const response = await create()
      .expect(500)
      .expect('Cache-Control', 'no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /forced_private|INSERT|stock_movements|postgres/i,
    );
    expect((await stored()).stock).toBe(0);
    expect((await stored()).updatedAt).toEqual(product.updatedAt);
    expect(await count()).toBe(0);
  });

  it('historial vacío, filtros combinados, paginación, orden/desempate y página fuera del total', async () => {
    expect((await list().expect(200)).body).toEqual({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    const second = await context.source
      .getRepository(Product)
      .save({ sku: 'MOV-002', name: 'Otro' });
    await create().expect(201);
    await create(payload({ type: 'OUT', quantity: 1 })).expect(201);
    await create(payload({ productId: second.id })).expect(201);
    await context.source
      .getRepository(StockMovement)
      .createQueryBuilder()
      .update()
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .execute();
    const all = (await list().expect(200)).body as History;
    expect(all.data.map((m) => m.id)).toEqual(
      all.data
        .map((m) => m.id)
        .sort()
        .reverse(),
    );
    expect(all.total).toBe(3);
    const page = (await list('?limit=2&page=1').expect(200)).body as History;
    expect(page).toMatchObject({ limit: 2, page: 1, total: 3, totalPages: 2 });
    expect(page.data).toHaveLength(2);
    expect(
      ((await list('?limit=2&page=2').expect(200)).body as History).data,
    ).toHaveLength(1);
    expect(
      ((await list('?limit=2&page=3').expect(200)).body as History).data,
    ).toEqual([]);
    const filtered = (
      await list(`?productId=${product.id}&type=OUT`).expect(200)
    ).body as History;
    expect(filtered.total).toBe(1);
    expect(filtered.data[0]).toMatchObject({
      productId: product.id,
      type: 'OUT',
    });
    expect(
      ((await list(`?productId=${product.id}`).expect(200)).body as History)
        .total,
    ).toBe(2);
    expect(((await list('?type=IN').expect(200)).body as History).total).toBe(
      2,
    );
    expect(
      ((await list(`?productId=${randomUUID()}`).expect(200)).body as History)
        .total,
    ).toBe(0);
    all.data.forEach(assertSafe);
  });

  it.each([
    '?page=0',
    '?page=01',
    '?page=10001',
    '?page=1&page=2',
    '?limit=0',
    '?limit=101',
    '?limit=1.5',
    '?limit=1e2',
    '?productId=bad',
    '?productId=a&productId=b',
    '?type=in',
    '?type=IN&type=OUT',
    '?userId=bad',
    '?stock=10',
  ])('400 para query inválida %s', async (query) => {
    await list(query).expect(400);
  });

  it('incluye historial del seed sin seedKey y no ofrece PATCH/DELETE', async () => {
    await runSeed(context.source, {
      adminPassword: 'Seed-test-admin-password',
      operatorPassword: 'Seed-test-operator-password',
    });
    const history = (await list().expect(200)).body as History;
    expect(history.total).toBe(3);
    expect(history.data.map((m) => m.quantity).sort((a, b) => a - b)).toEqual([
      10, 20, 30,
    ]);
    history.data.forEach(assertSafe);
    for (const method of ['patch', 'delete'] as const) {
      const client = request(server);
      await client[method](`/api/v1/movements/${history.data[0].id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    }
    expect(await count()).toBe(3);
  });

  it('dos salidas concurrentes de 4 con saldo 6 dejan 2 y un solo OUT', async () => {
    await create(payload({ quantity: 6 })).expect(201);
    const responses = await Promise.all([
      create(payload({ type: 'OUT', quantity: 4 })),
      create(payload({ type: 'OUT', quantity: 4 }), operatorToken),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await stored()).stock).toBe(2);
    expect(
      await context.source
        .getRepository(StockMovement)
        .countBy({ type: 'OUT' }),
    ).toBe(1);
    expect(await count()).toBe(2);
  });

  it('entradas concurrentes no pierden saldo; catálogo concurrente conserva sus campos', async () => {
    const writes = Array.from({ length: 8 }, () =>
      create(payload({ quantity: 1 })).then((r) => r.status),
    );
    const edit = request(server)
      .patch(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre concurrente' })
      .then((r) => r.status);
    expect(await Promise.all(writes)).toEqual(Array(8).fill(201));
    expect(await edit).toBe(200);
    expect(await stored()).toMatchObject({
      stock: 8,
      name: 'Nombre concurrente',
      sku: 'MOV-001',
      active: true,
    });
    expect(await count()).toBe(8);
  });

  async function holdProduct(): Promise<QueryRunner> {
    const holder = context.source.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(
      `SELECT id FROM ${schema()}.products WHERE id=$1 FOR UPDATE`,
      [product.id],
    );
    return holder;
  }
  async function observeWait() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await context.source.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%FOR UPDATE%' AND query LIKE $1`,
        ['%' + context.ownedSchema + '%'],
      );
      if (Number(rows[0].total) > 0) return;
      await pause(20);
    }
    throw new Error('No se observó la espera del movimiento');
  }

  it.each(['revoked', 'expired', 'inactive'] as const)(
    'revalida %s después de esperar el bloqueo y no escribe',
    async (state) => {
      const holder = await holdProduct();
      const pending = create().then((r) => r.status);
      try {
        await observeWait();
        if (state === 'inactive')
          await holder.query(
            `UPDATE ${schema()}.products SET active=false WHERE id=$1`,
            [product.id],
          );
        else
          await context.source
            .getRepository(Session)
            .update(
              session.id,
              state === 'revoked'
                ? { revokedAt: new Date() }
                : { expiresAt: new Date(0) },
            );
        await holder.commitTransaction();
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
      expect(await pending).toBe(state === 'inactive' ? 409 : 401);
      expect((await stored()).stock).toBe(0);
      expect(await count()).toBe(0);
    },
  );

  it('productos distintos avanzan independientemente aunque otro esté bloqueado', async () => {
    const second = await context.source
      .getRepository(Product)
      .save({ sku: 'MOV-002', name: 'Segundo' });
    const holder = await holdProduct();
    const pending = create().then((r) => r.status);
    try {
      await observeWait();
      await create(payload({ productId: second.id })).expect(201);
      await holder.commitTransaction();
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
    expect(await pending).toBe(201);
    expect(await count()).toBe(2);
  });

  it('saldo e historial sobreviven al reiniciar la aplicación', async () => {
    const created = (await create().expect(201)).body as Created;
    await app.close();
    if (!context.source.isInitialized) await context.source.initialize();
    await openApp();
    token = (await credentials(admin)).token;
    const history = (await list().expect(200)).body as History;
    expect(history.data[0].id).toBe(created.movement.id);
    expect((await stored()).stock).toBe(10);
  });
});
