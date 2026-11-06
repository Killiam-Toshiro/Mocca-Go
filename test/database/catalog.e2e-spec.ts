import { randomUUID } from 'node:crypto';
import { Product } from '../../src/products/entities/products.entity';
import { CatalogHarness, ErrorBody, ProductBody } from '../helpers/catalog-app';

interface ProductPage {
  data: ProductBody[];
  total: number;
}

const COFFEE = { category: 'cafe', price: 4500, cost: 1600 };
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Catálogo ampliado: HTTP con PostgreSQL real', () => {
  const harness = new CatalogHarness();
  const count = () => harness.context.source.getRepository(Product).count();

  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  describe('creación (CA-04, CA-05, CA-08)', () => {
    it('CA-04: crea un producto simple activo, sin saldo y no disponible', async () => {
      const response = await harness
        .send('post', '/products', {
          sku: 'CAF-CAPU',
          name: 'Capuchino',
          description: 'Caliente',
          ...COFFEE,
        })
        .expect(201);
      const body = response.body as ProductBody;
      expect(body).toMatchObject({
        sku: 'CAF-CAPU',
        category: 'cafe',
        price: 4500,
        cost: 1600,
        costPercent: 35.6,
        soldOut: false,
        available: false,
        active: true,
        stock: 0,
        components: [],
      });
      const row = await harness.stored(body.id);
      expect(row).toMatchObject({ stock: 0, soldOut: false, cost: 1600 });
    });

    it('CA-08: redondea a un decimal y admite costo mayor al precio', async () => {
      const one = (
        await harness
          .send('post', '/products', {
            sku: 'A-1',
            name: 'Frappé',
            category: 'cafe',
            price: 7000,
            cost: 2600,
          })
          .expect(201)
      ).body as ProductBody;
      expect(one.costPercent).toBe(37.1);
      const loss = (
        await harness
          .send('post', '/products', {
            sku: 'A-2',
            name: 'Con pérdida',
            category: 'snack',
            price: 2000,
            cost: 3000,
          })
          .expect(201)
      ).body as ProductBody;
      expect(loss.costPercent).toBe(150);
      const free = (
        await harness
          .send('post', '/products', {
            sku: 'A-3',
            name: 'Costo cero',
            category: 'bebida',
            price: 1,
            cost: 0,
          })
          .expect(201)
      ).body as ProductBody;
      expect(free.costPercent).toBe(0);
    });

    it.each([
      ['sin categoría', { category: undefined }],
      ['sin precio', { price: undefined }],
      ['sin costo en un simple', { cost: undefined }],
      ['categoría desconocida', { category: 'postre' }],
      ['categoría en mayúsculas', { category: 'CAFE' }],
      ['precio 0', { price: 0 }],
      ['precio negativo', { price: -5 }],
      ['precio decimal', { price: 10.5 }],
      ['precio texto', { price: '4500' }],
      ['precio sobre el máximo', { price: 1_000_001 }],
      ['costo negativo', { cost: -1 }],
      ['costo decimal', { cost: 0.5 }],
      ['costo sobre el máximo', { cost: 1_000_001 }],
      ['costo null', { cost: null }],
      ['componentes en un simple', { components: [] }],
      ['campo soldOut', { soldOut: true }],
      ['campo available', { available: true }],
    ])('CA-05: rechaza con 400: %s', async (_caso, override) => {
      await harness
        .send('post', '/products', {
          sku: 'MAL-1',
          name: 'Malo',
          ...COFFEE,
          ...override,
        })
        .expect(400);
      expect(await count()).toBe(0);
    });

    it('solo el admin crea; el resto recibe 401 o 403 antes de validar', async () => {
      for (const role of ['operador', 'repartidor', 'cliente'] as const)
        await harness
          .send('post', '/products', { campo: 'inválido' }, role)
          .expect(403);
      expect(await count()).toBe(0);
    });
  });

  describe('edición (CA-15, CA-16)', () => {
    it('CA-15: cambia precio, costo, categoría y nombre y recalcula costPercent', async () => {
      const product = await harness.simple('CAF-AMER', { price: 4000 });
      const body = (
        await harness
          .send('patch', `/products/${product.id}`, {
            name: 'Americano grande',
            category: 'bebida',
            price: 5000,
            cost: 1250,
          })
          .expect(200)
      ).body as ProductBody;
      expect(body).toMatchObject({
        name: 'Americano grande',
        category: 'bebida',
        price: 5000,
        cost: 1250,
        costPercent: 25,
        stock: 10,
        sku: 'CAF-AMER',
      });
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        product.updatedAt.getTime(),
      );
    });

    it('CA-15: repetir valores no cambia updatedAt y el objeto vacío es 400', async () => {
      const product = await harness.simple('CAF-AMER');
      const before = await harness.stored(product.id);
      await wait(15);
      await harness
        .send('patch', `/products/${product.id}`, {
          name: before.name,
          price: before.price,
          cost: before.cost,
          category: before.category,
        })
        .expect(200);
      expect((await harness.stored(product.id)).updatedAt).toEqual(
        before.updatedAt,
      );
      await harness.send('patch', `/products/${product.id}`, {}).expect(400);
    });

    it.each([
      ['precio 0', { price: 0 }],
      ['precio decimal', { price: 1.5 }],
      ['precio null', { price: null }],
      ['costo negativo', { cost: -1 }],
      ['costo null', { cost: null }],
      ['categoría null', { category: null }],
      ['categoría desconocida', { category: 'postre' }],
      ['campo soldOut', { soldOut: true }],
      ['campo stock', { stock: 3 }],
    ])('rechaza con 400 y no modifica: %s', async (_caso, body) => {
      const product = await harness.simple('CAF-AMER');
      await harness.send('patch', `/products/${product.id}`, body).expect(400);
      expect((await harness.stored(product.id)).updatedAt).toEqual(
        product.updatedAt,
      );
    });

    it('CA-16: un combo no admite costo ni cambiar de categoría, y un simple no pasa a combo', async () => {
      const a = await harness.simple('A-1');
      const b = await harness.simple('B-1');
      const combo = (
        await harness
          .send('post', '/products', {
            sku: 'CMB-1',
            name: 'Combo',
            category: 'combo',
            price: 6000,
            components: [
              { productId: a.id, quantity: 1 },
              { productId: b.id, quantity: 1 },
            ],
          })
          .expect(201)
      ).body as ProductBody;
      const before = await harness.stored(combo.id);
      for (const body of [{ cost: 100 }, { category: 'cafe' }]) {
        const response = await harness
          .send('patch', `/products/${combo.id}`, body)
          .expect(400);
        expect(JSON.stringify((response.body as ErrorBody).message)).toMatch(
          /combo/i,
        );
      }
      await harness
        .send('patch', `/products/${a.id}`, { category: 'combo' })
        .expect(400);
      expect(await harness.stored(combo.id)).toMatchObject({
        category: 'combo',
        cost: 0,
        updatedAt: before.updatedAt,
      });
      expect((await harness.stored(a.id)).category).toBe('cafe');
      // Repetir la categoría del combo y editar su precio sí es válido.
      const ok = (
        await harness
          .send('patch', `/products/${combo.id}`, {
            category: 'combo',
            price: 7000,
          })
          .expect(200)
      ).body as ProductBody;
      expect(ok.price).toBe(7000);
    });

    it('solo el admin edita; inexistente 404; UUID inválido 400', async () => {
      const product = await harness.simple('CAF-AMER');
      await harness
        .send('patch', `/products/${product.id}`, { price: 1 }, 'operador')
        .expect(403);
      await harness
        .send('patch', `/products/${randomUUID()}`, { price: 1 })
        .expect(404);
      await harness
        .send('patch', '/products/no-es-uuid', { price: 1 })
        .expect(400);
    });
  });

  describe('lectura (CA-19 a CA-21)', () => {
    it('CA-19: admin y operador leen listado y detalle con los campos nuevos', async () => {
      const product = await harness.simple('CAF-AMER', { stock: 3 });
      for (const role of ['admin', 'operador'] as const) {
        const page = (await harness.get('/products', role).expect(200))
          .body as ProductPage;
        expect(page.data[0]).toMatchObject({
          sku: 'CAF-AMER',
          category: 'cafe',
          price: 4000,
          cost: 1000,
          costPercent: 25,
          available: true,
          soldOut: false,
          stock: 3,
          components: [],
        });
        await harness.get(`/products/${product.id}`, role).expect(200);
      }
    });

    it('CA-20: repartidor y cliente reciben 403 y sin sesión 401', async () => {
      const product = await harness.simple('CAF-AMER');
      for (const role of ['repartidor', 'cliente'] as const) {
        await harness.get('/products', role).expect(403);
        await harness.get(`/products/${product.id}`, role).expect(403);
      }
      await harness.get('/products').expect(401);
      await harness.get(`/products/${product.id}`).expect(401);
    });

    it('CA-21: filtra por cada categoría, combina con search y active, y rechaza otras', async () => {
      await harness.simple('CAF-1', { category: 'cafe' });
      await harness.simple('CAF-2', { category: 'cafe', active: false });
      await harness.simple('BEB-1', { category: 'bebida' });
      await harness.simple('PAN-1', { category: 'panaderia' });
      await harness.simple('PAS-1', { category: 'pasteleria' });
      await harness.simple('SNK-1', { category: 'snack' });
      const skus = async (query: string) =>
        (
          (await harness.get(`/products${query}`, 'admin').expect(200))
            .body as ProductPage
        ).data.map((p) => p.sku);
      expect(await skus('?category=cafe')).toEqual(['CAF-1', 'CAF-2']);
      expect(await skus('?category=bebida')).toEqual(['BEB-1']);
      expect(await skus('?category=panaderia')).toEqual(['PAN-1']);
      expect(await skus('?category=pasteleria')).toEqual(['PAS-1']);
      expect(await skus('?category=snack')).toEqual(['SNK-1']);
      expect(await skus('?category=combo')).toEqual([]);
      expect(await skus('?category=cafe&active=true')).toEqual(['CAF-1']);
      expect(await skus('?category=cafe&search=caf-2')).toEqual(['CAF-2']);
      expect(await skus('?category=bebida&search=caf')).toEqual([]);
      for (const query of [
        '?category=postre',
        '?category=CAFE',
        '?category=',
        '?category=cafe&category=snack',
      ])
        await harness.get(`/products${query}`, 'admin').expect(400);
    });
  });
});
