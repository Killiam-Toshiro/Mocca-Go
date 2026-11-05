import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request from 'supertest';
import { createApplication } from '../src/bootstrap';

interface Schema {
  type?: string;
  format?: string;
  pattern?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  $ref?: string;
}

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string; schema: Schema }[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
}

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, Schema>;
    securitySchemes: Record<string, Record<string, string>>;
  };
}

const PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/customers',
  'GET /api/v1/menu',
  'GET /api/v1/delivery-zones',
];
const ADMIN_ONLY = [
  'POST /api/v1/users',
  'GET /api/v1/users',
  'GET /api/v1/users/{id}',
  'PATCH /api/v1/users/{id}',
  'DELETE /api/v1/users/{id}',
  'PATCH /api/v1/users/{id}/role',
  'POST /api/v1/products',
  'PATCH /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}/status',
  'PUT /api/v1/products/{id}/components',
  'DELETE /api/v1/products/{id}',
  'GET /api/v1/delivery-zones/all',
  'POST /api/v1/delivery-zones',
  'PATCH /api/v1/delivery-zones/{id}',
  'DELETE /api/v1/delivery-zones/{id}',
  'POST /api/v1/delivery-points',
  'PATCH /api/v1/delivery-points/{id}',
  'DELETE /api/v1/delivery-points/{id}',
];
// Admin y operador (la cocina): datos internos del catálogo y «agotado».
const STAFF_ONLY = [
  'GET /api/v1/products',
  'GET /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}/sold-out',
];
const ANY_ROLE = [
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/logout',
  'POST /api/v1/movements',
  'GET /api/v1/movements',
];
const CLIENT_ONLY = ['GET /api/v1/customers/me', 'PATCH /api/v1/customers/me'];
// Pedidos: crea solo el cliente; leen y cancelan cliente, admin y operador.
const ORDERS = [
  'POST /api/v1/orders',
  'GET /api/v1/orders',
  'GET /api/v1/orders/{id}',
  'POST /api/v1/orders/{id}/cancel',
];
const OWN_PASSWORD = ['PATCH /api/v1/auth/password'];
const PROTECTED = [
  ...ADMIN_ONLY,
  ...STAFF_ONLY,
  ...ANY_ROLE,
  ...CLIENT_ONLY,
  ...ORDERS,
  ...OWN_PASSWORD,
];

const SUCCESS: Record<string, string> = {
  'GET /api/v1/health': '200',
  'GET /api/v1/health/ready': '200',
  'POST /api/v1/auth/login': '200',
  'POST /api/v1/customers': '201',
  'GET /api/v1/customers/me': '200',
  'PATCH /api/v1/customers/me': '200',
  'PATCH /api/v1/auth/password': '204',
  'GET /api/v1/auth/me': '200',
  'POST /api/v1/auth/logout': '204',
  'POST /api/v1/users': '201',
  'GET /api/v1/users': '200',
  'GET /api/v1/users/{id}': '200',
  'PATCH /api/v1/users/{id}': '200',
  'DELETE /api/v1/users/{id}': '204',
  'PATCH /api/v1/users/{id}/role': '200',
  'POST /api/v1/products': '201',
  'GET /api/v1/products': '200',
  'GET /api/v1/products/{id}': '200',
  'PATCH /api/v1/products/{id}': '200',
  'PATCH /api/v1/products/{id}/status': '200',
  'PATCH /api/v1/products/{id}/sold-out': '200',
  'PUT /api/v1/products/{id}/components': '200',
  'GET /api/v1/menu': '200',
  'GET /api/v1/delivery-zones': '200',
  'POST /api/v1/orders': '201',
  'GET /api/v1/orders': '200',
  'GET /api/v1/orders/{id}': '200',
  'POST /api/v1/orders/{id}/cancel': '200',
  'GET /api/v1/delivery-zones/all': '200',
  'POST /api/v1/delivery-zones': '201',
  'PATCH /api/v1/delivery-zones/{id}': '200',
  'DELETE /api/v1/delivery-zones/{id}': '204',
  'POST /api/v1/delivery-points': '201',
  'PATCH /api/v1/delivery-points/{id}': '200',
  'DELETE /api/v1/delivery-points/{id}': '204',
  'DELETE /api/v1/products/{id}': '204',
  'POST /api/v1/movements': '201',
  'GET /api/v1/movements': '200',
};

