import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryRunner } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { verifyPassword } from '../../src/auth/crypto';
import { Session } from '../../src/auth/entities/session.entity';
import { User, UserRole } from '../../src/users/entities/user.entity';
import { UsersService } from '../../src/users/users.service';
import { hashPassword } from '../../src/seed/password';
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
interface UserPage {
  data: SafeUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

describe('Administración y roles: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let admin: User;
  let operator: User;
  let adminToken: string;
  let operatorToken: string;
  let hash: string;
  const password = 'Integration-only-password';

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
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  async function fixture(username: string, role: UserRole): Promise<User> {
    const user = await context.source
      .getRepository(User)
      .save({ username, role, passwordHash: hash });
    return context.source.getRepository(User).findOneByOrFail({ id: user.id });
  }
  async function access(user: User): Promise<string> {
    const session = await context.source
      .getRepository(Session)
      .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
    return app
      .get(JwtService)
      .signAsync({ sub: user.id, sid: session.id, typ: 'access' });
  }
  function create(body: object, token = adminToken) {
    return request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }
  function list(query = '', token = adminToken) {
    return request(server)
      .get(`/api/v1/users${query}`)
      .set('Authorization', `Bearer ${token}`);
  }
  function change(id: string, role: unknown, token = adminToken) {
    return request(server)
      .patch(`/api/v1/users/${id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role });
  }
  function assertSafe(user: SafeUser) {
    expect(Object.keys(user).sort()).toEqual([
      'createdAt',
      'id',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(user.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
    expect(new Date(user.updatedAt).toISOString()).toBe(user.updatedAt);
  }

  it('las tres rutas rechazan acceso sin JWT o con un token inválido y operador recibe 403', async () => {
    const payload = { username: 'new_user', password, role: 'operador' };
    const calls = [
      request(server).get('/api/v1/users'),
      request(server).post('/api/v1/users').send(payload),
      request(server)
        .patch(`/api/v1/users/${operator.id}/role`)
        .send({ role: 'admin' }),
    ];
    for (const call of calls)
      await call.expect(401).expect('Cache-Control', 'no-store');
    await list('', operatorToken).expect(403);
    await create(payload, operatorToken).expect(403);
    await change(operator.id, 'admin', operatorToken).expect(403);
    await list('', 'a'.repeat(64)).expect(401);
    expect(await context.source.getRepository(User).count()).toBe(2);
  });

  it.each(['admin', 'operador'] as const)(
    'admin crea rol %s: responde solo el usuario seguro, sin credenciales ni secretos',
    async (role) => {
      const response = await create({ username: 'new_user', password, role })
        .expect(201)
        .expect('Cache-Control', 'no-store');
      const body = response.body as SafeUser;
      assertSafe(body);
      expect(body.role).toBe(role);
      expect(JSON.stringify(body)).not.toMatch(
        /enroll|token|expiresIn|totp|2fa|password|hash/i,
      );
      const user = await context.source
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: body.id })
        .getOneOrFail();
      expect(await verifyPassword(password, user.passwordHash)).toBe(true);
      expect(user.passwordHash).not.toBe(password);
      expect(JSON.stringify(body)).not.toContain(user.passwordHash);
    },
  );

  it('el usuario creado inicia sesión directamente con su contraseña y recibe los permisos de su rol', async () => {
    const created = (
      await create({
        username: 'new_user',
        password,
        role: 'operador',
      }).expect(201)
    ).body as SafeUser;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'new_user', password })
      .expect(200);
    const { accessToken } = login.body as { accessToken: string };
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ id: created.id, username: 'new_user', role: 'operador' });
    await list('', accessToken).expect(403);
    await change(created.id, 'admin', accessToken).expect(403);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'new_user', password: 'Another-long-password' })
      .expect(401);
  });

  it('lista con defaults, orden estable, límites, páginas vacías y sin secretos', async () => {
    await fixture('zulu_user', 'admin');
    await fixture('alpha_user', 'operador');
    const first = await list().expect(200).expect('Cache-Control', 'no-store');
    const body = first.body as UserPage;
    expect(body).toMatchObject({ page: 1, limit: 20, total: 4, totalPages: 1 });
    expect(body.data.map((u) => u.username)).toEqual([
      'admin',
      'alpha_user',
      'operador',
      'zulu_user',
    ]);
    body.data.forEach(assertSafe);
    const page = await list('?page=2&limit=2').expect(200);
    expect((page.body as UserPage).data.map((u) => u.username)).toEqual([
      'operador',
      'zulu_user',
    ]);
    expect(page.body).toMatchObject({
      page: 2,
      limit: 2,
      total: 4,
      totalPages: 2,
    });
    await list('?page=10000&limit=100')
      .expect(200)
      .expect({ data: [], page: 10000, limit: 100, total: 4, totalPages: 1 });
  });

  it.each([
    '?page=0',
    '?page=01',
    '?page=-1',
    '?page=10001',
    '?page=1.5',
    '?page=1e2',
    '?page=1&page=2',
    '?limit=0',
    '?limit=101',
    '?limit=01',
    '?limit=',
    '?limit=%201',
    '?role=admin',
  ])('rechaza query %s', async (query) => {
    await list(query).expect(400).expect('Cache-Control', 'no-store');
  });

  it.each([
    { username: 'BAD' },
    { username: 'ab' },
    { username: 'a'.repeat(65) },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { role: 'superadmin' },
    { role: null },
    { role: undefined },
    { code: '123456' },
    { enrollmentToken: 'a'.repeat(64) },
    { passwordHash: 'injected' },
  ])('rechaza body de creación inválido %j', async (changes) => {
    await create({
      username: 'new_user',
      password,
      role: 'operador',
      ...changes,
    })
      .expect(400)
      .expect('Cache-Control', 'no-store');
    expect(await context.source.getRepository(User).count()).toBe(2);
  });

  it('conserva el usuario original ante duplicados y devuelve 409 sin detalles SQL', async () => {
    const first = await create({
      username: 'new_user',
      password,
      role: 'operador',
    }).expect(201);
    const duplicate = await create({
      username: 'new_user',
      password: 'Other-long-password',
      role: 'admin',
    }).expect(409);
    expect(JSON.stringify(duplicate.body)).not.toMatch(
      /INSERT|password_hash|scrypt|Other-long|23505/,
    );
    expect(
      (
        await context.source
          .getRepository(User)
          .findOneByOrFail({ id: (first.body as SafeUser).id })
      ).role,
    ).toBe('operador');
  });

  it('dos creaciones simultáneas del mismo username generan un solo usuario', async () => {
    const body = { username: 'new_user', password, role: 'operador' };
    const results = await Promise.all([create(body), create(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await context.source
        .getRepository(User)
        .countBy({ username: 'new_user' }),
    ).toBe(1);
  });

  it('un fallo inesperado de la base de datos al crear devuelve 500 sin revelar SQL ni hash y no deja usuario', async () => {
    await context.source.query(
      `CREATE FUNCTION "${context.ownedSchema}".reject_user() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'fixture user failure'; END; $fn$`,
    );
    await context.source.query(
      `CREATE TRIGGER reject_user BEFORE INSERT ON "${context.ownedSchema}".users FOR EACH ROW EXECUTE FUNCTION "${context.ownedSchema}".reject_user()`,
    );
    const response = await create({
      username: 'rollback_user',
      password,
      role: 'operador',
    }).expect(500);
    expect(JSON.stringify(response.body)).not.toMatch(
      /fixture|INSERT|password_hash|scrypt|Integration-only/,
    );
    expect(
      await context.source
        .getRepository(User)
        .countBy({ username: 'rollback_user' }),
    ).toBe(0);
  });

  it('promoción y degradación cambian permisos con el mismo JWT, sin cambiar la contraseña', async () => {
    const stored = await context.source
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: operator.id })
      .getOneOrFail();
    const promoted = await change(operator.id, 'admin').expect(200);
    assertSafe(promoted.body as SafeUser);
    await list('', operatorToken).expect(200);
    const adminUser = await create(
      { username: 'created_by_promoted', password, role: 'operador' },
      operatorToken,
    ).expect(201);
    expect((adminUser.body as SafeUser).username).toBe('created_by_promoted');
    await change(operator.id, 'operador').expect(200);
    await list('', operatorToken).expect(403);
    await change(operator.id, 'admin', operatorToken).expect(403);
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200)
      .expect({ id: operator.id, username: 'operador', role: 'operador' });
    const after = await context.source
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: operator.id })
      .getOneOrFail();
    expect(after.passwordHash).toBe(stored.passwordHash);
  });

  it('UUID/body inválidos, campos extra y usuario inexistente tienen respuestas exactas', async () => {
    await change('not-uuid', 'admin').expect(400);
    for (const role of ['ADMIN', 'superadmin', null, 42])
      await change(operator.id, role).expect(400);
    await request(server)
      .patch(`/api/v1/users/${operator.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin', username: 'renamed' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/users/${operator.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
    await change(randomUUID(), 'admin').expect(404);
    expect(
      (
        await context.source
          .getRepository(User)
          .findOneByOrFail({ id: operator.id })
      ).role,
    ).toBe('operador');
  });

  it('rol idéntico es idempotente incluso para el último admin y mantiene timestamps', async () => {
    const same = await change(admin.id, 'admin').expect(200);
    expect((same.body as SafeUser).updatedAt).toBe(
      admin.updatedAt.toISOString(),
    );
    const operatorSame = await change(operator.id, 'operador').expect(200);
    expect((operatorSame.body as SafeUser).updatedAt).toBe(
      operator.updatedAt.toISOString(),
    );
  });

  it('protege al último admin: solo se puede degradar si queda otro', async () => {
    const blocked = await change(admin.id, 'operador').expect(409);
    expect((blocked.body as { message: string }).message).toContain(
      'último administrador',
    );
    const other = await create({
      username: 'second_admin',
      password,
      role: 'admin',
    }).expect(201);
    const id = (other.body as SafeUser).id;
    await change(admin.id, 'operador').expect(200);
    // Ahora el segundo es el último admin: ya no se puede degradar.
    const secondToken = await access(
      await context.source.getRepository(User).findOneByOrFail({ id }),
    );
    await change(id, 'operador', secondToken).expect(409);
    expect(
      (await context.source.getRepository(User).findOneByOrFail({ id })).role,
    ).toBe('admin');
    expect(
      await context.source.getRepository(User).countBy({ role: 'admin' }),
    ).toBe(1);
  });

  it('permite degradación propia si existe otro admin y el JWT pierde administración', async () => {
    await fixture('other_admin', 'admin');
    await change(admin.id, 'operador').expect(200);
    await list().expect(403);
    await create({ username: 'blocked_user', password, role: 'admin' }).expect(
      403,
    );
  });

  it('dos admins que se degradan simultáneamente nunca eliminan al último admin', async () => {
    const other = await fixture('other_admin', 'admin');
    const otherToken = await access(other);
    const results = await Promise.all([
      change(admin.id, 'operador'),
      change(other.id, 'operador', otherToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await context.source.getRepository(User).countBy({ role: 'admin' }),
    ).toBe(1);
  });

  async function waitForAdministrativeWait(expected = 1): Promise<void> {
    for (let index = 0; index < 200; index++) {
      const rows = await context.source.query<{ waiting: number }[]>(
        'SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = $1 AND classid = $2::oid AND objid = $3::oid AND NOT granted',
        ['advisory', 721005, 1],
      );
      if (rows[0].waiting >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
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

  it.each(['demoted', 'revoked', 'expired'])(
    'revalida creación si el actor está %s después del guard mientras espera',
    async (state) => {
      await fixture('other_admin', 'admin');
      const blocker = await holdAdministration();
      const pending = create({
        username: 'blocked_user',
        password,
        role: 'admin',
      }).then((response) => response);
      try {
        await waitForAdministrativeWait();
        if (state === 'demoted')
          await blocker.manager.update(User, admin.id, { role: 'operador' });
        else
          await blocker.manager.update(
            Session,
            { userId: admin.id },
            state === 'revoked'
              ? { revokedAt: new Date() }
              : { expiresAt: new Date(Date.now() - 1) },
          );
        await blocker.commitTransaction();
        const response = await pending;
        expect(response.status).toBe(state === 'demoted' ? 403 : 401);
        expect(
          await context.source
            .getRepository(User)
            .countBy({ username: 'blocked_user' }),
        ).toBe(0);
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
        await pending;
      }
    },
  );

  it('el listado y el cambio de rol también revalidan al actor al salir de la espera', async () => {
    const other = await fixture('other_admin', 'admin');
    const blocker = await holdAdministration();
    const pendingList = list().then((response) => response);
    const pendingRole = change(operator.id, 'admin').then(
      (response) => response,
    );
    try {
      await waitForAdministrativeWait(2);
      await blocker.manager.update(User, admin.id, { role: 'operador' });
      await blocker.commitTransaction();
      expect((await pendingList).status).toBe(403);
      expect((await pendingRole).status).toBe(403);
      expect(
        (
          await context.source
            .getRepository(User)
            .findOneByOrFail({ id: operator.id })
        ).role,
      ).toBe('operador');
      expect(
        (
          await context.source
            .getRepository(User)
            .findOneByOrFail({ id: other.id })
        ).role,
      ).toBe('admin');
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await Promise.all([pendingList, pendingRole]);
    }
  });

  it('el servicio no confía en un rol admin inyectado en la identidad del operador', async () => {
    const session = await context.source
      .getRepository(Session)
      .findOneByOrFail({ userId: operator.id });
    await expect(
      app.get(UsersService).list(
        {
          id: operator.id,
          username: 'operador',
          role: 'admin',
          sessionId: session.id,
        },
        {},
      ),
    ).rejects.toThrow('Permisos insuficientes');
  });
});
