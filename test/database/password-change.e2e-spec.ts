import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Session } from '../../src/auth/entities/session.entity';
import { configureApplication } from '../../src/configure-app';
import { hashPassword } from '../../src/seed/password';
import { User, UserRole } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

const oldPassword = 'Clave-actual-12345';
const newPassword = 'Clave-nueva-67890';
const ROLES: UserRole[] = ['admin', 'operador', 'repartidor', 'cliente'];

describe('Cambio de contraseña propio: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword(oldPassword);
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(context.source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  const users = () => context.source.getRepository(User);
  const sessions = () => context.source.getRepository(Session);
  async function account(role: UserRole, username = `u_${role}`) {
    return users().save({ username, role, passwordHash: hash });
  }
  const login = (username: string, password: string) =>
    request(server).post('/api/v1/auth/login').send({ username, password });
  async function session(username: string): Promise<string> {
    const response = await login(username, oldPassword).expect(200);
    return `Bearer ${(response.body as { accessToken: string }).accessToken}`;
  }
  const change = (header: string, body: object) =>
    request(server)
      .patch('/api/v1/auth/password')
      .set('Authorization', header)
      .send(body);
  const current = (id: string) =>
    users()
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.loginFailures',
        'user.blockedUntil',
      ])
      .where('user.id = :id', { id })
      .getOneOrFail();
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const me = (header: string) =>
    request(server).get('/api/v1/auth/me').set('Authorization', header);

  it.each(ROLES)(
    'CA-32: el rol %s cambia su contraseña: la nueva sirve y la anterior no',
    async (role) => {
      const user = await account(role);
      const header = await session(user.username);
      const response = await change(header, {
        currentPassword: oldPassword,
        newPassword,
      }).expect(204);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toBe('');
      await login(user.username, oldPassword).expect(401);
      await login(user.username, newPassword).expect(200);
      expect((await current(user.id)).passwordHash).not.toBe(hash);
    },
  );

  it('CA-32: un cliente real cambia la contraseña y entra con su correo', async () => {
    await request(server)
      .post('/api/v1/customers')
      .send({
        email: 'ana@u.icesi.edu.co',
        password: oldPassword,
        fullName: 'Ana',
        phone: '3001234567',
      })
      .expect(201);
    const first = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@u.icesi.edu.co', password: oldPassword })
      .expect(200);
    const header = `Bearer ${(first.body as { accessToken: string }).accessToken}`;
    await change(header, { currentPassword: oldPassword, newPassword }).expect(
      204,
    );
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@u.icesi.edu.co', password: oldPassword })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@u.icesi.edu.co', password: newPassword })
      .expect(200);
  });

  it('CA-33: revoca las demás sesiones del usuario y conserva la actual y las ajenas', async () => {
    const user = await account('operador');
    const other = await account('operador', 'otro_operador');
    const mine = await session(user.username);
    const second = await session(user.username);
    const third = await session(user.username);
    const foreign = await session(other.username);
    await change(second, { currentPassword: oldPassword, newPassword }).expect(
      204,
    );
    await me(second).expect(200);
    await me(mine).expect(401);
    await me(third).expect(401);
    await me(foreign).expect(200);
    const revoked = await sessions()
      .createQueryBuilder('s')
      .where('s.userId = :id AND s.revokedAt IS NOT NULL', { id: user.id })
      .getCount();
    expect(revoked).toBe(2);
  });

  it('CA-34: una contraseña actual incorrecta responde 403, no cambia nada y suma un fallo', async () => {
    const user = await account('admin');
    const header = await session(user.username);
    const response = await change(header, {
      currentPassword: 'Clave-equivocada-1',
      newPassword,
    }).expect(403);
    expect(message(response)).toBe('La contraseña actual no es correcta.');
    const stored = await current(user.id);
    expect(stored.passwordHash).toBe(hash);
    expect(stored.loginFailures).toBe(1);
    await me(header).expect(200);
    await login(user.username, oldPassword).expect(200);
  });

  it('CA-35: cinco fallos bloquean la cuenta; el cambio y el login responden como bloqueados hasta que vence', async () => {
    const user = await account('repartidor');
    const header = await session(user.username);
    for (let n = 0; n < 5; n++)
      await change(header, {
        currentPassword: 'Clave-equivocada-1',
        newPassword,
      }).expect(403);
    expect((await current(user.id)).blockedUntil).not.toBeNull();
    const blocked = await change(header, {
      currentPassword: oldPassword,
      newPassword,
    }).expect(403);
    expect(message(blocked)).toBe('La contraseña actual no es correcta.');
    await login(user.username, oldPassword).expect(401);
    expect((await current(user.id)).passwordHash).toBe(hash);

    await users().update(
      { id: user.id },
      { blockedUntil: new Date(Date.now() - 1000) },
    );
    await change(header, { currentPassword: oldPassword, newPassword }).expect(
      204,
    );
    await login(user.username, newPassword).expect(200);
  });

  it('CA-36: un cambio correcto reinicia el contador de fallos y el bloqueo', async () => {
    const user = await account('operador');
    const header = await session(user.username);
    for (let n = 0; n < 3; n++)
      await change(header, {
        currentPassword: 'Clave-equivocada-1',
        newPassword,
      }).expect(403);
    expect((await current(user.id)).loginFailures).toBe(3);
    await change(header, { currentPassword: oldPassword, newPassword }).expect(
      204,
    );
    const stored = await current(user.id);
    expect(stored.loginFailures).toBe(0);
    expect(stored.blockedUntil).toBeNull();
  });

  it('CA-37: la contraseña nueva debe ser distinta de la actual', async () => {
    const user = await account('cliente');
    const header = await session(user.username);
    const response = await change(header, {
      currentPassword: oldPassword,
      newPassword: oldPassword,
    }).expect(400);
    expect(message(response)).toBe(
      'La contraseña nueva debe ser distinta de la actual.',
    );
    expect((await current(user.id)).passwordHash).toBe(hash);
    await me(header).expect(200);
  });

  it.each([
    ['sin contraseña actual', { newPassword }],
    ['sin contraseña nueva', { currentPassword: oldPassword }],
    [
      'nueva de 11 caracteres',
      { currentPassword: oldPassword, newPassword: 'x'.repeat(11) },
    ],
    [
      'nueva de 129 caracteres',
      { currentPassword: oldPassword, newPassword: 'x'.repeat(129) },
    ],
    [
      'actual de 11 caracteres',
      { currentPassword: 'x'.repeat(11), newPassword },
    ],
    ['actual nula', { currentPassword: null, newPassword }],
    [
      'nueva numérica',
      { currentPassword: oldPassword, newPassword: 123456789012 },
    ],
    ['con un id', { currentPassword: oldPassword, newPassword, id: 'x' }],
    [
      'con un username',
      { currentPassword: oldPassword, newPassword, username: 'admin' },
    ],
    ['vacío', {}],
  ])('CA-38: rechaza el cuerpo %s', async (_name, body) => {
    const user = await account('operador');
    const header = await session(user.username);
    await change(header, body).expect(400);
    const stored = await current(user.id);
    expect(stored.passwordHash).toBe(hash);
    expect(stored.loginFailures).toBe(0);
  });

  it('CA-38: acepta los límites de 12 y 128 caracteres', async () => {
    const user = await account('operador');
    const header = await session(user.username);
    await change(header, {
      currentPassword: oldPassword,
      newPassword: 'n'.repeat(128),
    }).expect(204);
    const second = await login(user.username, 'n'.repeat(128)).expect(200);
    const next = `Bearer ${(second.body as { accessToken: string }).accessToken}`;
    await change(next, {
      currentPassword: 'n'.repeat(128),
      newPassword: 'm'.repeat(12),
    }).expect(204);
  });

  it('CA-39: sin token, con token inválido o de una sesión cerrada responde 401', async () => {
    const user = await account('operador');
    const header = await session(user.username);
    const body = { currentPassword: oldPassword, newPassword };
    await request(server).patch('/api/v1/auth/password').send(body).expect(401);
    await change('Bearer abc.def.ghi', body).expect(401);
    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', header)
      .expect(204);
    await change(header, body).expect(401);
    expect((await current(user.id)).passwordHash).toBe(hash);
  });

  it('CA-40: ninguna respuesta incluye contraseñas ni hashes', async () => {
    const user = await account('operador');
    const header = await session(user.username);
    const responses = [
      await change(header, {
        currentPassword: oldPassword,
        newPassword: '1',
      }).expect(400),
      await change(header, {
        currentPassword: 'Clave-equivocada-1',
        newPassword,
      }).expect(403),
      await change(header, {
        currentPassword: oldPassword,
        newPassword: oldPassword,
      }).expect(400),
      await request(server).patch('/api/v1/auth/password').send({}).expect(401),
      await change(header, {
        currentPassword: oldPassword,
        newPassword,
      }).expect(204),
    ];
    for (const response of responses)
      for (const secret of [
        oldPassword,
        newPassword,
        'Clave-equivocada-1',
        'scrypt$',
      ])
        expect(response.text).not.toContain(secret);
  });

  it('CA-40: el límite de 20 peticiones por minuto de /auth también aplica', async () => {
    const user = await account('operador');
    const header = await session(user.username);
    const body = { currentPassword: 'Clave-equivocada-1', newPassword };
    let limited = false;
    for (let n = 0; n < 25 && !limited; n++)
      limited = (await change(header, body)).status === 429;
    expect(limited).toBe(true);
  });
});