const SENSITIVE =
  /password(?!$)|passwordHash|hash|seedKey|session|secret|totp/i;

describe('Documentación OpenAPI (Swagger)', () => {
  let app: INestApplication;
  let server: Server;
  let doc: OpenApiDocument;

  const operation = (key: string): Operation => {
    const [method, path] = key.split(' ');
    return doc.paths[path][method.toLowerCase()];
  };
  const schema = (name: string): Schema => doc.components.schemas[name];
  const refName = (ref: Schema): string => ref.$ref!.split('/').pop()!;

  beforeAll(async () => {
    app = await createApplication({ logger: false });
    await app.init();
    server = app.getHttpServer() as Server;
    const response = await request(server)
      .get('/api/v1/docs-json')
      .expect('Content-Type', /json/)
      .expect(200);
    doc = response.body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it('S-01: sirve Swagger UI y el documento OpenAPI 3 sin autenticación', async () => {
    const ui = await request(server)
      .get('/api/v1/docs')
      .expect('Content-Type', /html/)
      .expect(200);
    expect(ui.text).toContain('swagger-ui');
    expect(ui.text).not.toMatch(/https?:\/\/(?:cdn|unpkg)/);

    expect(doc.info.description).toContain('El token dura 15 minutos');
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info).toMatchObject({
      title: 'API de Mocca Go',
      version: '1.0',
    });
  });

  it('S-02: documenta exactamente las 38 operaciones con el prefijo /api/v1', () => {
    const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual([...PUBLIC, ...PROTECTED].sort());
    expect(operations).toHaveLength(38);
  });

  it('cada operación tiene etiqueta del módulo, resumen y respuesta de éxito', () => {
    for (const [key, status] of Object.entries(SUCCESS)) {
      const op = operation(key);
      const module = key.split('/')[3];
      expect(op.tags).toEqual([module]);
      expect(op.summary).toEqual(expect.any(String));
      expect(op.responses[status]).toBeDefined();
    }
  });

  it('S-03: esquema bearer JWT solo en las rutas protegidas', () => {
    expect(doc.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    for (const key of PROTECTED) {
      expect(operation(key).security).toEqual([{ bearer: [] }]);
      expect(operation(key).responses['401']).toBeDefined();
    }
    for (const key of PUBLIC) expect(operation(key).security).toBeUndefined();
  });

  it('S-03: las rutas por rol documentan 403 y las de cualquier rol no', () => {
    for (const key of [
      ...ADMIN_ONLY,
      ...STAFF_ONLY,
      ...CLIENT_ONLY,
      ...ORDERS,
      ...OWN_PASSWORD,
    ])
      expect(operation(key).responses['403']).toBeDefined();
    for (const key of ANY_ROLE)
      expect(operation(key).responses['403']).toBeUndefined();
  });

  it('documenta los conflictos, inexistentes y el límite de peticiones', () => {
    for (const key of [
      'POST /api/v1/users',
      'PATCH /api/v1/users/{id}',
      'DELETE /api/v1/users/{id}',
      'PATCH /api/v1/users/{id}/role',
      'POST /api/v1/products',
      'PUT /api/v1/products/{id}/components',
      'DELETE /api/v1/products/{id}',
      'POST /api/v1/movements',
    ])
      expect(operation(key).responses['409']).toBeDefined();
    for (const key of [
      'GET /api/v1/users/{id}',
      'PATCH /api/v1/users/{id}',
      'DELETE /api/v1/users/{id}',
      'DELETE /api/v1/products/{id}',
      'PATCH /api/v1/users/{id}/role',
      'GET /api/v1/products/{id}',
      'PATCH /api/v1/products/{id}',
      'PATCH /api/v1/products/{id}/status',
      'PATCH /api/v1/products/{id}/sold-out',
      'PUT /api/v1/products/{id}/components',
      'POST /api/v1/movements',
    ])
      expect(operation(key).responses['404']).toBeDefined();
    for (const key of [
      'POST /api/v1/auth/login',
      'GET /api/v1/auth/me',
      'POST /api/v1/auth/logout',
      'PATCH /api/v1/auth/password',
      'POST /api/v1/customers',
      'GET /api/v1/menu',
    ])
      expect(operation(key).responses['429']).toBeDefined();
    expect(operation('POST /api/v1/customers').responses['409']).toBeDefined();
    expect(operation('POST /api/v1/orders').responses['402']).toBeDefined();
    expect(operation('POST /api/v1/orders').responses['429']).toBeDefined();
    const headers = (operation('POST /api/v1/orders').parameters ?? []).filter(
      (parameter) => parameter.in === 'header',
    );
    expect(headers.map((parameter) => parameter.name)).toEqual([
      'Idempotency-Key',
    ]);
    for (const key of CLIENT_ONLY)
      expect(operation(key).responses['404']).toBeDefined();

    expect(
      operation('GET /api/v1/health/ready').responses['503'],
    ).toBeDefined();
    expect(operation('GET /api/v1/health').responses['503']).toBeUndefined();
    for (const key of [
      'DELETE /api/v1/users/{id}',
      'DELETE /api/v1/products/{id}',
    ])
      expect(operation(key).responses['204'].content).toBeUndefined();

    const error = operation('POST /api/v1/products').responses['409'].content![
      'application/json'
    ].schema;
    expect(refName(error)).toBe('ErrorResponse');
    expect(schema('ErrorResponse').required).toEqual(
      expect.arrayContaining(['statusCode', 'message']),
    );
  });

  it('S-04: DTOs de entrada con obligatorios, patrones, longitudes y enumeraciones', () => {
    expect(schema('LoginDto')).toMatchObject({
      required: ['password'],
      properties: {
        username: { pattern: '^[a-z0-9][a-z0-9._-]{2,63}$' },
        email: { format: 'email', maxLength: 254 },
        password: { minLength: 12, maxLength: 128 },
      },
    });
    expect(schema('RegisterCustomerDto')).toMatchObject({
      required: ['email', 'password', 'fullName', 'phone'],
      properties: {
        email: { format: 'email', maxLength: 254 },
        password: { minLength: 12, maxLength: 128 },
        fullName: { minLength: 2, maxLength: 100 },
      },
    });
    expect(schema('ChangePasswordDto')).toMatchObject({
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { minLength: 12, maxLength: 128 },
        newPassword: { minLength: 12, maxLength: 128 },
      },
    });
    expect(schema('CreateUserDto').properties!.role.enum).toEqual([
      'admin',
      'operador',
      'repartidor',
    ]);
    expect(schema('ChangeRoleDto').properties!.role.enum).toEqual([
      'admin',
      'operador',
      'repartidor',
    ]);
    expect(schema('UserResponse').properties!.role.enum).toEqual([
      'admin',
      'operador',
      'repartidor',
      'cliente',
    ]);
    expect(schema('IdentityResponse').properties!.role.enum).toEqual([
      'admin',
      'operador',
      'repartidor',
      'cliente',
    ]);
    expect(schema('CreateProductDto')).toMatchObject({
      required: ['sku', 'name', 'category'],
      properties: {
        sku: { pattern: '^[A-Z0-9][A-Z0-9._-]{0,47}$', maxLength: 48 },
        name: { minLength: 1, maxLength: 120 },
        description: { nullable: true, maxLength: 500 },
        category: {
          enum: ['combo', 'cafe', 'bebida', 'panaderia', 'pasteleria', 'snack'],
        },
        price: { type: 'integer', minimum: 1, maximum: 1000000 },
        cost: { type: 'integer', minimum: 0, maximum: 1000000 },
      },
    });
    expect(schema('SetSoldOutDto')).toMatchObject({
      required: ['soldOut'],
      properties: { soldOut: { type: 'boolean' } },
    });
    expect(schema('ReplaceComponentsDto').required).toEqual(['components']);
    expect(schema('ComponentInputDto')).toMatchObject({
      required: ['productId', 'quantity'],
      properties: {
        productId: { format: 'uuid' },
        quantity: { type: 'integer', minimum: 1, maximum: 10 },
      },
    });
    expect(schema('UpdateProductDto').required).toBeUndefined();
    expect(schema('UpdateUserDto')).toMatchObject({
      properties: {
        username: { pattern: '^[a-z0-9][a-z0-9._-]{2,63}$', maxLength: 64 },
        password: { minLength: 12, maxLength: 128 },
      },
    });
    expect(schema('UpdateUserDto').required).toBeUndefined();
    expect(Object.keys(schema('UpdateUserDto').properties!).sort()).toEqual([
      'password',
      'username',
    ]);
    expect(schema('SetProductStatusDto')).toMatchObject({
      required: ['active'],
      properties: { active: { type: 'boolean' } },
    });
    expect(schema('CreateMovementDto')).toMatchObject({
      required: ['productId', 'type', 'quantity', 'reason'],
      properties: {
        productId: { format: 'uuid' },
        type: { enum: ['IN', 'OUT'] },
        quantity: { type: 'integer', minimum: 1, maximum: 2147483647 },
        reason: { minLength: 1, maxLength: 300 },
      },
    });
  });

  it('documenta paginación, filtros y el UUID de la ruta como parámetros', () => {
    const params = (key: string) =>
      Object.fromEntries(
        operation(key).parameters!.map((p) => [`${p.in}:${p.name}`, p.schema]),
      );
    expect(params('GET /api/v1/products')).toMatchObject({
      'query:page': { type: 'integer', minimum: 1, maximum: 10000 },
      'query:limit': { type: 'integer', minimum: 1, maximum: 100 },
      'query:search': { maxLength: 64 },
      'query:active': { enum: ['true', 'false'] },
      'query:category': {
        enum: ['combo', 'cafe', 'bebida', 'panaderia', 'pasteleria', 'snack'],
      },
    });
    expect(params('GET /api/v1/movements')).toMatchObject({
      'query:productId': { format: 'uuid' },
      'query:type': { enum: ['IN', 'OUT'] },
    });
    expect(Object.keys(params('GET /api/v1/users')).sort()).toEqual([
      'query:limit',
      'query:page',
    ]);
    for (const key of [
      'PATCH /api/v1/products/{id}/status',
      'PATCH /api/v1/products/{id}/sold-out',
      'PUT /api/v1/products/{id}/components',
      'DELETE /api/v1/products/{id}',
      'GET /api/v1/users/{id}',
      'PATCH /api/v1/users/{id}',
      'DELETE /api/v1/users/{id}',
      'PATCH /api/v1/users/{id}/role',
    ])
      expect(params(key)['path:id']).toMatchObject({ format: 'uuid' });
  });

  it('S-04: respuestas coinciden con las proyecciones y no exponen secretos', () => {
    const fields = (name: string) =>
      Object.keys(schema(name).properties!).sort();
    expect(fields('ProductResponse')).toEqual([
      'active',
      'available',
      'category',
      'components',
      'cost',
      'costPercent',
      'createdAt',
      'description',
      'id',
      'name',
      'price',
      'sku',
      'soldOut',
      'stock',
      'updatedAt',
    ]);
    expect(fields('MenuItemResponse')).toEqual([
      'available',
      'category',
      'components',
      'description',
      'id',
      'name',
      'price',
      'sku',
    ]);
    expect(fields('UserResponse')).toEqual([
      'createdAt',
      'email',
      'fullName',
      'id',
      'phone',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(fields('MovementResponse')).toEqual([
      'createdAt',
      'id',
      'orderId',
      'productId',
      'quantity',
      'reason',
      'type',
      'user',
    ]);
    expect(fields('CreatedMovementResponse')).toEqual(['movement', 'stock']);
    expect(fields('LoginResponse')).toEqual([
      'accessToken',
      'expiresIn',
      'tokenType',
    ]);
    expect(fields('IdentityResponse')).toEqual(['id', 'role', 'username']);
    for (const page of [
      'ProductPageResponse',
      'UserPageResponse',
      'MovementPageResponse',
    ])
      expect(fields(page)).toEqual([
        'data',
        'limit',
        'page',
        'total',
        'totalPages',
      ]);

    const created = operation('POST /api/v1/movements').responses['201']
      .content!['application/json'].schema;
    expect(refName(created)).toBe('CreatedMovementResponse');

    for (const [name, value] of Object.entries(doc.components.schemas)) {
      if (name.endsWith('Dto')) continue;
      for (const field of Object.keys(value.properties ?? {}))
        expect(`${name}.${field}`).not.toMatch(SENSITIVE);
    }
  });

  it('S-05: documentar no cambia la validación: los campos extra siguen dando 400', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'x'.repeat(12), role: 'admin' })
      .expect(400);
  });

  it('las rutas protegidas siguen exigiendo JWT aunque estén documentadas', async () => {
    await request(server).get('/api/v1/products').expect(401);
  });
});
