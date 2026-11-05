import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { buildPage, pageParams } from '../../src/common/pagination';
import { Product } from '../../src/products/entities/products.entity';
import { productView } from '../../src/products/products.view';
import {
  CreateProductDto,
  ListProductsDto,
  ReplaceComponentsDto,
  SetProductStatusDto,
  SetSoldOutDto,
  UpdateProductDto,
} from '../../src/products/DTOs/products.dto';
import {
  escapeLike,
  isDuplicateSku,
  ProductsService,
} from '../../src/products/services/products.services';

const options = { whitelist: true, forbidNonWhitelisted: true };
const errorsFor = <T extends object>(
  type: new () => T,
  value: object,
): number => validateSync(plainToInstance(type, value), options).length;

function queryFailure(driverError: object): QueryFailedError {
  return new QueryFailedError('INSERT', [], driverError as Error);
}

describe('Contratos y proyección de productos', () => {
  it('la proyección expone solo los quince campos públicos', () => {
    const product = Object.assign(new Product(), {
      id: randomUUID(),
      sku: 'INV-009',
      name: 'Cable',
      description: null,
      category: 'snack',
      price: 2000,
      cost: 500,
      soldOut: false,
      active: true,
      stock: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      internal: 'no-debe-salir',
    });
    const view = productView(product);
    expect(Object.keys(view).sort()).toEqual([
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
    expect(JSON.stringify(view)).not.toContain('no-debe-salir');
  });

  describe('CreateProductDto', () => {
    const priced = { category: 'snack', price: 2000, cost: 500 };
    it.each([
      { sku: 'A', name: 'Uno' },
      { sku: 'INV-001', name: 'Teclado', description: 'Mecánico' },
      { sku: 'A'.repeat(48), name: 'x'.repeat(120) },
      { sku: '0.a_b-c'.toUpperCase(), name: ' Con espacios ' },
      { sku: 'INV-010', name: 'Con descripción nula', description: null },
      {
        sku: 'INV-011',
        name: 'Descripción larga',
        description: 'd'.repeat(500),
      },
    ])('acepta %j', (body) => {
      expect(errorsFor(CreateProductDto, { ...priced, ...body })).toBe(0);
    });

    it.each([
      { category: 'cafe', price: 1, cost: 0 },
      { category: 'combo', price: 1_000_000, components: [] },
      {
        category: 'combo',
        price: 8500,
        components: [{ productId: randomUUID(), quantity: 10 }],
      },
    ])('acepta el precio y la composición %j', (extra) => {
      expect(
        errorsFor(CreateProductDto, { sku: 'A', name: 'B', ...extra }),
      ).toBe(0);
    });

    it.each([
      { category: undefined },
      { category: 'postre' },
      { category: 'COMBO' },
      { price: undefined },
      { price: 0 },
      { price: -1 },
      { price: 1.5 },
      { price: '1000' },
      { price: 1_000_001 },
      { cost: -1 },
      { cost: 0.5 },
      { cost: 1_000_001 },
      { cost: null },
      { components: null },
      { components: 'x' },
      { components: [{ productId: 'no-uuid', quantity: 1 }] },
      { components: [{ productId: randomUUID(), quantity: 0 }] },
      { components: [{ productId: randomUUID(), quantity: 11 }] },
      { components: [{ productId: randomUUID(), quantity: 1.5 }] },
      { components: [{ productId: randomUUID(), quantity: 1, extra: 1 }] },
      {
        components: Array.from({ length: 51 }, () => ({
          productId: randomUUID(),
          quantity: 1,
        })),
      },
      { soldOut: true },
    ])('rechaza el campo de catálogo %j', (override) => {
      const body = { sku: 'A', name: 'B', ...priced, ...override };
      expect(errorsFor(CreateProductDto, body)).toBeGreaterThan(0);
    });

    it.each([
      {},
      { name: 'Sin sku' },
      { sku: 'INV-001' },
      { sku: 'inv-001', name: 'Minúsculas' },
      { sku: 'A'.repeat(49), name: 'Sku largo' },
      { sku: '', name: 'Sku vacío' },
      { sku: '-INV', name: 'Empieza con guion' },
      { sku: 'INV 001', name: 'Con espacio' },
      { sku: 'INV/001', name: 'Con barra' },
      { sku: 7, name: 'Número' },
      { sku: 'INV-001', name: '' },
      { sku: 'INV-001', name: '   ' },
      { sku: 'INV-001', name: 'x'.repeat(121) },
      { sku: 'INV-001', name: 'Con\u0000nul' },
      { sku: 'INV-001', name: 5 },
      { sku: 'INV-001', name: 'Ok', description: '' },
      { sku: 'INV-001', name: 'Ok', description: 'd'.repeat(501) },
      { sku: 'INV-001', name: 'Ok', description: 'a\u0000b' },
      { sku: 'INV-001', name: 'Ok', description: 12 },
      { sku: 'INV-001', name: 'Ok', stock: 5 },
      { sku: 'INV-001', name: 'Ok', active: false },
      { sku: 'INV-001', name: 'Ok', id: randomUUID() },
      { sku: ['INV-001'], name: 'Arreglo' },
    ])('rechaza %j', (body) => {
      expect(errorsFor(CreateProductDto, body)).toBeGreaterThan(0);
    });
  });

  describe('UpdateProductDto', () => {
    it.each([
      {},
      { name: 'Nuevo' },
      { description: 'Nueva' },
      { description: null },
      { name: 'Nuevo', description: null },
      { category: 'bebida' },
      { price: 1 },
      { cost: 0 },
      { category: 'cafe', price: 5000, cost: 1900 },
    ])('acepta %j', (body) => {
      expect(errorsFor(UpdateProductDto, body)).toBe(0);
    });

    it.each([
      { name: null },
      { name: '' },
      { name: '  ' },
      { name: 'x'.repeat(121) },
      { name: 3 },
      { description: '' },
      { description: 'd'.repeat(501) },
      { description: false },
      { sku: 'OTRO-1' },
      { stock: 10 },
      { active: false },
      { createdAt: '2026-01-01T00:00:00.000Z' },
      { category: null },
      { category: 'postre' },
      { price: 0 },
      { price: null },
      { price: 1.5 },
      { price: 1_000_001 },
      { cost: null },
      { cost: -1 },
      { soldOut: true },
      { components: [] },
    ])('rechaza %j', (body) => {
      expect(errorsFor(UpdateProductDto, body)).toBeGreaterThan(0);
    });
  });

  describe('SetProductStatusDto', () => {
    it.each([{ active: true }, { active: false }])('acepta %j', (body) => {
      expect(errorsFor(SetProductStatusDto, body)).toBe(0);
    });

    it.each([
      {},
      { active: 'true' },
      { active: 1 },
      { active: null },
      { active: true, stock: 1 },
    ])('rechaza %j', (body) => {
      expect(errorsFor(SetProductStatusDto, body)).toBeGreaterThan(0);
    });
  });

  describe('ListProductsDto', () => {
    it.each([
      {},
      { page: '1', limit: '20' },
      { page: '10000', limit: '100' },
      { search: 'tec' },
      { search: 'a'.repeat(64) },
      { search: '100%_\\' },
      { active: 'true' },
      { active: 'false', search: 'x', page: '2', limit: '5' },
      { category: 'combo' },
      { category: 'pasteleria', active: 'true', search: 'cup' },
    ])('acepta %j', (query) => {
      expect(errorsFor(ListProductsDto, query)).toBe(0);
    });

    it.each([
      { page: '0' },
      { page: '01' },
      { page: '10001' },
      { page: ['1', '2'] },
      { limit: '101' },
      { limit: '1e2' },
      { limit: ' 1' },
      { search: '' },
      { search: 'a'.repeat(65) },
      { search: ['a', 'b'] },
      { search: 'a\u0000b' },
      { active: 'yes' },
      { active: 'TRUE' },
      { active: true },
      { stock: '1' },
      { category: 'postre' },
      { category: '' },
      { category: ['cafe', 'snack'] },
    ])('rechaza %j', (query) => {
      expect(errorsFor(ListProductsDto, query)).toBeGreaterThan(0);
    });
  });
});

describe('SetSoldOutDto y ReplaceComponentsDto', () => {
  const component = { productId: randomUUID(), quantity: 2 };

  it.each([{ soldOut: true }, { soldOut: false }])('acepta %j', (body) => {
    expect(errorsFor(SetSoldOutDto, body)).toBe(0);
  });

  it.each([
    {},
    { soldOut: 'true' },
    { soldOut: 1 },
    { soldOut: null },
    { soldOut: true, active: true },
  ])('rechaza %j', (body) => {
    expect(errorsFor(SetSoldOutDto, body)).toBeGreaterThan(0);
  });

  it('la composición exige un arreglo de componentes válidos', () => {
    expect(
      errorsFor(ReplaceComponentsDto, { components: [component, component] }),
    ).toBe(0);
    for (const body of [
      {},
      { components: null },
      { components: {} },
      { components: [{ productId: 'x', quantity: 1 }] },
      { components: [component], extra: true },
    ])
      expect(errorsFor(ReplaceComponentsDto, body)).toBeGreaterThan(0);
  });
});

describe('Paginación compartida', () => {
  it('usa 1 y 20 por defecto y calcula totalPages', () => {
    expect(pageParams({})).toEqual({ page: 1, limit: 20 });
    expect(pageParams({ page: '3', limit: '5' })).toEqual({
      page: 3,
      limit: 5,
    });
    expect(buildPage(['a'], { page: 1, limit: 2 }, 5)).toEqual({
      data: ['a'],
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(buildPage([], { page: 1, limit: 20 }, 0).totalPages).toBe(0);
  });
});

describe('Búsqueda y errores del servicio de productos', () => {
  it('escapeLike trata los comodines como texto literal', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('A_B')).toBe('A\\_B');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('tec')).toBe('tec');
  });

  it('solo la violación de products_sku_key cuenta como SKU duplicado', () => {
    expect(
      isDuplicateSku(
        queryFailure({ code: '23505', constraint: 'products_sku_key' }),
      ),
    ).toBe(true);
    expect(
      isDuplicateSku(queryFailure({ code: '23505', constraint: 'otra' })),
    ).toBe(false);
    expect(isDuplicateSku(queryFailure({ code: '23514' }))).toBe(false);
    expect(isDuplicateSku(queryFailure('texto' as unknown as object))).toBe(
      false,
    );
    expect(isDuplicateSku(new Error('products_sku_key'))).toBe(false);
  });

  function serviceFailing(error: Error): ProductsService {
    const repository = {
      create: (value: object) => value,
      save: () => Promise.reject(error),
    };
    const manager = { getRepository: () => repository };
    return new ProductsService({
      getRepository: () => repository,
      transaction: (work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
    } as unknown as DataSource);
  }

  const input = {
    sku: 'A',
    name: 'B',
    category: 'cafe',
    price: 1000,
    cost: 500,
  } as const;

  it('create convierte el SKU duplicado en 409 sin detalles de SQL', async () => {
    const failure = queryFailure({
      code: '23505',
      constraint: 'products_sku_key',
      detail: 'Key (sku)=(INV-001) already exists.',
    });
    const result = serviceFailing(failure).create({ ...input });
    await expect(result).rejects.toMatchObject({ status: 409 });
    await expect(result).rejects.not.toThrow(/products_sku_key|INV-001/);
  });

  it('create no enmascara otros errores de la base de datos', async () => {
    const failure = queryFailure({ code: '23514' });
    await expect(serviceFailing(failure).create({ ...input })).rejects.toBe(
      failure,
    );
    const other = new Error('conexión perdida');
    await expect(serviceFailing(other).create({ ...input })).rejects.toBe(
      other,
    );
  });

  it('update sin campos se rechaza antes de abrir una transacción', () => {
    const service = new ProductsService({} as unknown as DataSource);
    expect(() => service.update(randomUUID(), {})).toThrow(/al menos un campo/);
  });
});
