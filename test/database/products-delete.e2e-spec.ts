import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { Session } from '../../src/auth/entities/session.entity';
import { Product } from '../../src/products/entities/products.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { hashPassword } from '../../src/seed/password';
import { User, UserRole } from '../../src/users/entities/user.entity';
import { quoteIdentifier } from '../../src/database/database.config';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

interface ErrorBody {
  statusCode: number;
  message: string;
}

describe('DELETE /products/:id: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let admin: User;
  let adminToken: string;
  let operatorToken: string;
  let product: Product;
  let hash: string;
  const schema = () => quoteIdentifier(context.ownedSchema);
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    hash = await hashPassword('Integration-only-password');
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    admin = await user('admin', 'admin');
    const operator = await user('operador', 'operador');
    product = await context.source
      .getRepository(Product)
      .save({ sku: 'DEL-001', name: 'Producto para borrar' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    adminToken = await access(admin);
    operatorToken = await access(operator);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  function user(username: string, role: UserRole): Promise<User> {
    return context.source
      .getRepository(User)
      .save({ username, role, passwordHash: hash });
  }
  async function access(actor: User): Promise<string> {
    const session = await context.source
      .getRepository(Session)
      .save({ userId: actor.id, expiresAt: new Date(Date.now() + 900_000) });
    return app
      .get(JwtService)
      .signAsync({ sub: actor.id, sid: session.id, typ: 'access' });
  }
  const remove = (id: string = product.id, token = adminToken) =>
    request(server)
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const move = (type: 'IN' | 'OUT' = 'IN', quantity = 5) =>
    request(server)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: product.id, type, quantity, reason: 'Prueba' });
  const exists = () =>
    context.source.getRepository(Product).existsBy({ id: product.id });
  const movements = () => context.source.getRepository(StockMovement).count();

  it('CA-01/CA-04: sin token 401 y operador 403; el producto sigue existiendo', async () => {
    await request(server).delete(`/api/v1/products/${product.id}`).expect(401);
    await remove(product.id, 'a'.repeat(64)).expect(401);
    await remove(product.id, operatorToken).expect(403);
    // La autorización se resuelve antes de validar el UUID.
    await remove('no-es-uuid', operatorToken).expect(403);
    expect(await exists()).toBe(true);
  });

  it('CA-02: admin elimina un producto sin movimientos; después 404 en GET y en DELETE', async () => {
    const response = await remove().expect(204);
    expect(response.text).toBe('');
    expect(await exists()).toBe(false);
    await request(server)
      .get(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    const again = await remove().expect(404);
    expect((again.body as ErrorBody).message).toBe('Producto no encontrado.');
  });

  it('CA-02: el SKU de un producto eliminado se puede volver a usar', async () => {
    await remove().expect(204);
    await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'DEL-001', name: 'Recreado' })
      .expect(201);
  });

  it('CA-03: con movimientos responde 409 y conserva producto, saldo e historial', async () => {
    await move('IN', 5).expect(201);
    const response = await remove().expect(409);
    expect((response.body as ErrorBody).message).toBe(
      'El producto tiene movimientos; desactívalo con PATCH /products/:id/status.',
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /23503|fkey|stock_movements|DELETE FROM/i,
    );
    // Un saldo que volvió a cero también conserva su historial.
    await move('OUT', 5).expect(201);
    await remove().expect(409);
    expect(
      await context.source
        .getRepository(Product)
        .findOneByOrFail({ id: product.id }),
    ).toMatchObject({ stock: 0, sku: 'DEL-001', active: true });
    expect(await movements()).toBe(2);
  });

  it('CA-03: un producto inactivo con historial tampoco se elimina; sin historial sí', async () => {
    const setStatus = (active: boolean) =>
      request(server)
        .patch(`/api/v1/products/${product.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active })
        .expect(200);
    await move().expect(201);
    await setStatus(false);
    await remove().expect(409);
    const empty = await context.source
      .getRepository(Product)
      .save({ sku: 'DEL-002', name: 'Inactivo sin historial', active: false });
    await remove(empty.id).expect(204);
  });

  it.each(['no-es-uuid', 'c232ab00-9414-11ec-b3c8-9e6bdeced846'])(
    'CA-04: UUID inválido %s → 400',
    async (id) => {
      await remove(id).expect(400);
      expect(await exists()).toBe(true);
    },
  );

  it('CA-04: producto inexistente → 404', async () => {
    const response = await remove(randomUUID()).expect(404);
    expect((response.body as ErrorBody).message).toBe(
      'Producto no encontrado.',
    );
  });

  it('la FK RESTRICT es la red de seguridad: su violación se traduce a 409 sin detalles', async () => {
    await move().expect(201);
    // Simula que la comprobación previa no vio el movimiento.
    jest.spyOn(Repository.prototype, 'existsBy').mockResolvedValueOnce(false);
    const response = await remove().expect(409);
    expect(JSON.stringify(response.body)).not.toMatch(
      /23503|fkey|stock_movements|DELETE FROM/i,
    );
    expect(await exists()).toBe(true);
    expect(await movements()).toBe(1);
  });

  it('un error de base de datos distinto no se enmascara como 409', async () => {
    await context.source.query(
      `CREATE FUNCTION ${schema()}.reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced_private_error'; END; $$`,
    );
    await context.source.query(
      `CREATE TRIGGER reject_delete BEFORE DELETE ON ${schema()}.products FOR EACH ROW EXECUTE FUNCTION ${schema()}.reject_delete()`,
    );
    const response = await remove().expect(500);
    expect(JSON.stringify(response.body)).not.toMatch(/forced_private/);
    expect(await exists()).toBe(true);
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
    throw new Error('No se observó la espera del bloqueo del producto');
  }

  it('CA-05: si el movimiento se confirma primero, el borrado en espera recibe 409', async () => {
    const holder = await holdProduct();
    const pending = remove().then((r) => r.status);
    try {
      await observeWait();
      await holder.query(
        `UPDATE ${schema()}.products SET stock=3 WHERE id=$1`,
        [product.id],
      );
      await holder.query(
        `INSERT INTO ${schema()}.stock_movements (product_id,user_id,type,quantity,reason) VALUES ($1,$2,'IN',3,'Concurrente')`,
        [product.id, admin.id],
      );
      await holder.commitTransaction();
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
    expect(await pending).toBe(409);
    expect(await exists()).toBe(true);
    expect(await movements()).toBe(1);
  });

  it('CA-05: si el borrado se confirma primero, el movimiento en espera recibe 404', async () => {
    const holder = await holdProduct();
    const pending = move().then((r) => r.status);
    try {
      await observeWait();
      await holder.query(`DELETE FROM ${schema()}.products WHERE id=$1`, [
        product.id,
      ]);
      await holder.commitTransaction();
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
    expect(await pending).toBe(404);
    expect(await exists()).toBe(false);
    expect(await movements()).toBe(0);
  });

  it('CA-05: borrado y entrada simultáneos: uno gana, sin 500 ni movimiento huérfano', async () => {
    for (let round = 0; round < 5; round++) {
      product = await context.source
        .getRepository(Product)
        .save({ sku: `RACE-${round}`, name: 'Carrera' });
      const [deleted, moved] = await Promise.all([
        remove().then((r) => r.status),
        move().then((r) => r.status),
      ]);
      expect([
        [204, 404],
        [409, 201],
      ]).toContainEqual([deleted, moved]);
      const count = await context.source
        .getRepository(StockMovement)
        .countBy({ productId: product.id });
      expect(await exists()).toBe(moved === 201);
      expect(count).toBe(moved === 201 ? 1 : 0);
    }
  });
});
