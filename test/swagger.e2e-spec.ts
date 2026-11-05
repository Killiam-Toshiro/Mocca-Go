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
  info: { title: string; version: string };
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
  'DELETE /api/v1/products/{id}',
];
const ANY_ROLE = [
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/logout',
  'GET /api/v1/products',
  'GET /api/v1/products/{id}',
  'POST /api/v1/movements',
  'GET /api/v1/movements',
];
const PROTECTED = [...ADMIN_ONLY, ...ANY_ROLE];

const SUCCESS: Record<string, string> = {
  'GET /api/v1/health': '200',
  'GET /api/v1/health/ready': '200',
  'POST /api/v1/auth/login': '200',
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

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info).toMatchObject({
      title: 'API de inventario',
      version: '1.0',
    });
  });

  it('S-02: documenta exactamente las 19 operaciones con el prefijo /api/v1', () => {
    const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual([...PUBLIC, ...PROTECTED].sort());
    expect(operations).toHaveLength(19);
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

  it('S-03: las rutas solo admin documentan 403 y las de cualquier rol no', () => {
    for (const key of ADMIN_ONLY)
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
      'POST /api/v1/movements',
    ])
      expect(operation(key).responses['404']).toBeDefined();
    for (const key of [
      'POST /api/v1/auth/login',
      'GET /api/v1/auth/me',
      'POST /api/v1/auth/logout',
    ])
      expect(operation(key).responses['429']).toBeDefined();

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
      required: ['username', 'password'],
      properties: {
        username: { pattern: '^[a-z0-9][a-z0-9._-]{2,63}$' },
        password: { minLength: 12, maxLength: 128 },
      },
    });
    expect(schema('CreateUserDto').properties!.role.enum).toEqual([
      'admin',
      'operador',
    ]);
    expect(schema('CreateProductDto')).toMatchObject({
      required: ['sku', 'name'],
      properties: {
        sku: { pattern: '^[A-Z0-9][A-Z0-9._-]{0,47}$', maxLength: 48 },
        name: { minLength: 1, maxLength: 120 },
        description: { nullable: true, maxLength: 500 },
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
      'createdAt',
      'description',
      'id',
      'name',
      'sku',
      'stock',
      'updatedAt',
    ]);
    expect(fields('UserResponse')).toEqual([
      'createdAt',
      'id',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(fields('MovementResponse')).toEqual([
      'createdAt',
      'id',
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
