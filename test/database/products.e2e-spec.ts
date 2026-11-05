import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-app';
import { Session } from '../../src/auth/entities/session.entity';
import { Product } from '../../src/products/entities/products.entity';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { runSeed } from '../../src/seed/seed';
import { hashPassword } from '../../src/seed/password';
import { User, UserRole } from '../../src/users/entities/user.entity';
import { quoteIdentifier } from '../../src/database/database.config';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

interface ProductBody {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  active: boolean;
  stock: number;
  createdAt: string;
  updatedAt: string;
}
interface ProductPage {
  data: ProductBody[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Catálogo de productos: HTTP con PostgreSQL real', () => {
  let context: TestDatabase;
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let operatorToken: string;
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword('Integration-only-password');
  });
  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    const admin = await user('admin', 'admin');
    const operator = await user('operador', 'operador');
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

  function user(username: string, role: UserRole): Promise<User> {
    return context.source
      .getRepository(User)
      .save({ username, role, passwordHash: hash });
  }
  async function access(owner: User): Promise<string> {
    const session = await context.source
      .getRepository(Session)
      .save({ userId: owner.id, expiresAt: new Date(Date.now() + 900_000) });
    return app
      .get(JwtService)
      .signAsync({ sub: owner.id, sid: session.id, typ: 'access' });
  }
  function seedProduct(
    sku: string,
    extra: Partial<Product> = {},
  ): Promise<Product> {
    return context.source
      .getRepository(Product)
      .save({ sku, name: `Producto ${sku}`, ...extra });
  }
  const bearer = (token: string) => `Bearer ${token}`;
  function create(body: object, token = adminToken) {
    return request(server)
      .post('/api/v1/products')
      .set('Authorization', bearer(token))
      .send(body);
  }
  function list(query = '', token = adminToken) {
    return request(server)
      .get(`/api/v1/products${query}`)
      .set('Authorization', bearer(token));
  }
  function detail(id: string, token = adminToken) {
    return request(server)
      .get(`/api/v1/products/${id}`)
      .set('Authorization', bearer(token));
  }
  function edit(id: string, body: object, token = adminToken) {
    return request(server)
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', bearer(token))
      .send(body);
  }
  function status(id: string, body: object, token = adminToken) {
    return request(server)
      .patch(`/api/v1/products/${id}/status`)
      .set('Authorization', bearer(token))
      .send(body);
  }
  const table = () => `${quoteIdentifier(context.ownedSchema)}."products"`;
  const productCount = () => context.source.getRepository(Product).count();
  const stored = (id: string) =>
    context.source.getRepository(Product).findOneByOrFail({ id });
  function assertPublic(product: ProductBody) {
    expect(Object.keys(product).sort()).toEqual([
      'active',
      'createdAt',
      'description',
      'id',
      'name',
      'sku',
      'stock',
      'updatedAt',
    ]);
    expect(new Date(product.createdAt).toISOString()).toBe(product.createdAt);
    expect(new Date(product.updatedAt).toISOString()).toBe(product.updatedAt);
  }

  describe('autenticación y permisos (P-01)', () => {
    it('las cinco rutas devuelven 401 sin JWT, con JWT inválido o con un JWT sin sesión válida', async () => {
      const product = await seedProduct('INV-001');
      const id = product.id;
      const anonymous = [
        request(server).post('/api/v1/products').send({ sku: 'X', name: 'X' }),
        request(server).get('/api/v1/products'),
        request(server).get(`/api/v1/products/${id}`),
        request(server).patch(`/api/v1/products/${id}`).send({ name: 'X' }),
        request(server)
          .patch(`/api/v1/products/${id}/status`)
          .send({ active: false }),
      ];
      for (const call of anonymous) await call.expect(401);
      await list('', 'a'.repeat(64)).expect(401);
      await detail(id, 'a'.repeat(64)).expect(401);
      // Tokens firmados con la clave correcta pero sin sesión válida o con otro propósito.
      const jwt = app.get(JwtService);
      const owner = await context.source
        .getRepository(User)
        .findOneByOrFail({ username: 'admin' });
      for (const claims of [
        { sub: owner.id, sid: randomUUID(), typ: 'access' },
        { sub: owner.id, sid: randomUUID(), typ: 'refresh' },
      ]) {
        const forged = await jwt.signAsync(claims);
        await list('', forged).expect(401);
        await create({ sku: 'INV-002', name: 'X' }, forged).expect(401);
      }
      expect(await productCount()).toBe(1);
    });

    it('el operador lee el catálogo pero recibe 403 en las tres rutas de escritura', async () => {
      const product = await seedProduct('INV-001', { stock: 3 });
      await list('', operatorToken).expect(200);
      await detail(product.id, operatorToken).expect(200);
      await create({ sku: 'INV-002', name: 'Nuevo' }, operatorToken).expect(
        403,
      );
      await edit(product.id, { name: 'Otro' }, operatorToken).expect(403);
      await status(product.id, { active: false }, operatorToken).expect(403);
      const unchanged = await stored(product.id);
      expect(unchanged.name).toBe('Producto INV-001');
      expect(unchanged.active).toBe(true);
      expect(await productCount()).toBe(1);
    });

    it('la autorización se resuelve antes de validar el cuerpo', async () => {
      await create({ campo: 'inválido' }, operatorToken).expect(403);
      await create({ campo: 'inválido' }, adminToken).expect(400);
    });
  });

  describe('creación (P-02, P-03)', () => {
    it('admin crea un producto con saldo cero, activo y solo campos públicos', async () => {
      const response = await create({
        sku: 'INV-100',
        name: 'Cable HDMI',
        description: 'Dos metros',
      }).expect(201);
      const body = response.body as ProductBody;
      assertPublic(body);
      expect(body).toMatchObject({
        sku: 'INV-100',
        name: 'Cable HDMI',
        description: 'Dos metros',
        active: true,
        stock: 0,
      });
      const row = await stored(body.id);
      expect(row.stock).toBe(0);
      expect(row.active).toBe(true);
      expect(await context.source.getRepository(StockMovement).count()).toBe(0);
    });

    it('sin descripción se guarda y devuelve null', async () => {
      const body = (
        await create({ sku: 'INV-101', name: 'Sin descripción' }).expect(201)
      ).body as ProductBody;
      expect(body.description).toBeNull();
      expect((await stored(body.id)).description).toBeNull();
    });

    it('un SKU duplicado devuelve 409 sin detalles de PostgreSQL y no crea nada', async () => {
      await create({ sku: 'INV-100', name: 'Primero' }).expect(201);
      const response = await create({ sku: 'INV-100', name: 'Segundo' }).expect(
        409,
      );
      const text = JSON.stringify(response.body);
      expect(text).not.toMatch(/products_sku_key|duplicate|violates|INV-100/i);
      expect(await productCount()).toBe(1);
    });

    it('SKU en minúsculas no se normaliza: 400 y no crea nada', async () => {
      await create({ sku: 'inv-100', name: 'Minúsculas' }).expect(400);
      expect(await productCount()).toBe(0);
    });

    it.each([
      ['sin cuerpo', {}],
      ['sin nombre', { sku: 'INV-1' }],
      ['sin sku', { name: 'X' }],
      ['sku de 49 caracteres', { sku: 'A'.repeat(49), name: 'X' }],
      ['sku con espacio', { sku: 'INV 1', name: 'X' }],
      ['nombre en blanco', { sku: 'INV-1', name: '   ' }],
      ['nombre de 121 caracteres', { sku: 'INV-1', name: 'x'.repeat(121) }],
      ['nombre con NUL', { sku: 'INV-1', name: 'a\u0000b' }],
      ['descripción vacía', { sku: 'INV-1', name: 'X', description: '' }],
      [
        'descripción de 501 caracteres',
        { sku: 'INV-1', name: 'X', description: 'd'.repeat(501) },
      ],
      [
        'descripción con NUL',
        { sku: 'INV-1', name: 'X', description: 'a\u0000' },
      ],
      ['campo stock', { sku: 'INV-1', name: 'X', stock: 50 }],
      ['campo active', { sku: 'INV-1', name: 'X', active: false }],
      ['campo id', { sku: 'INV-1', name: 'X', id: randomUUID() }],
    ])('rechaza con 400: %s', async (_caso, body) => {
      await create(body).expect(400);
      expect(await productCount()).toBe(0);
    });

    it('acepta SKU y nombre en el límite exacto', async () => {
      const sku = 'A'.repeat(48);
      const body = (await create({ sku, name: 'n'.repeat(120) }).expect(201))
        .body as ProductBody;
      expect(body.sku).toBe(sku);
      expect(body.name).toHaveLength(120);
    });
  });

  describe('consulta por ID (P-05)', () => {
    it('devuelve producto y saldo; inexistente 404; UUID inválido 400', async () => {
      const product = await seedProduct('INV-001', { stock: 20 });
      const body = (await detail(product.id).expect(200)).body as ProductBody;
      assertPublic(body);
      expect(body).toMatchObject({ id: product.id, sku: 'INV-001', stock: 20 });
      await detail(randomUUID()).expect(404);
      await detail('no-es-uuid').expect(400);
      await detail('12345678-1234-1234-1234-123456789012').expect(400);
    });
  });

  describe('listado (P-04)', () => {
    it('lista los productos del seed con sus saldos 20, 30 y 10', async () => {
      await runSeed(context.source, {
        adminPassword: 'Test-only-admin-password',
        operatorPassword: 'Test-only-operator-password',
      });
      const page = (await list('', operatorToken).expect(200))
        .body as ProductPage;
      expect(page.data.map((p) => [p.sku, p.stock])).toEqual([
        ['INV-001', 20],
        ['INV-002', 30],
        ['INV-003', 10],
      ]);
      page.data.forEach(assertPublic);
      expect(page).toMatchObject({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
    });

    it('catálogo vacío: data vacía y totalPages 0', async () => {
      const page = (await list().expect(200)).body as ProductPage;
      expect(page).toEqual({
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('pagina, ordena por SKU y devuelve data vacía fuera de rango', async () => {
      for (const sku of ['E-5', 'B-2', 'A-1', 'D-4', 'C-3'])
        await seedProduct(sku);
      const first = (await list('?page=1&limit=2').expect(200))
        .body as ProductPage;
      expect(first.data.map((p) => p.sku)).toEqual(['A-1', 'B-2']);
      expect(first).toMatchObject({ total: 5, totalPages: 3, limit: 2 });
      const last = (await list('?page=3&limit=2').expect(200))
        .body as ProductPage;
      expect(last.data.map((p) => p.sku)).toEqual(['E-5']);
      const outside = (await list('?page=9&limit=2').expect(200))
        .body as ProductPage;
      expect(outside.data).toEqual([]);
      expect(outside).toMatchObject({ page: 9, total: 5, totalPages: 3 });
    });

    it.each([
      '?page=0',
      '?page=01',
      '?page=10001',
      '?page=1.5',
      '?page=-1',
      '?limit=0',
      '?limit=101',
      '?limit=1e2',
      '?limit=%201',
      '?page=1&page=2',
      '?search=',
      `?search=${'a'.repeat(65)}`,
      '?search=a&search=b',
      '?search=a%00b',
      '?active=yes',
      '?active=TRUE',
      '?active=true&active=false',
      '?stock=1',
      '?sort=name',
    ])('rechaza la consulta %s con 400', async (query) => {
      await list(query).expect(400);
    });

    it('busca por SKU o nombre sin distinguir mayúsculas', async () => {
      await seedProduct('INV-001', { name: 'Teclado mecánico' });
      await seedProduct('INV-002', { name: 'Mouse' });
      await seedProduct('ZZZ-9', { name: 'Monitor' });
      const skus = async (query: string) =>
        ((await list(query).expect(200)).body as ProductPage).data.map(
          (p) => p.sku,
        );
      expect(await skus('?search=inv')).toEqual(['INV-001', 'INV-002']);
      expect(await skus('?search=TECLADO')).toEqual(['INV-001']);
      expect(await skus('?search=onit')).toEqual(['ZZZ-9']);
      expect(await skus('?search=no-existe')).toEqual([]);
    });

    it('trata %, _ y \\ como texto literal y no como comodines', async () => {
      await seedProduct('P-1', { name: 'Descuento 100% total' });
      await seedProduct('P-2', { name: 'Cable A_B largo' });
      await seedProduct('P-3', { name: 'Ruta C:\\datos' });
      await seedProduct('P-4', { name: 'Producto común' });
      const skus = async (search: string) =>
        (
          (await list(`?search=${encodeURIComponent(search)}`).expect(200))
            .body as ProductPage
        ).data.map((p) => p.sku);
      expect(await skus('%')).toEqual(['P-1']);
      expect(await skus('_')).toEqual(['P-2']);
      expect(await skus('\\')).toEqual(['P-3']);
      expect(await skus('A_B')).toEqual(['P-2']);
      expect(await skus('A%B')).toEqual([]);
      expect(await skus('100%')).toEqual(['P-1']);
    });

    it('filtra por active y combina filtros con paginación', async () => {
      await seedProduct('A-1');
      await seedProduct('A-2', { active: false });
      await seedProduct('B-1', { active: false });
      const skus = async (query: string) =>
        ((await list(query).expect(200)).body as ProductPage).data.map(
          (p) => p.sku,
        );
      expect(await skus('')).toEqual(['A-1', 'A-2', 'B-1']);
      expect(await skus('?active=true')).toEqual(['A-1']);
      expect(await skus('?active=false')).toEqual(['A-2', 'B-1']);
      expect(await skus('?active=false&search=a')).toEqual(['A-2']);
      const combined = (await list('?active=false&limit=1&page=2').expect(200))
        .body as ProductPage;
      expect(combined.data.map((p) => p.sku)).toEqual(['B-1']);
      expect(combined).toMatchObject({ total: 2, totalPages: 2 });
    });
  });

  describe('edición de catálogo (P-06)', () => {
    it('actualiza nombre y descripción sin tocar SKU, estado ni saldo', async () => {
      const product = await seedProduct('INV-001', { stock: 7 });
      const body = (
        await edit(product.id, {
          name: 'Teclado inalámbrico',
          description: 'Bluetooth',
        }).expect(200)
      ).body as ProductBody;
      assertPublic(body);
      expect(body).toMatchObject({
        sku: 'INV-001',
        name: 'Teclado inalámbrico',
        description: 'Bluetooth',
        active: true,
        stock: 7,
      });
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        product.updatedAt.getTime(),
      );
      expect((await stored(product.id)).stock).toBe(7);
    });

    it('admite cambiar solo un campo y borrar la descripción con null', async () => {
      const product = await seedProduct('INV-001', { description: 'Vieja' });
      const renamed = (
        await edit(product.id, { name: 'Solo nombre' }).expect(200)
      ).body as ProductBody;
      expect(renamed).toMatchObject({
        name: 'Solo nombre',
        description: 'Vieja',
      });
      const cleared = (
        await edit(product.id, { description: null }).expect(200)
      ).body as ProductBody;
      expect(cleared).toMatchObject({ name: 'Solo nombre', description: null });
      expect((await stored(product.id)).description).toBeNull();
    });

    it('repetir los mismos valores es idempotente y no cambia updatedAt', async () => {
      const product = await seedProduct('INV-001', { description: 'Igual' });
      const before = await stored(product.id);
      await wait(15);
      const body = (
        await edit(product.id, {
          name: before.name,
          description: 'Igual',
        }).expect(200)
      ).body as ProductBody;
      expect(body.updatedAt).toBe(before.updatedAt.toISOString());
      expect((await stored(product.id)).updatedAt).toEqual(before.updatedAt);
      await edit(product.id, { description: null }).expect(200);
      const cleared = await stored(product.id);
      await wait(15);
      await edit(product.id, { description: null }).expect(200);
      expect((await stored(product.id)).updatedAt).toEqual(cleared.updatedAt);
    });

    it.each([
      ['cuerpo vacío', {}],
      ['name null', { name: null }],
      ['name en blanco', { name: '  ' }],
      ['name largo', { name: 'x'.repeat(121) }],
      ['description vacía', { description: '' }],
      ['campo sku', { sku: 'OTRO-1' }],
      ['campo stock', { name: 'X', stock: 99 }],
      ['campo active', { name: 'X', active: false }],
      ['campo updatedAt', { name: 'X', updatedAt: '2020-01-01T00:00:00Z' }],
    ])('rechaza con 400 y no modifica: %s', async (_caso, body) => {
      const product = await seedProduct('INV-001', { stock: 4 });
      await edit(product.id, body).expect(400);
      const row = await stored(product.id);
      expect(row.name).toBe('Producto INV-001');
      expect(row.sku).toBe('INV-001');
      expect(row.stock).toBe(4);
      expect(row.updatedAt).toEqual(product.updatedAt);
    });

    it('producto inexistente 404; UUID inválido 400', async () => {
      await edit(randomUUID(), { name: 'X' }).expect(404);
      await edit('no-es-uuid', { name: 'X' }).expect(400);
    });
  });

  describe('activación y desactivación (P-06)', () => {
    it('desactiva y reactiva conservando saldo y datos de catálogo', async () => {
      const product = await seedProduct('INV-001', {
        stock: 12,
        description: 'Se conserva',
      });
      const off = (await status(product.id, { active: false }).expect(200))
        .body as ProductBody;
      assertPublic(off);
      expect(off).toMatchObject({
        active: false,
        stock: 12,
        description: 'Se conserva',
        sku: 'INV-001',
      });
      expect((await detail(product.id).expect(200)).body).toMatchObject({
        active: false,
      });
      const on = (await status(product.id, { active: true }).expect(200))
        .body as ProductBody;
      expect(on).toMatchObject({ active: true, stock: 12 });
      expect((await stored(product.id)).stock).toBe(12);
    });

    it('repetir el mismo estado es idempotente y no cambia updatedAt', async () => {
      const product = await seedProduct('INV-001');
      await status(product.id, { active: true }).expect(200);
      expect((await stored(product.id)).updatedAt).toEqual(product.updatedAt);
      await status(product.id, { active: false }).expect(200);
      const inactive = await stored(product.id);
      await wait(15);
      await status(product.id, { active: false }).expect(200);
      expect((await stored(product.id)).updatedAt).toEqual(inactive.updatedAt);
    });

    it.each([
      ['sin cuerpo', {}],
      ['string', { active: 'true' }],
      ['número', { active: 1 }],
      ['null', { active: null }],
      ['campo extra', { active: false, stock: 0 }],
    ])('rechaza con 400: %s', async (_caso, body) => {
      const product = await seedProduct('INV-001');
      await status(product.id, body).expect(400);
      expect((await stored(product.id)).active).toBe(true);
    });

    it('producto inexistente 404; UUID inválido 400', async () => {
      await status(randomUUID(), { active: false }).expect(404);
      await status('no-es-uuid', { active: false }).expect(400);
    });
  });

  describe('concurrencia y saldo (P-07)', () => {
    it('dos creaciones simultáneas con el mismo SKU: un 201 y un 409', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_unused, index) =>
          create({ sku: 'INV-777', name: `Intento ${index}` }),
        ),
      );
      const codes = results.map((result) => result.status).sort();
      expect(codes.filter((code) => code === 201)).toHaveLength(1);
      expect(codes.filter((code) => code === 409)).toHaveLength(5);
      expect(await productCount()).toBe(1);
      for (const result of results.filter((item) => item.status === 409))
        expect(JSON.stringify(result.body)).not.toMatch(/products_sku_key/);
    });

    it('ediciones concurrentes no alteran el saldo que otra transacción incrementa', async () => {
      const product = await seedProduct('INV-001', { stock: 5 });
      const edits = Array.from({ length: 12 }, (_unused, index) =>
        index % 2 === 0
          ? edit(product.id, { name: `Nombre ${index}` })
          : status(product.id, { active: index % 4 === 1 }),
      );
      const increments = Array.from({ length: 12 }, () =>
        context.source.query(
          `UPDATE ${table()} SET stock = stock + 1 WHERE id = $1`,
          [product.id],
        ),
      );
      const responses = await Promise.all(edits);
      await Promise.all(increments);
      for (const response of responses) expect(response.status).toBe(200);
      expect((await stored(product.id)).stock).toBe(17);
    });

    it('una edición espera el bloqueo de la fila y conserva el saldo confirmado entretanto', async () => {
      const product = await seedProduct('INV-001', { stock: 10 });
      const holder = context.source.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      let pending: Promise<number> | undefined;
      try {
        await holder.query(
          `SELECT id FROM ${table()} WHERE id = $1 FOR UPDATE`,
          [product.id],
        );
        pending = edit(product.id, { name: 'Tras el bloqueo' }).then(
          (response) => response.status,
        );
        let waiting = 0;
        for (let attempt = 0; attempt < 50 && waiting === 0; attempt++) {
          await wait(50);
          const rows = await context.source.query<{ total: string }[]>(
            `SELECT count(*) AS total FROM pg_stat_activity
             WHERE wait_event_type = 'Lock' AND query ILIKE '%FOR UPDATE%'
               AND pid <> pg_backend_pid()`,
          );
          waiting = Number(rows[0].total);
        }
        expect(waiting).toBeGreaterThan(0);
        await holder.query(`UPDATE ${table()} SET stock = 99 WHERE id = $1`, [
          product.id,
        ]);
        await holder.commitTransaction();
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
      expect(await pending).toBe(200);
      const row = await stored(product.id);
      expect(row.name).toBe('Tras el bloqueo');
      expect(row.stock).toBe(99);
    });
  });

  describe('persistencia', () => {
    it('los productos creados sobreviven a reiniciar la aplicación', async () => {
      const created = (
        await create({ sku: 'INV-500', name: 'Persistente' }).expect(201)
      ).body as ProductBody;
      await status(created.id, { active: false }).expect(200);
      await app.close();
      // Cerrar la aplicación cierra la conexión; al reabrirla, los datos siguen ahí.
      if (!context.source.isInitialized) await context.source.initialize();
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource)
        .useValue(context.source)
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApplication(app);
      await app.listen(0, '127.0.0.1');
      server = app.getHttpServer() as Server;
      const admin = await context.source
        .getRepository(User)
        .findOneByOrFail({ username: 'admin' });
      adminToken = await access(admin);
      const body = (await detail(created.id).expect(200)).body as ProductBody;
      expect(body).toMatchObject({
        sku: 'INV-500',
        name: 'Persistente',
        active: false,
        stock: 0,
      });
    });
  });

  it('los errores de validación no exponen estructura interna de la base de datos', async () => {
    const response = await create({ sku: 'x', name: 'y' }).expect(400);
    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(400);
    expect(JSON.stringify(body)).not.toMatch(
      /products_|relation|column|pg_|postgres/i,
    );
  });
});
