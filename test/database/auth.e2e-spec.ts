import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { AuthGuard } from '../../src/auth/auth.guard';
import { AuthService } from '../../src/auth/auth.service';
import { AuthModule } from '../../src/auth/auth.module';
import { Roles, RolesGuard } from '../../src/auth/roles.guard';
import { Session } from '../../src/auth/entities/session.entity';
import { quoteIdentifier } from '../../src/database/database.config';
import { User } from '../../src/users/entities/user.entity';
import { Product } from '../../src/products/entities/products.entity';
import { runSeed } from '../../src/seed/seed';
import { hashPassword } from '../../src/seed/password';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

@Controller('test-roles')
class RoleProbe {
  @Get('admin') @Roles('admin') @UseGuards(AuthGuard, RolesGuard) admin() {
    return { allowed: true };
  }
  @Get('authenticated') @UseGuards(AuthGuard, RolesGuard) any() {
    return { allowed: true };
  }
  @Get('missing-identity') @Roles('admin') @UseGuards(RolesGuard) missing() {
    return { allowed: true };
  }
}

interface LoginBody {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

describe('Autenticación solo con JWT: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let user: User;
  let passwordHash: string;
  const password = 'Integration-only-password';

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    user = await context.source
      .getRepository(User)
      .save({ username: 'admin', role: 'admin', passwordHash });
    const module = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [RoleProbe],
    })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  const table = (name: string) =>
    `${quoteIdentifier(context.ownedSchema)}."${name}"`;
  function post(path: string, body: object) {
    return request(server).post(`/api/v1/auth/${path}`).send(body);
  }
  function me(token: string) {
    return request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  }
  function wrongLogin(username = 'admin') {
    return post('login', { username, password: 'Wrong-long-password' });
  }
  async function login(username = 'admin', secret = password): Promise<string> {
    const response = await post('login', { username, password: secret }).expect(
      200,
    );
    return (response.body as LoginBody).accessToken;
  }
  const sessions = () => context.source.getRepository(Session).count();
  function security(id: string) {
    return context.source
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect(['user.loginFailures', 'user.blockedUntil'])
      .where('user.id = :id', { id })
      .getOneOrFail();
  }

  describe('login directo (J-01)', () => {
    it('login → JWT → identidad → logout, sin pasos adicionales', async () => {
      const response = await post('login', { username: 'admin', password })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const body = response.body as LoginBody;
      expect(Object.keys(body).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'tokenType',
      ]);
      expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(JSON.stringify(body)).not.toMatch(
        /challenge|2fa|totp|enroll|code/i,
      );
      const stored = await context.source
        .getRepository(Session)
        .findOneByOrFail({ userId: user.id });
      expect(stored.revokedAt).toBeNull();
      expect(
        Math.abs(stored.expiresAt.getTime() - (Date.now() + 900_000)),
      ).toBeLessThan(10_000);

      const identity = await me(body.accessToken)
        .expect(200)
        .expect('Cache-Control', 'no-store');
      expect(identity.body).toEqual({
        id: user.id,
        username: 'admin',
        role: 'admin',
      });
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(204)
        .expect('Cache-Control', 'no-store');
      await me(body.accessToken)
        .expect(401)
        .expect('Cache-Control', 'no-store');
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(401);
      const revoked = await context.source
        .getRepository(Session)
        .findOneByOrFail({ id: stored.id });
      expect(revoked.revokedAt).not.toBeNull();
    });

    it.each(['admin', 'operador'] as const)(
      'un usuario recién creado con rol %s entra solo con su contraseña',
      async (role) => {
        const username = `usuario_${role}`;
        await context.source
          .getRepository(User)
          .save({ username, role, passwordHash });
        const access = await login(username);
        expect((await me(access).expect(200)).body).toMatchObject({
          username,
          role,
        });
      },
    );

    it('los usuarios del seed inician sesión directamente con su contraseña', async () => {
      // El seed conserva usuarios existentes: se parte sin el admin de prueba.
      await context.source.getRepository(User).delete({ id: user.id });
      await runSeed(context.source, {
        adminPassword: 'Test-only-admin-password',
        operatorPassword: 'Test-only-operator-password',
      });
      const admin = await login('admin', 'Test-only-admin-password');
      const operator = await login('operador', 'Test-only-operator-password');
      expect((await me(admin).expect(200)).body).toMatchObject({
        role: 'admin',
      });
      expect((await me(operator).expect(200)).body).toMatchObject({
        role: 'operador',
      });
    });

    it('cada login crea una sesión propia; varios inicios simultáneos funcionan', async () => {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          post('login', { username: 'admin', password }),
        ),
      );
      for (const response of responses) expect(response.status).toBe(200);
      const tokens = responses.map(
        (response) => (response.body as LoginBody).accessToken,
      );
      expect(new Set(tokens).size).toBe(4);
      expect(await sessions()).toBe(4);
      for (const token of tokens) await me(token).expect(200);
    });
  });

  describe('rutas retiradas (J-03)', () => {
    it.each([
      ['2fa/setup', { enrollmentToken: 'a'.repeat(64) }],
      ['2fa/confirm', { enrollmentToken: 'a'.repeat(64), code: '123456' }],
      ['verify-2fa', { challengeToken: 'b'.repeat(64), code: '123456' }],
    ])('POST /auth/%s responde 404 y no crea sesión', async (path, body) => {
      await post(path, body).expect(404);
      expect(await sessions()).toBe(0);
    });
  });

  describe('credenciales y validación (J-02)', () => {
    it('usuario inexistente y contraseña errónea dan el mismo 401 y no crean sesión', async () => {
      const unknown = await wrongLogin('no_existe').expect(401);
      const wrong = await wrongLogin('admin').expect(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.headers['cache-control']).toBe('no-store');
      expect(wrong.headers['cache-control']).toBe('no-store');
      expect(await sessions()).toBe(0);
    });

    it.each([
      ['username en mayúsculas', { username: 'ADMIN', password }],
      ['contraseña corta', { username: 'admin', password: 'short' }],
      ['contraseña larga', { username: 'admin', password: 'x'.repeat(129) }],
      ['sin contraseña', { username: 'admin' }],
      ['sin username', { password }],
      ['tipos inválidos', { username: 7, password: 7 }],
      ['campo role', { username: 'admin', password, role: 'admin' }],
      [
        'campo code heredado del 2FA',
        { username: 'admin', password, code: '123456' },
      ],
    ])('rechaza con 400 sin crear sesión: %s', async (_caso, body) => {
      await post('login', body).expect(400).expect('Cache-Control', 'no-store');
      expect(await sessions()).toBe(0);
    });

    it('bloquea la cuenta tras cinco fallos, persiste el bloqueo y se reinicia al vencer', async () => {
      for (let i = 0; i < 5; i++) await wrongLogin().expect(401);
      await post('login', { username: 'admin', password }).expect(401);
      expect(await sessions()).toBe(0);
      const blocked = await security(user.id);
      expect(blocked.loginFailures).toBe(5);
      expect(blocked.blockedUntil!.getTime()).toBeGreaterThan(Date.now());
      await context.source
        .getRepository(User)
        .update(user.id, { blockedUntil: new Date(Date.now() - 1) });
      await login();
      const restored = await security(user.id);
      expect(restored.loginFailures).toBe(0);
      expect(restored.blockedUntil).toBeNull();
    });

    it('un login correcto reinicia el contador de fallos y el bloqueo no afecta a otras cuentas', async () => {
      await context.source
        .getRepository(User)
        .save({ username: 'otro_usuario', role: 'operador', passwordHash });
      for (let i = 0; i < 3; i++) await wrongLogin().expect(401);
      expect((await security(user.id)).loginFailures).toBe(3);
      await login();
      expect((await security(user.id)).loginFailures).toBe(0);
      for (let i = 0; i < 5; i++) await wrongLogin().expect(401);
      await post('login', { username: 'admin', password }).expect(401);
      await login('otro_usuario');
    });

    it('fallos simultáneos nunca rompen la restricción del contador ni dejan pasar a nadie', async () => {
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => wrongLogin()),
      );
      for (const response of responses) expect(response.status).toBe(401);
      const stored = await security(user.id);
      expect(stored.loginFailures).toBe(5);
      expect(stored.blockedUntil).not.toBeNull();
      expect(await sessions()).toBe(0);
    });

    it('limita intentos HTTP por IP/ruta sin consultar ninguna cuenta', async () => {
      for (let i = 0; i < 20; i++) await post('login', {}).expect(400);
      await post('login', {}).expect(429).expect('Cache-Control', 'no-store');
    });
  });

  describe('JWT y sesiones (J-04)', () => {
    it('headers inválidos o tokens aleatorios nunca permiten /me', async () => {
      for (const value of [
        undefined,
        'Basic fake',
        'Bearer',
        `Bearer ${'a'.repeat(64)}`,
        `Bearer ${randomUUID()}`,
      ]) {
        const call = request(server).get('/api/v1/auth/me');
        if (value) call.set('Authorization', value);
        await call.expect(401).expect('Cache-Control', 'no-store');
      }
      await request(server).get('/test-roles/admin').expect(404);
      expect(await sessions()).toBe(0);
    });

    it('guarda sesión entre reinicios de conexión y consulta el rol vigente para autorización', async () => {
      const access = await login();
      await context.source.destroy();
      await context.source.initialize();
      await request(server)
        .get('/api/v1/test-roles/admin')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);
      await context.source
        .getRepository(User)
        .update(user.id, { role: 'operador' });
      await me(access)
        .expect(200)
        .expect({ id: user.id, username: 'admin', role: 'operador' });
      await request(server)
        .get('/api/v1/test-roles/admin')
        .set('Authorization', `Bearer ${access}`)
        .expect(403);
      await request(server)
        .get('/api/v1/test-roles/authenticated')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);
      await request(server)
        .get('/api/v1/test-roles/missing-identity')
        .expect(403);
    });

    it('rechaza sesiones ausentes o vencidas y logout conserva las otras sesiones', async () => {
      const jwt = app.get(JwtService);
      const sessionOf = (token: string) =>
        jwt.decode<{ sid: string }>(token).sid;
      const access = await login();
      const otherAccess = await login();
      expect(sessionOf(access)).not.toBe(sessionOf(otherAccess));
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${access}`)
        .expect(204);
      await context.source.destroy();
      await context.source.initialize();
      await me(access).expect(401);
      await me(otherAccess).expect(200);
      await context.source
        .getRepository(Session)
        .update(sessionOf(otherAccess), {
          expiresAt: new Date(Date.now() - 1),
        });
      await me(otherAccess).expect(401);
      await context.source.getRepository(Session).delete(sessionOf(access));
      await me(access).expect(401);
    });

    it('valida firma, algoritmo, issuer, audience, expiración y claims antes de consultar sesión', async () => {
      const jwt = app.get(JwtService);
      const sid = randomUUID();
      const claims = { sub: user.id, sid, typ: 'access' };
      const tokens = await Promise.all([
        jwt.signAsync(claims, { secret: 'wrong-key' }),
        jwt.signAsync(claims, { algorithm: 'HS512' }),
        jwt.signAsync(claims, { issuer: 'another' }),
        jwt.signAsync(claims, { audience: 'another' }),
        jwt.signAsync(claims, { expiresIn: -1 }),
        jwt.signAsync({ ...claims, sub: 'not-uuid' }),
        jwt.signAsync({ ...claims, sid: 'not-uuid' }),
        jwt.signAsync({ ...claims, typ: 'refresh' }),
        new JwtService({ secret: process.env.JWT_SECRET }).signAsync({
          ...claims,
          iss: 'inventory-api',
          aud: 'inventory-client',
        }),
      ]);
      for (const token of tokens) await me(token).expect(401);
      await expect(
        app.get(AuthService).authenticate(await jwt.signAsync(claims)),
      ).rejects.toThrow('Credenciales');
    });
  });

  describe('migración que retira el 2FA (J-07)', () => {
    const columns = async () =>
      (
        await context.source.query<{ column_name: string }[]>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'users' ORDER BY column_name`,
          [context.ownedSchema],
        )
      ).map((row) => row.column_name);
    const proofsTable = async () =>
      (
        await context.source.query<{ name: string | null }[]>(
          'SELECT to_regclass($1) AS name',
          [table('auth_proofs')],
        )
      )[0].name;
    const TOTP_COLUMNS = [
      'last_totp_counter',
      'totp_blocked_until',
      'totp_failures',
      'totp_secret',
    ];

    it('tras la migración no hay estructura 2FA y queda la autenticación por contraseña', async () => {
      expect(await proofsTable()).toBeNull();
      const present = await columns();
      for (const column of TOTP_COLUMNS) expect(present).not.toContain(column);
      expect(present).toEqual(
        expect.arrayContaining([
          'password_hash',
          'login_failures',
          'blocked_until',
        ]),
      );
      for (const loginFailures of [-1, 6])
        await expect(
          context.source.getRepository(User).update(user.id, { loginFailures }),
        ).rejects.toMatchObject({ driverError: { code: '23514' } });
    });

    it('aplicada sobre datos del esquema anterior conserva usuarios, sesiones e inventario y elimina solo el 2FA', async () => {
      await context.source.undoLastMigration();
      expect(await columns()).toEqual(expect.arrayContaining(TOTP_COLUMNS));
      expect(await proofsTable()).not.toBeNull();
      const legacy = await context.source.query<{ id: string }[]>(
        `INSERT INTO ${table('users')}
           (username, password_hash, role, totp_secret, last_totp_counter, totp_failures, login_failures)
         VALUES ('con_totp', $1, 'operador', 'cifrado.simulado.secreto', 42, 2, 3),
                ('sin_totp', $1, 'operador', NULL, NULL, 0, 0)
         RETURNING id`,
        [passwordHash],
      );
      await context.source.query(
        `INSERT INTO ${table('auth_proofs')} (user_id, kind, token_hash, expires_at)
         VALUES ($1, 'enrollment', $2, now() + interval '1 hour')`,
        [legacy[1].id, 'c'.repeat(64)],
      );
      const session = await context.source.getRepository(Session).save({
        userId: user.id,
        expiresAt: new Date(Date.now() + 600_000),
      });
      const product = await context.source
        .getRepository(Product)
        .save({ sku: 'KEEP-1', name: 'Conservar', stock: 3 });

      await context.source.runMigrations();

      expect(await proofsTable()).toBeNull();
      const present = await columns();
      for (const column of TOTP_COLUMNS) expect(present).not.toContain(column);
      const rows = await context.source.query<
        { username: string; password_hash: string; login_failures: number }[]
      >(
        `SELECT username, password_hash, login_failures FROM ${table('users')} ORDER BY username`,
      );
      expect(rows.map((row) => row.username)).toEqual([
        'admin',
        'con_totp',
        'sin_totp',
      ]);
      expect(rows.every((row) => row.password_hash === passwordHash)).toBe(
        true,
      );
      expect(rows.find((row) => row.username === 'con_totp')).toMatchObject({
        login_failures: 3,
      });
      expect(
        await context.source
          .getRepository(Session)
          .findOneByOrFail({ id: session.id }),
      ).toMatchObject({ userId: user.id, revokedAt: null });
      expect(
        (
          await context.source
            .getRepository(Product)
            .findOneByOrFail({ id: product.id })
        ).stock,
      ).toBe(3);
      // El usuario que tenía TOTP entra ahora solo con su contraseña.
      expect(
        (await me(await login('con_totp')).expect(200)).body,
      ).toMatchObject({ username: 'con_totp' });
      expect(
        (await me(await login('sin_totp')).expect(200)).body,
      ).toMatchObject({ username: 'sin_totp' });
    });

    it('down restaura la estructura vacía con sus restricciones y up la vuelve a quitar', async () => {
      await context.source.undoLastMigration();
      const restored = await context.source.query<
        { totp_secret: string | null; totp_failures: number }[]
      >(`SELECT totp_secret, totp_failures FROM ${table('users')}`);
      expect(restored).toEqual([{ totp_secret: null, totp_failures: 0 }]);
      for (const [column, value] of [
        ['totp_failures', 6],
        ['last_totp_counter', -1],
      ] as const)
        await expect(
          context.source.query(`UPDATE ${table('users')} SET ${column} = $1`, [
            value,
          ]),
        ).rejects.toMatchObject({ driverError: { code: '23514' } });
      await expect(
        context.source.query(
          `INSERT INTO ${table('auth_proofs')} (user_id, kind, token_hash, expires_at, attempts)
           VALUES ($1, 'challenge', $2, now(), 6)`,
          [user.id, 'd'.repeat(64)],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      await context.source.runMigrations();
      expect(await proofsTable()).toBeNull();
      expect(
        await context.source
          .getRepository(User)
          .findOneByOrFail({ id: user.id }),
      ).toMatchObject({ username: 'admin', role: 'admin' });
    });
  });
});
