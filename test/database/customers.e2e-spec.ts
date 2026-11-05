import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Session } from '../../src/auth/entities/session.entity';
import { configureApplication } from '../../src/configure-app';
import { Customer } from '../../src/customers/entities/customer.entity';
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
interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

const staffPassword = 'Integration-only-password';
const valid = {
  email: 'ana.perez@u.icesi.edu.co',
  password: 'una-clave-larga-123',
  fullName: 'Ana Pérez',
  phone: '300 123 4567',
};

describe('Clientes de Mocca Go: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword(staffPassword);
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
    jest.restoreAllMocks();
    if (app) await app.close();
    if (context) await disposeTestDatabase(context);
  });

  const register = (body: object = valid) =>
    request(server).post('/api/v1/customers').send(body);
  const login = (body: object) =>
    request(server).post('/api/v1/auth/login').send(body);
  const without = (field: keyof typeof valid) =>
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
  const customers = () => context.source.getRepository(Customer);
  const users = () => context.source.getRepository(User);

  async function staffToken(role: UserRole, username = `p_${role}`) {
    const user = await users().save({ username, role, passwordHash: hash });
    const session = await context.source
      .getRepository(Session)
      .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, sid: session.id, typ: 'access' });
    return { id: user.id, header: `Bearer ${token}` };
  }
  async function clientToken(body = valid) {
    await register(body).expect(201);
    const response = await login({
      email: body.email,
      password: body.password,
    }).expect(200);
    const { accessToken } = response.body as { accessToken: string };
    return `Bearer ${accessToken}`;
  }
  const me = (header: string) =>
    request(server).get('/api/v1/customers/me').set('Authorization', header);
  const patchMe = (header: string, body: object) =>
    request(server)
      .patch('/api/v1/customers/me')
      .set('Authorization', header)
      .send(body);
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const leaksSecrets = (response: { text: string }, ...secrets: string[]) =>
    [/scrypt\$/, /password_?hash/i, ...secrets].some((needle) =>
      typeof needle === 'string'
        ? response.text.includes(needle)
        : needle.test(response.text),
    );

  describe('registro (CA-03 a CA-14)', () => {
    it('CA-03: crea el cliente con rol cliente, hash y sin datos internos', async () => {
      const response = await register().expect(201);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.body as Profile;
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'email',
        'fullName',
        'id',
        'phone',
        'updatedAt',
      ]);
      expect(body).toMatchObject({
        email: 'ana.perez@u.icesi.edu.co',
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
      const user = await users()
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: body.id })
        .getOneOrFail();
      expect(user.role).toBe('cliente');
      expect(user.username).toMatch(/^c[0-9a-f]{16}$/);
      expect(user.passwordHash).toMatch(/^scrypt\$/);
      expect(user.passwordHash).not.toContain(valid.password);
      expect(JSON.stringify(response.body)).not.toContain(user.username);
    });

    it('CA-04: guarda el correo en minúsculas y recortado y detecta duplicados sin distinguir mayúsculas', async () => {
      const response = await register({
        ...valid,
        email: ' Ana.Perez@U.ICESI.edu.co ',
      }).expect(201);
      expect((response.body as Profile).email).toBe('ana.perez@u.icesi.edu.co');
      const duplicate = await register({
        ...valid,
        email: 'ANA.PEREZ@u.icesi.edu.co',
      }).expect(409);
      expect(message(duplicate)).toBe('El correo ya está registrado.');
      expect(await customers().count()).toBe(1);
    });

    it.each([
      ['inválido', 'no-es-correo'],
      ['sin dominio', 'ana@'],
      ['vacío', ''],
      ['null', null],
      ['número', 5],
      ['de más de 254 caracteres', `${'a'.repeat(250)}@u.icesi.edu.co`],
    ])('CA-05: rechaza un correo %s', async (_name, email) => {
      await register({ ...valid, email }).expect(400);
      expect(await users().count()).toBe(0);
    });

    it('CA-05: rechaza el correo ausente', async () => {
      await register(without('email')).expect(400);
      expect(await users().count()).toBe(0);
    });

    it.each([
      ['de 11 caracteres', 'x'.repeat(11)],
      ['de 129 caracteres', 'x'.repeat(129)],
      ['nula', null],
      ['numérica', 123456789012],
      ['vacía', ''],
    ])('CA-06: rechaza una contraseña %s', async (_name, password) => {
      await register({ ...valid, password }).expect(400);
      expect(await users().count()).toBe(0);
    });

    it('CA-06: rechaza la contraseña ausente y acepta los límites de 12 y 128', async () => {
      await register(without('password')).expect(400);
      await register({ ...valid, password: 'x'.repeat(12) }).expect(201);
      await register({
        ...valid,
        email: 'otra@u.icesi.edu.co',
        password: 'x'.repeat(128),
      }).expect(201);
    });

    it.each([
      ['vacío', ''],
      ['de un carácter', 'A'],
      ['de solo espacios', '     '],
      ['de más de 100 caracteres', 'A'.repeat(101)],
      ['nulo', null],
      ['numérico', 7],
    ])('CA-07: rechaza un nombre %s', async (_name, fullName) => {
      await register({ ...valid, fullName }).expect(400);
      expect(await users().count()).toBe(0);
    });

    it('CA-07: recorta el nombre y acepta 2 y 100 caracteres', async () => {
      const first = await register({ ...valid, fullName: '  Al  ' }).expect(
        201,
      );
      expect((first.body as Profile).fullName).toBe('Al');
      await register({
        ...valid,
        email: 'largo@u.icesi.edu.co',
        fullName: 'A'.repeat(100),
      }).expect(201);
    });

    it.each([
      ['3001234567', '+573001234567'],
      ['(300) 123-4567', '+573001234567'],
      ['+57 300 123 4567', '+573001234567'],
      ['573001234567', '+573001234567'],
      ['0057 3001234567', '+573001234567'],
      ['+1 415 555 2671', '+14155552671'],
      ['+34 612 345 678', '+34612345678'],
    ])('CA-08, CA-09: guarda el teléfono %p como %s', async (phone, stored) => {
      const response = await register({ ...valid, phone }).expect(201);
      expect((response.body as Profile).phone).toBe(stored);
    });

    it.each([
      ['2001234567'],
      ['300123'],
      ['abc'],
      ['+0123456789'],
      ['+1234567890123456'],
      ['+57 601 234 5678'],
      [''],
      [null],
      [3001234567],
    ])('CA-10: rechaza el teléfono %p', async (phone) => {
      const response = await register({ ...valid, phone }).expect(400);
      expect(message(response)).toEqual([
        'phone debe ser un celular colombiano o un número internacional válido.',
      ]);
      expect(await users().count()).toBe(0);
    });

    it('CA-10: rechaza el teléfono ausente', async () => {
      await register(without('phone')).expect(400);
    });

    it.each([
      ['role', 'admin'],
      ['username', 'otro_nombre'],
      ['id', '5b4c0c3a-0a4f-4f0e-9d51-1f1c8c0a9b11'],
      ['source', 'qr'],
    ])('CA-11: rechaza el campo extra %s', async (field, value) => {
      await register({ ...valid, [field]: value }).expect(400);
      expect(await users().count()).toBe(0);
    });

    it('CA-12: dos clientes pueden compartir teléfono', async () => {
      await register().expect(201);
      await register({ ...valid, email: 'beto@u.icesi.edu.co' }).expect(201);
      expect(await customers().count()).toBe(2);
    });

    it('CA-13: dos registros simultáneos con el mismo correo dan un 201 y un 409', async () => {
      const results = await Promise.all([register(), register()]);
      expect(results.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(await users().count()).toBe(1);
      expect(await customers().count()).toBe(1);
    });

    it('CA-14: si falla la fila de clientes no queda un usuario huérfano', async () => {
      const original = Reflect.get(EntityManager.prototype, 'insert') as (
        ...input: unknown[]
      ) => Promise<never>;
      jest
        .spyOn(EntityManager.prototype, 'insert')
        .mockImplementation(function (this: EntityManager, ...args: unknown[]) {
          if (args[0] === Customer)
            throw new QueryFailedError('INSERT', [], new Error('simulado'));
          return original.apply(this, args);
        });
      const response = await register().expect(500);
      expect(message(response)).toBe('No se pudo registrar.');
      jest.restoreAllMocks();
      expect(await users().count()).toBe(0);
      expect(await customers().count()).toBe(0);
      expect(leaksSecrets(response, valid.password)).toBe(false);
    });

    it('CA-30: el sexto registro de un minuto responde 429 y el resto de la API no se ve afectado', async () => {
      for (let n = 0; n < 5; n++)
        await register({
          ...valid,
          email: `cliente${n}@u.icesi.edu.co`,
        }).expect(201);
      const blocked = await register({
        ...valid,
        email: 'cliente5@u.icesi.edu.co',
      }).expect(429);
      expect(leaksSecrets(blocked, valid.password)).toBe(false);
      expect(await customers().count()).toBe(5);
      await request(server).get('/api/v1/health').expect(200);
      await login({
        email: 'cliente0@u.icesi.edu.co',
        password: valid.password,
      }).expect(200);
    });
  });

  describe('inicio de sesión con correo (CA-15 a CA-19)', () => {
    it('CA-15: acepta el correo en cualquier combinación de mayúsculas y entrega un JWT de cliente', async () => {
      await register().expect(201);
      const response = await login({
        email: ' ANA.Perez@u.icesi.edu.co',
        password: valid.password,
      }).expect(200);
      const body = response.body as { accessToken: string; tokenType: string };
      expect(body.tokenType).toBe('Bearer');
      const identity = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(identity.body).toMatchObject({ role: 'cliente' });
    });

    it('CA-16: correo inexistente, contraseña errada y cuenta de personal dan el mismo 401', async () => {
      await register().expect(201);
      await users().save({
        username: 'operador_uno',
        role: 'operador',
        passwordHash: hash,
      });
      const unknown = await login({
        email: 'nadie@u.icesi.edu.co',
        password: valid.password,
      }).expect(401);
      const wrong = await login({
        email: valid.email,
        password: 'otra-clave-larga-1',
      }).expect(401);
      const staff = await login({
        email: 'operador_uno@u.icesi.edu.co',
        password: staffPassword,
      }).expect(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.body).toEqual(staff.body);
      expect(message(unknown)).toBe('Credenciales inválidas.');
    });

    it.each([
      ['ninguno', {}],
      ['ambos', { username: 'admin', email: 'ana@u.icesi.edu.co' }],
      ['email inválido', { email: 'no-es-correo' }],
      ['email nulo', { email: null }],
    ])('CA-17: rechaza el login con %s', async (_name, identity) => {
      await login({ ...identity, password: valid.password }).expect(400);
    });

    it('CA-18: el personal sigue iniciando sesión con username', async () => {
      await users().save({
        username: 'operador_dos',
        role: 'operador',
        passwordHash: hash,
      });
      await login({ username: 'operador_dos', password: staffPassword }).expect(
        200,
      );
    });

    it('CA-19: cinco fallos con el correo bloquean 15 minutos y el bloqueo vence', async () => {
      const response = await register().expect(201);
      const id = (response.body as Profile).id;
      for (let n = 0; n < 5; n++)
        await login({
          email: valid.email,
          password: 'otra-clave-larga-1',
        }).expect(401);
      await login({ email: valid.email, password: valid.password }).expect(401);
      await users().update(
        { id },
        { blockedUntil: new Date(Date.now() - 1000) },
      );
      await login({ email: valid.email, password: valid.password }).expect(200);
    });
  });

  describe('perfil propio (CA-20 a CA-25)', () => {
    it('CA-20: el cliente consulta su perfil', async () => {
      const header = await clientToken();
      const response = await me(header).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        email: valid.email,
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
    });

    it('CA-21: sin token, con token inválido o con rol de personal', async () => {
      await request(server).get('/api/v1/customers/me').expect(401);
      await me('Bearer abc.def.ghi').expect(401);
      await patchMe('Bearer abc.def.ghi', { fullName: 'Ana' }).expect(401);
      for (const role of ['admin', 'operador', 'repartidor'] as const) {
        const staff = await staffToken(role);
        await me(staff.header).expect(403);
        await patchMe(staff.header, { fullName: 'Persona' }).expect(403);
      }
    });

    it('CA-22: edita nombre, teléfono o ambos y normaliza el teléfono', async () => {
      const header = await clientToken();
      let response = await patchMe(header, { fullName: ' Ana María ' }).expect(
        200,
      );
      expect(response.body).toMatchObject({
        fullName: 'Ana María',
        phone: '+573001234567',
      });
      response = await patchMe(header, { phone: '+34 612 345 678' }).expect(
        200,
      );
      expect(response.body).toMatchObject({
        fullName: 'Ana María',
        phone: '+34612345678',
      });
      response = await patchMe(header, {
        fullName: 'Ana P.',
        phone: '(301) 555-0000',
      }).expect(200);
      expect(response.body).toMatchObject({
        fullName: 'Ana P.',
        phone: '+573015550000',
      });
      expect((await me(header).expect(200)).body).toEqual(response.body);
    });

    it.each([
      ['vacío', {}],
      ['con null', { fullName: null }],
      ['con teléfono null', { phone: null }],
      ['con correo', { email: 'otro@u.icesi.edu.co' }],
      ['con contraseña', { password: 'otra-clave-larga-1' }],
      ['con id', { id: '5b4c0c3a-0a4f-4f0e-9d51-1f1c8c0a9b11' }],
      ['con nombre corto', { fullName: 'A' }],
      ['con teléfono inválido', { phone: '12345' }],
    ])('CA-23: rechaza un PATCH %s y no cambia nada', async (_name, body) => {
      const header = await clientToken();
      const before = (await me(header).expect(200)).body as Profile;
      await patchMe(header, body).expect(400);
      expect((await me(header).expect(200)).body).toEqual(before);
    });

    it('CA-24: repetir los mismos valores no modifica updatedAt', async () => {
      const header = await clientToken();
      const before = (await me(header).expect(200)).body as Profile;
      const response = await patchMe(header, {
        fullName: before.fullName,
        phone: '3001234567',
      }).expect(200);
      expect((response.body as Profile).updatedAt).toBe(before.updatedAt);
    });

    it('CA-25: cada cliente ve solo su perfil', async () => {
      const ana = await clientToken();
      const beto = await clientToken({
        ...valid,
        email: 'beto@u.icesi.edu.co',
        fullName: 'Beto Ruiz',
        phone: '3105550000',
      });
      expect((await me(ana).expect(200)).body).toMatchObject({
        email: valid.email,
      });
      expect((await me(beto).expect(200)).body).toMatchObject({
        email: 'beto@u.icesi.edu.co',
        fullName: 'Beto Ruiz',
      });
      await patchMe(beto, { fullName: 'Beto R.' }).expect(200);
      expect((await me(ana).expect(200)).body).toMatchObject({
        fullName: 'Ana Pérez',
      });
    });

    it('un cliente sin fila en customers recibe 404', async () => {
      const user = await users().save({
        username: 'cliente_sin_perfil',
        role: 'cliente',
        passwordHash: hash,
      });
      const session = await context.source
        .getRepository(Session)
        .save({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
      const token = await app
        .get(JwtService)
        .signAsync({ sub: user.id, sid: session.id, typ: 'access' });
      await me(`Bearer ${token}`).expect(404);
      await patchMe(`Bearer ${token}`, { fullName: 'Nadie' }).expect(404);
    });
  });

  describe('roles y administración (CA-26 a CA-29)', () => {
    it('CA-26: el cliente no accede a /users, /movements ni al catálogo interno, pero lee el menú', async () => {
      const header = await clientToken();
      await request(server)
        .get('/api/v1/users')
        .set('Authorization', header)
        .expect(403);
      await request(server)
        .get('/api/v1/movements')
        .set('Authorization', header)
        .expect(403);
      await request(server)
        .post('/api/v1/products')
        .set('Authorization', header)
        .send({
          sku: 'X-1',
          name: 'X',
          category: 'snack',
          price: 1000,
          cost: 400,
        })
        .expect(403);
      await request(server)
        .get('/api/v1/products')
        .set('Authorization', header)
        .expect(403);
      await request(server)
        .get('/api/v1/menu')
        .set('Authorization', header)
        .expect(200);
    });

    it('CA-27: el admin elimina a un cliente y se va su fila; el correo puede registrarse otra vez', async () => {
      const header = await clientToken();
      const id = ((await me(header).expect(200)).body as Profile).id;
      const admin = await staffToken('admin');
      await request(server)
        .delete(`/api/v1/users/${id}`)
        .set('Authorization', admin.header)
        .expect(204);
      expect(await customers().count()).toBe(0);
      await login({ email: valid.email, password: valid.password }).expect(401);
      await me(header).expect(401);
      await register().expect(201);
    });

    it('CA-28: el admin restablece la contraseña de un cliente y se cierran sus sesiones', async () => {
      const header = await clientToken();
      const id = ((await me(header).expect(200)).body as Profile).id;
      const admin = await staffToken('admin');
      await request(server)
        .patch(`/api/v1/users/${id}`)
        .set('Authorization', admin.header)
        .send({ password: 'clave-nueva-del-admin-1' })
        .expect(200);
      await me(header).expect(401);
      await login({ email: valid.email, password: valid.password }).expect(401);
      await login({
        email: valid.email,
        password: 'clave-nueva-del-admin-1',
      }).expect(200);
    });

    it('CA-29: el rol de un cliente real no se cambia', async () => {
      const header = await clientToken();
      const id = ((await me(header).expect(200)).body as Profile).id;
      const admin = await staffToken('admin');
      const response = await request(server)
        .patch(`/api/v1/users/${id}/role`)
        .set('Authorization', admin.header)
        .send({ role: 'operador' })
        .expect(409);
      expect(message(response)).toBe('Un cliente no cambia de rol.');
      expect((await users().findOneByOrFail({ id })).role).toBe('cliente');
    });
  });

  describe('listado y detalle de usuarios con datos de contacto (CA-43 a CA-46)', () => {
    const contactOf = (body: unknown) => {
      const { email, fullName, phone } = body as Profile;
      return { email, fullName, phone };
    };
    const noContact = { email: null, fullName: null, phone: null };

    it('CA-43: el admin ve correo, nombre y teléfono de los clientes y null en el personal', async () => {
      const admin = await staffToken('admin');
      await staffToken('operador');
      await register().expect(201);
      await register({
        ...valid,
        email: 'beto@u.icesi.edu.co',
        fullName: 'Beto Ruiz',
        phone: '+34 612 345 678',
      }).expect(201);
      const response = await request(server)
        .get('/api/v1/users')
        .set('Authorization', admin.header)
        .expect(200);
      const page = response.body as {
        data: (Profile & { role: UserRole; username: string })[];
        total: number;
      };
      expect(page.total).toBe(4);
      const byRole = (role: UserRole) =>
        page.data.filter((user) => user.role === role);
      expect(byRole('admin').map(contactOf)).toEqual([noContact]);
      expect(byRole('operador').map(contactOf)).toEqual([noContact]);
      expect(
        byRole('cliente')
          .map(contactOf)
          .sort((a, b) => a.email.localeCompare(b.email)),
      ).toEqual([
        {
          email: 'ana.perez@u.icesi.edu.co',
          fullName: 'Ana Pérez',
          phone: '+573001234567',
        },
        {
          email: 'beto@u.icesi.edu.co',
          fullName: 'Beto Ruiz',
          phone: '+34612345678',
        },
      ]);
      for (const user of page.data)
        expect(Object.keys(user).sort()).toEqual([
          'createdAt',
          'email',
          'fullName',
          'id',
          'phone',
          'role',
          'updatedAt',
          'username',
        ]);
      expect(leaksSecrets(response, valid.password)).toBe(false);
    });

    it('CA-44: el detalle de un cliente trae sus datos y el de un miembro del personal, null', async () => {
      const admin = await staffToken('admin');
      const operator = await staffToken('operador');
      const created = await register().expect(201);
      const client = await request(server)
        .get(`/api/v1/users/${(created.body as Profile).id}`)
        .set('Authorization', admin.header)
        .expect(200);
      expect(contactOf(client.body)).toEqual({
        email: 'ana.perez@u.icesi.edu.co',
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
      const staff = await request(server)
        .get(`/api/v1/users/${operator.id}`)
        .set('Authorization', admin.header)
        .expect(200);
      expect(contactOf(staff.body)).toEqual(noContact);
    });

    it('CA-45: editar a un cliente o a un miembro del personal devuelve los mismos campos', async () => {
      const admin = await staffToken('admin');
      const operator = await staffToken('operador');
      const created = await register().expect(201);
      const client = await request(server)
        .patch(`/api/v1/users/${(created.body as Profile).id}`)
        .set('Authorization', admin.header)
        .send({ password: 'clave-nueva-del-admin-1' })
        .expect(200);
      expect(contactOf(client.body)).toMatchObject({
        email: 'ana.perez@u.icesi.edu.co',
        fullName: 'Ana Pérez',
      });
      const staff = await request(server)
        .patch(`/api/v1/users/${operator.id}`)
        .set('Authorization', admin.header)
        .send({ username: 'operador_renombrado' })
        .expect(200);
      expect(contactOf(staff.body)).toEqual(noContact);
    });

    it('CA-46: solo el admin ve el listado y el detalle; los demás roles reciben 403', async () => {
      const operator = await staffToken('operador');
      const courier = await staffToken('repartidor');
      const created = await register().expect(201);
      const client = await clientToken({
        ...valid,
        email: 'otro@u.icesi.edu.co',
      });
      const id = (created.body as Profile).id;
      for (const header of [operator.header, courier.header, client]) {
        await request(server)
          .get('/api/v1/users')
          .set('Authorization', header)
          .expect(403);
        await request(server)
          .get(`/api/v1/users/${id}`)
          .set('Authorization', header)
          .expect(403);
      }
      await request(server).get('/api/v1/users').expect(401);
    });
  });

  describe('privacidad (CA-31)', () => {
    it('ninguna respuesta de error filtra contraseñas, hashes ni el username interno', async () => {
      const first = await register().expect(201);
      const internal = (
        await users().findOneByOrFail({ id: (first.body as Profile).id })
      ).username;
      const responses = [
        await register().expect(409),
        await register({ ...valid, email: 'malo' }).expect(400),
        await login({
          email: valid.email,
          password: 'otra-clave-larga-1',
        }).expect(401),
        await request(server).get('/api/v1/customers/me').expect(401),
        await patchMe((await staffToken('operador')).header, {}).expect(403),
      ];
      for (const response of responses)
        expect(leaksSecrets(response, valid.password, internal)).toBe(false);
    });
  });
});
