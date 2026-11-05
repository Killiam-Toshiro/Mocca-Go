import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
interface SafeUser {
  id: string;
  username: string;
  role: UserRole;
}

const password = 'Integration-only-password';
const ROLES: UserRole[] = ['admin', 'operador', 'repartidor', 'cliente'];

describe('Roles de Mocca Go: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let hash: string;
  const accounts = {} as Record<UserRole, User>;
  const tokens = {} as Record<UserRole, string>;

  beforeAll(async () => {
    hash = await hashPassword(password);
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
    for (const role of ROLES) {
      accounts[role] = await context.source
        .getRepository(User)
        .save({ username: `rol_${role}`, role, passwordHash: hash });
      tokens[role] = await access(accounts[role]);
    }
  });
  afterEach(async () => {
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  async function access(user: User): Promise<string> {
    const session = await context.source
      .getRepository(Session)
      .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
    return app
      .get(JwtService)
      .signAsync({ sub: user.id, sid: session.id, typ: 'access' });
  }
  const as = (role: UserRole) => `Bearer ${tokens[role]}`;
  const create = (body: object, role: UserRole = 'admin') =>
    request(server)
      .post('/api/v1/users')
      .set('Authorization', as(role))
      .send(body);
  const changeRole = (id: string, body: object, role: UserRole = 'admin') =>
    request(server)
      .patch(`/api/v1/users/${id}/role`)
      .set('Authorization', as(role))
      .send(body);
  const count = () => context.source.getRepository(User).count();
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;

  describe('creación de usuarios (CA-03, CA-04)', () => {
    it.each(['admin', 'operador', 'repartidor'] as const)(
      'el admin crea un usuario con rol %s',
      async (role) => {
        const response = await create({
          username: `nuevo_${role}`,
          password,
          role,
        }).expect(201);
        expect((response.body as SafeUser).role).toBe(role);
      },
    );

    it.each(['cliente', 'superusuario', 'ADMIN', '', null, 5])(
      'rechaza el rol %p y no crea nada',
      async (role) => {
        const before = await count();
        await create({ username: 'sin_rol_valido', password, role }).expect(
          400,
        );
        expect(await count()).toBe(before);
      },
    );
  });

  describe('cambio de rol (CA-05 a CA-08)', () => {
    it('el admin cambia a personal a repartidor', async () => {
      const response = await changeRole(accounts.operador.id, {
        role: 'repartidor',
      }).expect(200);
      expect((response.body as SafeUser).role).toBe('repartidor');
    });

    it('no admite asignar el rol cliente', async () => {
      await changeRole(accounts.operador.id, { role: 'cliente' }).expect(400);
      expect(
        (
          await context.source
            .getRepository(User)
            .findOneByOrFail({ id: accounts.operador.id })
        ).role,
      ).toBe('operador');
    });

    it.each(['admin', 'operador', 'repartidor'] as const)(
      'un cliente no cambia de rol (%s): 409 sin cambios',
      async (role) => {
        const response = await changeRole(accounts.cliente.id, { role }).expect(
          409,
        );
        expect(message(response)).toBe('Un cliente no cambia de rol.');
        expect(
          (
            await context.source
              .getRepository(User)
              .findOneByOrFail({ id: accounts.cliente.id })
          ).role,
        ).toBe('cliente');
      },
    );

    it('el usuario inexistente sigue respondiendo 404 antes que la regla de cliente', async () => {
      await changeRole('4f6c2b8e-3b1a-4c5d-9e7f-1a2b3c4d5e6f', {
        role: 'admin',
      }).expect(404);
    });

    it('conserva la protección del último administrador', async () => {
      const response = await changeRole(accounts.admin.id, {
        role: 'repartidor',
      }).expect(409);
      expect(message(response)).toBe(
        'No se puede degradar al último administrador.',
      );
    });
  });

  describe('permisos por rol (CA-09, CA-10)', () => {
    it.each(['operador', 'repartidor', 'cliente'] as const)(
      '%s no administra usuarios',
      async (role) => {
        await request(server)
          .get('/api/v1/users')
          .set('Authorization', as(role))
          .expect(403);
        await create(
          { username: 'intruso', password, role: 'admin' },
          role,
        ).expect(403);
        await changeRole(accounts.cliente.id, { role: 'admin' }, role).expect(
          403,
        );
      },
    );

    it.each(['repartidor', 'cliente'] as const)(
      '%s no accede a los movimientos',
      async (role) => {
        await request(server)
          .get('/api/v1/movements')
          .set('Authorization', as(role))
          .expect(403);
        await request(server)
          .post('/api/v1/movements')
          .set('Authorization', as(role))
          .send({
            productId: '4f6c2b8e-3b1a-4c5d-9e7f-1a2b3c4d5e6f',
            type: 'IN',
            quantity: 1,
            reason: 'Intento',
          })
          .expect(403);
      },
    );

    it('operador sigue registrando movimientos (sin cambios)', async () => {
      await request(server)
        .get('/api/v1/movements')
        .set('Authorization', as('operador'))
        .expect(200);
    });

    it.each(['repartidor', 'cliente'] as const)(
      '%s no accede al catálogo interno: lo lee del menú público',
      async (role) => {
        await request(server)
          .get('/api/v1/products')
          .set('Authorization', as(role))
          .expect(403);
        await request(server)
          .post('/api/v1/products')
          .set('Authorization', as(role))
          .send({
            sku: 'NO-PERMITIDO',
            name: 'No permitido',
            category: 'snack',
            price: 1000,
            cost: 400,
          })
          .expect(403);
        await request(server).get('/api/v1/menu').expect(200);
      },
    );
  });

  describe('inicio de sesión (CA-11)', () => {
    it.each(['repartidor', 'cliente'] as const)(
      '%s inicia sesión y /auth/me devuelve su rol',
      async (role) => {
        const login = await request(server)
          .post('/api/v1/auth/login')
          .send({ username: `rol_${role}`, password })
          .expect(200);
        const token = (login.body as { accessToken: string }).accessToken;
        const me = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect((me.body as SafeUser).role).toBe(role);
      },
    );
  });

  describe('restricción de PostgreSQL (CA-01)', () => {
    it.each(ROLES)('acepta el rol %s', async (role) => {
      await expect(
        context.source
          .getRepository(User)
          .save({ username: `db_${role}`, role, passwordHash: hash }),
      ).resolves.toMatchObject({ role });
    });

    it('rechaza un rol desconocido', async () => {
      await expect(
        context.source.query(
          `INSERT INTO "${context.ownedSchema}"."users" ("username","password_hash","role") VALUES ('rol_raro','x','invitado')`,
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    });
  });
});
