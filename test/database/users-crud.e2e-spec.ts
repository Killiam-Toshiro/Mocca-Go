import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { verifyPassword } from '../../src/auth/crypto';
import { Session } from '../../src/auth/entities/session.entity';
import { Product } from '../../src/products/entities/products.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { User, UserRole } from '../../src/users/entities/user.entity';
import { hashPassword } from '../../src/seed/password';
import { quoteIdentifier } from '../../src/database/database.config';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

interface SafeUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

describe('GET, PATCH y DELETE /users/:id: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let admin: User;
  let operator: User;
  let adminToken: string;
  let operatorToken: string;
  let hash: string;
  const password = 'Integration-only-password';
  const newPassword = 'Changed-by-admin-password';
  const schema = () => quoteIdentifier(context.ownedSchema);
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    hash = await hashPassword(password);
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    admin = await fixture('admin', 'admin');
    operator = await fixture('operador', 'operador');
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

  const users = () => context.source.getRepository(User);
  async function fixture(username: string, role: UserRole): Promise<User> {
    const user = await users().save({ username, role, passwordHash: hash });
    return users().findOneByOrFail({ id: user.id });
  }
  async function access(user: User): Promise<string> {
    const session = await context.source
      .getRepository(Session)
      .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
    return app
      .get(JwtService)
      .signAsync({ sub: user.id, sid: session.id, typ: 'access' });
  }
  const find = (id: string, token = adminToken) =>
    request(server)
      .get(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const update = (id: string, body: object, token = adminToken) =>
    request(server)
      .patch(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const remove = (id: string, token = adminToken) =>
    request(server)
      .delete(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const me = (token: string) =>
    request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  const login = (username: string, secret: string) =>
    request(server)
      .post('/api/v1/auth/login')
      .send({ username, password: secret });
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  function secrets(id: string) {
    return users()
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.loginFailures',
        'user.blockedUntil',
      ])
      .where('user.id = :id', { id })
      .getOneOrFail();
  }
  function assertSafe(user: SafeUser) {
    expect(Object.keys(user).sort()).toEqual([
      'createdAt',
      'id',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
    expect(new Date(user.updatedAt).toISOString()).toBe(user.updatedAt);
  }
  async function movementBy(user: User): Promise<Product> {
    const product = await context.source.getRepository(Product).save({
      sku: `USR-${randomUUID().slice(0, 8).toUpperCase()}`,
      name: 'P',
    });
    await context.source.getRepository(StockMovement).save({
      productId: product.id,
      userId: user.id,
      type: 'IN',
      quantity: 1,
      reason: 'Historial',
    });
    return product;
  }

  describe('permisos y validación comunes', () => {
    it('CA-07: sin JWT 401 y operador 403 en las tres rutas, con no-store', async () => {
      const id = operator.id;
      const anonymous = [
        request(server).get(`/api/v1/users/${id}`),
        request(server).patch(`/api/v1/users/${id}`).send({ username: 'x_y' }),
        request(server).delete(`/api/v1/users/${id}`),
      ];
      for (const call of anonymous)
        await call.expect(401).expect('Cache-Control', 'no-store');
      await find(id, operatorToken)
        .expect(403)
        .expect('Cache-Control', 'no-store');
      await update(id, { username: 'renamed' }, operatorToken).expect(403);
      await update(id, { password: newPassword }, operatorToken).expect(403);
      await remove(admin.id, operatorToken).expect(403);
      // La autorización se resuelve antes de validar UUID y cuerpo.
      await find('no-es-uuid', operatorToken).expect(403);
      await update(id, {}, operatorToken).expect(403);
      expect(await users().count()).toBe(2);
      expect((await users().findOneByOrFail({ id })).username).toBe('operador');
    });

    it.each(['no-es-uuid', 'c232ab00-9414-11ec-b3c8-9e6bdeced846'])(
      'UUID inválido %s → 400 en las tres rutas',
      async (id) => {
        await find(id).expect(400).expect('Cache-Control', 'no-store');
        await update(id, { username: 'renamed' }).expect(400);
        await remove(id).expect(400);
      },
    );

    it('CA-06: usuario inexistente → 404 "Usuario no encontrado." en las tres rutas', async () => {
      const id = randomUUID();
      for (const call of [
        find(id),
        update(id, { username: 'renamed' }),
        update(id, { password: newPassword }),
        remove(id),
      ]) {
        const response = await call
          .expect(404)
          .expect('Cache-Control', 'no-store');
        expect(message(response)).toBe('Usuario no encontrado.');
      }
    });
  });

  describe('GET /users/:id', () => {
    it('CA-06: admin consulta un usuario y recibe solo la proyección segura', async () => {
      const response = await find(operator.id)
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const body = response.body as SafeUser;
      assertSafe(body);
      expect(body).toMatchObject({
        id: operator.id,
        username: 'operador',
        role: 'operador',
        updatedAt: operator.updatedAt.toISOString(),
      });
      expect(JSON.stringify(body)).not.toMatch(/password|hash|scrypt|blocked/i);
      assertSafe((await find(admin.id).expect(200)).body as SafeUser);
    });
  });

  describe('PATCH /users/:id', () => {
    it('CA-08: cambia el username; el JWT del usuario sigue siendo válido y entra con el nombre nuevo', async () => {
      const response = await update(operator.id, { username: 'renombrado' })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const body = response.body as SafeUser;
      assertSafe(body);
      expect(body).toMatchObject({
        id: operator.id,
        username: 'renombrado',
        role: 'operador',
      });
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        operator.updatedAt.getTime(),
      );
      await me(operatorToken)
        .expect(200)
        .expect({ id: operator.id, username: 'renombrado', role: 'operador' });
      await login('renombrado', password).expect(200);
      await login('operador', password).expect(401);
      // El nombre liberado queda disponible.
      await update(admin.id, { username: 'operador' }).expect(200);
    });

    it('CA-08: username ocupado → 409 sin detalles SQL y sin cambios', async () => {
      const response = await update(operator.id, { username: 'admin' }).expect(
        409,
      );
      expect(message(response)).toBe('El username ya existe.');
      expect(JSON.stringify(response.body)).not.toMatch(
        /23505|users_username_key|UPDATE/,
      );
      const stored = await users().findOneByOrFail({ id: operator.id });
      expect(stored.username).toBe('operador');
      expect(stored.updatedAt).toEqual(operator.updatedAt);
    });

    it('CA-08: dos renombres simultáneos al mismo username dejan un solo ganador', async () => {
      const other = await fixture('otro', 'operador');
      const results = await Promise.all([
        update(operator.id, { username: 'disputado' }),
        update(other.id, { username: 'disputado' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await users().countBy({ username: 'disputado' })).toBe(1);
    });

    it('mismo username sin password es idempotente: 200 y updatedAt no cambia', async () => {
      const response = await update(operator.id, {
        username: 'operador',
      }).expect(200);
      expect((response.body as SafeUser).updatedAt).toBe(
        operator.updatedAt.toISOString(),
      );
      expect(
        (await users().findOneByOrFail({ id: operator.id })).updatedAt,
      ).toEqual(operator.updatedAt);
    });

    it.each([
      {},
      { role: 'admin' },
      { username: 'renamed', role: 'admin' },
      { passwordHash: 'injected' },
      { id: randomUUID() },
      { username: null },
      { password: null },
      { username: 'renamed', password: null },
      { username: 'BAD' },
      { username: 'ab' },
      { username: 'a'.repeat(65) },
      { username: ' espacio ' },
      { username: 42 },
      { password: 'x'.repeat(11) },
      { password: 'x'.repeat(129) },
      { password: 123456789012 },
    ])('CA-09: body inválido %j → 400 sin cambios', async (body) => {
      const before = await secrets(operator.id);
      await update(operator.id, body)
        .expect(400)
        .expect('Cache-Control', 'no-store');
      const after = await secrets(operator.id);
      expect(after.username).toBe('operador');
      expect(after.role).toBe('operador');
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('CA-09: el body vacío explica qué falta', async () => {
      expect(message(await update(operator.id, {}).expect(400))).toBe(
        'Indica al menos un campo para editar.',
      );
    });

    it('CA-10: cambiar la contraseña de otro usuario invalida la anterior y sus sesiones', async () => {
      const second = await access(operator);
      const response = await update(operator.id, {
        password: newPassword,
      }).expect(200);
      assertSafe(response.body as SafeUser);
      expect(JSON.stringify(response.body)).not.toMatch(
        /password|hash|Changed/i,
      );
      const stored = await secrets(operator.id);
      expect(stored.passwordHash).not.toBe(hash);
      expect(stored.passwordHash).not.toContain(newPassword);
      expect(await verifyPassword(newPassword, stored.passwordHash)).toBe(true);
      await me(operatorToken).expect(401);
      await me(second).expect(401);
      await login('operador', password).expect(401);
      const fresh = await login('operador', newPassword).expect(200);
      await me((fresh.body as { accessToken: string }).accessToken).expect(200);
      // El admin que hizo el cambio conserva su sesión.
      await me(adminToken).expect(200);
    });

    it('CA-10: repetir la misma contraseña vuelve a hashear y revoca de nuevo', async () => {
      await update(operator.id, { password: newPassword }).expect(200);
      const first = await secrets(operator.id);
      const session = (await login('operador', newPassword).expect(200))
        .body as { accessToken: string };
      await update(operator.id, { password: newPassword }).expect(200);
      const second = await secrets(operator.id);
      expect(second.passwordHash).not.toBe(first.passwordHash);
      await me(session.accessToken).expect(401);
    });

    it('CA-10: la contraseña nueva reinicia el contador y el bloqueo de intentos', async () => {
      await users().update(
        { id: operator.id },
        { loginFailures: 5, blockedUntil: new Date(Date.now() + 900_000) },
      );
      await login('operador', password).expect(401);
      await update(operator.id, { password: newPassword }).expect(200);
      const stored = await secrets(operator.id);
      expect(stored.loginFailures).toBe(0);
      expect(stored.blockedUntil).toBeNull();
      await login('operador', newPassword).expect(200);
    });

    it('CA-11: un admin que cambia su propia contraseña conserva solo la sesión actual', async () => {
      const other = await access(admin);
      await update(admin.id, { password: newPassword }).expect(200);
      await me(adminToken).expect(200);
      await find(operator.id).expect(200);
      await me(other).expect(401);
      await login('admin', password).expect(401);
      await login('admin', newPassword).expect(200);
    });

    it('username y contraseña juntos se aplican en la misma petición; no cambia el rol', async () => {
      const response = await update(operator.id, {
        username: 'ambos',
        password: newPassword,
      }).expect(200);
      expect(response.body).toMatchObject({
        username: 'ambos',
        role: 'operador',
      });
      await login('ambos', newPassword).expect(200);
    });

    it('si el username está ocupado no se cambia la contraseña ni se revocan sesiones', async () => {
      await update(operator.id, {
        username: 'admin',
        password: newPassword,
      }).expect(409);
      expect((await secrets(operator.id)).passwordHash).toBe(hash);
      await me(operatorToken).expect(200);
    });

    it('un fallo inesperado de la base de datos no se convierte en 409 ni revela SQL', async () => {
      await context.source.query(
        `CREATE FUNCTION ${schema()}.reject_user() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'forced_private_error'; END; $fn$`,
      );
      await context.source.query(
        `CREATE TRIGGER reject_user BEFORE UPDATE ON ${schema()}.users FOR EACH ROW EXECUTE FUNCTION ${schema()}.reject_user()`,
      );
      const response = await update(operator.id, {
        username: 'renamed',
      }).expect(500);
      expect(JSON.stringify(response.body)).not.toMatch(
        /forced_private|UPDATE/,
      );
    });
  });

  describe('DELETE /users/:id', () => {
    it('CA-12: elimina un usuario sin movimientos; su JWT deja de servir y sus sesiones desaparecen', async () => {
      const response = await remove(operator.id)
        .expect(204)
        .expect('Cache-Control', 'no-store');
      expect(response.text).toBe('');
      await me(operatorToken).expect(401);
      await find(operator.id).expect(404);
      await remove(operator.id).expect(404);
      await login('operador', password).expect(401);
      expect(
        await context.source
          .getRepository(Session)
          .countBy({ userId: operator.id }),
      ).toBe(0);
      expect(await users().count()).toBe(1);
      // El username queda libre para un usuario nuevo.
      await request(server)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'operador', password, role: 'operador' })
        .expect(201);
    });

    it('CA-12: un admin elimina a otro admin si no es el último', async () => {
      const other = await fixture('otro_admin', 'admin');
      const otherToken = await access(other);
      await remove(other.id).expect(204);
      await me(otherToken).expect(401);
      expect(await users().countBy({ role: 'admin' })).toBe(1);
    });

    it('CA-13: el único admin no puede eliminarse: gana la regla de último admin', async () => {
      const response = await remove(admin.id).expect(409);
      expect(message(response)).toBe(
        'No se puede eliminar al último administrador.',
      );
      await me(adminToken).expect(200);
      expect(await users().countBy({ role: 'admin' })).toBe(1);
    });

    it('CA-13: con otro admin registrado, eliminarse a sí mismo responde con la regla de auto-eliminación', async () => {
      await fixture('otro_admin', 'admin');
      const response = await remove(admin.id).expect(409);
      expect(message(response)).toBe('No puedes eliminar tu propio usuario.');
      await me(adminToken).expect(200);
      expect(await users().countBy({ role: 'admin' })).toBe(2);
    });

    it('CA-13: un usuario con movimientos no se elimina y conserva historial y sesiones', async () => {
      await movementBy(operator);
      const response = await remove(operator.id).expect(409);
      expect(message(response)).toBe(
        'El usuario tiene movimientos; no se puede eliminar.',
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /23503|fkey|DELETE FROM/,
      );
      await me(operatorToken).expect(200);
      expect(await context.source.getRepository(StockMovement).count()).toBe(1);
    });

    it('la FK RESTRICT es la red de seguridad: su violación se traduce al mismo 409', async () => {
      await movementBy(operator);
      // Simula que la comprobación previa no vio el movimiento.
      jest.spyOn(Repository.prototype, 'existsBy').mockResolvedValueOnce(false);
      const response = await remove(operator.id).expect(409);
      expect(message(response)).toBe(
        'El usuario tiene movimientos; no se puede eliminar.',
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /23503|fkey|DELETE FROM/,
      );
      await me(operatorToken).expect(200);
    });

    it('un error de base de datos distinto no se enmascara como 409', async () => {
      await context.source.query(
        `CREATE FUNCTION ${schema()}.reject_delete() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'forced_private_error'; END; $fn$`,
      );
      await context.source.query(
        `CREATE TRIGGER reject_delete BEFORE DELETE ON ${schema()}.users FOR EACH ROW EXECUTE FUNCTION ${schema()}.reject_delete()`,
      );
      const response = await remove(operator.id).expect(500);
      expect(JSON.stringify(response.body)).not.toMatch(/forced_private/);
      expect(await users().count()).toBe(2);
    });
  });

  describe('concurrencia', () => {
    async function waitForAdministrativeWait(expected = 1): Promise<void> {
      for (let index = 0; index < 200; index++) {
        const rows = await context.source.query<{ waiting: number }[]>(
          'SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = $1 AND classid = $2::oid AND objid = $3::oid AND NOT granted',
          ['advisory', 721005, 1],
        );
        if (rows[0].waiting >= expected) return;
        await pause(20);
      }
      throw new Error('La petición no llegó al bloqueo administrativo.');
    }
    async function holdAdministration(): Promise<QueryRunner> {
      const runner = context.source.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      await runner.query('SELECT pg_advisory_xact_lock($1,$2)', [721005, 1]);
      return runner;
    }
    async function release(runner: QueryRunner) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }

    it('CA-14: dos admins que se eliminan mutuamente esperando el bloqueo: uno 204 y el otro 401', async () => {
      const other = await fixture('otro_admin', 'admin');
      const otherToken = await access(other);
      const blocker = await holdAdministration();
      const pending = Promise.all([
        remove(other.id).then((r) => r.status),
        remove(admin.id, otherToken).then((r) => r.status),
      ]);
      try {
        await waitForAdministrativeWait(2);
        await blocker.commitTransaction();
        expect((await pending).sort()).toEqual([204, 401]);
      } finally {
        await release(blocker);
        await pending;
      }
      expect(await users().countBy({ role: 'admin' })).toBe(1);
    });

    it('CA-14: repetido sin coordinación nunca deja la instalación sin admin ni devuelve 500', async () => {
      for (let round = 0; round < 4; round++) {
        const first = await fixture(`a_${round}`, 'admin');
        const second = await fixture(`b_${round}`, 'admin');
        const tokens = [await access(first), await access(second)];
        const statuses = await Promise.all([
          remove(second.id, tokens[0]).then((r) => r.status),
          remove(first.id, tokens[1]).then((r) => r.status),
        ]);
        expect(statuses.sort()).toEqual([204, 401]);
        expect(
          await users().countBy([{ id: first.id }, { id: second.id }]),
        ).toBe(1);
      }
      expect(await users().countBy({ role: 'admin' })).toBeGreaterThanOrEqual(
        1,
      );
    });

    it('edición y eliminación revalidan al actor al salir de la espera', async () => {
      await fixture('otro_admin', 'admin');
      const blocker = await holdAdministration();
      const pending = Promise.all([
        find(operator.id).then((r) => r.status),
        update(operator.id, { username: 'renamed' }).then((r) => r.status),
        remove(operator.id).then((r) => r.status),
      ]);
      try {
        await waitForAdministrativeWait(3);
        await blocker.manager.update(User, admin.id, { role: 'operador' });
        await blocker.commitTransaction();
        expect(await pending).toEqual([403, 403, 403]);
      } finally {
        await release(blocker);
        await pending;
      }
      expect(
        (await users().findOneByOrFail({ id: operator.id })).username,
      ).toBe('operador');
    });

    const move = (productId: string, token: string) =>
      request(server)
        .post('/api/v1/movements')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId, type: 'IN', quantity: 4, reason: 'Carrera' });
    const newProduct = (sku: string) =>
      context.source.getRepository(Product).save({ sku, name: 'Carrera' });

    it('CA-18: si el borrado se confirma mientras el movimiento inserta, el movimiento recibe 401 y no escribe', async () => {
      const product = await newProduct('RACE-FK');
      const holder = context.source.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      // Borrado sin confirmar: la sesión sigue visible para el movimiento.
      await holder.query(`DELETE FROM ${schema()}.users WHERE id=$1`, [
        operator.id,
      ]);
      const pending = move(product.id, operatorToken).then((r) => r);
      try {
        for (let attempt = 0; ; attempt++) {
          const rows = await context.source.query<{ total: string }[]>(
            `SELECT count(*) AS total FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%INSERT INTO%stock_movements%' AND query LIKE $1`,
            ['%' + context.ownedSchema + '%'],
          );
          if (Number(rows[0].total) > 0) break;
          if (attempt === 200)
            throw new Error('No se observó la espera de la FK del movimiento');
          await pause(20);
        }
        await holder.commitTransaction();
      } finally {
        await release(holder);
      }
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(message(response)).toBe('Credenciales inválidas.');
      expect(JSON.stringify(response.body)).not.toMatch(/23503|fkey|INSERT/);
      expect(await context.source.getRepository(StockMovement).count()).toBe(0);
      expect(
        (
          await context.source
            .getRepository(Product)
            .findOneByOrFail({ id: product.id })
        ).stock,
      ).toBe(0);
    });

    it('CA-18: borrado y movimiento simultáneos del mismo usuario: 409/201 o 204/401, nunca 500', async () => {
      for (let round = 0; round < 5; round++) {
        const target = await fixture(`race_${round}`, 'operador');
        const token = await access(target);
        const product = await newProduct(`RACE-${round}`);
        const [deleted, moved] = await Promise.all([
          remove(target.id).then((r) => r.status),
          move(product.id, token).then((r) => r.status),
        ]);
        expect([
          [204, 401],
          [409, 201],
        ]).toContainEqual([deleted, moved]);
        expect(await users().existsBy({ id: target.id })).toBe(moved === 201);
        expect(
          await context.source
            .getRepository(StockMovement)
            .countBy({ productId: product.id }),
        ).toBe(moved === 201 ? 1 : 0);
      }
    });
  });
});
