import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { UserRole } from '../../src/users/entities/user.entity';
import { CatalogHarness, ErrorBody, ProductBody } from '../helpers/catalog-app';

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Interruptor «agotado»: HTTP con PostgreSQL real', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  const soldOut = (id: string, body: object, role: UserRole = 'admin') =>
    harness.send('patch', `/products/${id}/sold-out`, body, role);

  it('CA-11: admin y operador marcan y desmarcan; la respuesta trae el available resultante', async () => {
    const product = await harness.simple('CAF-AMER', { stock: 4 });
    for (const role of ['operador', 'admin'] as const) {
      const off = (
        await soldOut(product.id, { soldOut: true }, role).expect(200)
      ).body as ProductBody;
      expect(off).toMatchObject({ soldOut: true, available: false, stock: 4 });
      const on = (
        await soldOut(product.id, { soldOut: false }, role).expect(200)
      ).body as ProductBody;
      expect(on).toMatchObject({ soldOut: false, available: true, stock: 4 });
    }
  });

  it('CA-11: es idempotente y no cambia updatedAt al repetir el valor', async () => {
    const product = await harness.simple('CAF-AMER');
    await soldOut(product.id, { soldOut: true }).expect(200);
    const first = await harness.stored(product.id);
    await wait(15);
    await soldOut(product.id, { soldOut: true }).expect(200);
    expect((await harness.stored(product.id)).updatedAt).toEqual(
      first.updatedAt,
    );
  });

  it('CA-11: repartidor y cliente reciben 403 y sin sesión 401, sin cambios', async () => {
    const product = await harness.simple('CAF-AMER');
    for (const role of ['repartidor', 'cliente'] as const)
      await soldOut(product.id, { soldOut: true }, role).expect(403);
    await soldOut(randomUUID(), { soldOut: true }, 'cliente').expect(403);
    await request(harness.server)
      .patch(`/api/v1/products/${product.id}/sold-out`)
      .send({ soldOut: true })
      .expect(401);
    expect((await harness.stored(product.id)).soldOut).toBe(false);
  });

  it.each([
    ['sin cuerpo', {}],
    ['texto', { soldOut: 'true' }],
    ['número', { soldOut: 1 }],
    ['null', { soldOut: null }],
    ['campo extra', { soldOut: true, active: false }],
  ])('rechaza con 400: %s', async (_caso, body) => {
    const product = await harness.simple('CAF-AMER');
    await soldOut(product.id, body).expect(400);
    expect((await harness.stored(product.id)).soldOut).toBe(false);
  });

  it('inexistente 404 y UUID inválido 400', async () => {
    const response = await soldOut(randomUUID(), { soldOut: true }).expect(404);
    expect((response.body as ErrorBody).message).toBe(
      'Producto no encontrado.',
    );
    await soldOut('no-es-uuid', { soldOut: true }).expect(400);
  });

  it('no toca el saldo, el estado activo ni el precio', async () => {
    const product = await harness.simple('CAF-AMER', { stock: 9 });
    await soldOut(product.id, { soldOut: true }).expect(200);
    expect(await harness.stored(product.id)).toMatchObject({
      stock: 9,
      active: true,
      price: 4000,
      cost: 1000,
    });
  });

  it('CA-12: marcar un componente agotado deja sus combos no disponibles y se revierte', async () => {
    const a = await harness.simple('CAF-CAPU');
    const b = await harness.simple('PAN-PAND', { category: 'panaderia' });
    const combo = (
      await harness
        .send('post', '/products', {
          sku: 'CMB-1',
          name: 'Combo',
          category: 'combo',
          price: 6500,
          components: [
            { productId: a.id, quantity: 1 },
            { productId: b.id, quantity: 1 },
          ],
        })
        .expect(201)
    ).body as ProductBody;
    const available = async () =>
      (
        (await harness.get(`/products/${combo.id}`, 'operador').expect(200))
          .body as ProductBody
      ).available;
    expect(await available()).toBe(true);
    await soldOut(a.id, { soldOut: true }, 'operador').expect(200);
    expect(await available()).toBe(false);
    await soldOut(a.id, { soldOut: false }, 'operador').expect(200);
    expect(await available()).toBe(true);
    // El interruptor del propio combo también aplica.
    const hidden = (await soldOut(combo.id, { soldOut: true }).expect(200))
      .body as ProductBody;
    expect(hidden).toMatchObject({ soldOut: true, available: false });
  });
});
