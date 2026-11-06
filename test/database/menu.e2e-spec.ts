import request from 'supertest';
import {
  CatalogHarness,
  MenuItemBody,
  ProductBody,
} from '../helpers/catalog-app';

const MENU_KEYS = [
  'available',
  'category',
  'components',
  'description',
  'id',
  'name',
  'price',
  'sku',
];

describe('Menú público: HTTP con PostgreSQL real', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  const menu = async () => {
    const response = await request(harness.server)
      .get('/api/v1/menu')
      .expect(200);
    return {
      headers: response.headers,
      data: (response.body as { data: MenuItemBody[] }).data,
    };
  };

  async function populate() {
    const pandebono = await harness.simple('PAN-PAND', {
      name: 'Pandebono',
      category: 'panaderia',
      price: 2500,
      stock: 30,
    });
    const capu = await harness.simple('CAF-CAPU', {
      name: 'Capuchino',
      price: 4500,
      stock: 40,
    });
    await harness.simple('CAF-AMER', { name: 'Americano', price: 3500 });
    await harness.simple('SNK-PAPA', {
      name: 'Papas',
      category: 'snack',
      stock: 0,
    });
    await harness.simple('PAS-CUPC', {
      name: 'Cupcake',
      category: 'pasteleria',
    });
    await harness.simple('BEB-AGUA', { name: 'Agua', category: 'bebida' });
    await harness.simple('OCU-1', { name: 'Retirado', active: false });
    const combo = (
      await harness
        .send('post', '/products', {
          sku: 'CMB-CLASICO',
          name: 'Combo Clásico',
          category: 'combo',
          price: 6500,
          components: [
            { productId: capu.id, quantity: 1 },
            { productId: pandebono.id, quantity: 2 },
          ],
        })
        .expect(201)
    ).body as ProductBody;
    return { combo, capu, pandebono };
  }

  it('CA-22: es público, no se cachea y solo muestra productos activos', async () => {
    await populate();
    const { headers, data } = await menu();
    expect(headers['cache-control']).toBe('no-store');
    expect(data.map((item) => item.sku)).not.toContain('OCU-1');
    expect(data).toHaveLength(7);
  });

  it('CA-22: ordena por categoría (combo, café, bebida, panadería, pastelería, snack) y nombre', async () => {
    await populate();
    const { data } = await menu();
    expect(data.map((item) => [item.category, item.name])).toEqual([
      ['combo', 'Combo Clásico'],
      ['cafe', 'Americano'],
      ['cafe', 'Capuchino'],
      ['bebida', 'Agua'],
      ['panaderia', 'Pandebono'],
      ['pasteleria', 'Cupcake'],
      ['snack', 'Papas'],
    ]);
  });

  it('CA-22: el combo trae nombres y cantidades; los simples, una lista vacía', async () => {
    await populate();
    const { data } = await menu();
    const combo = data.find((item) => item.sku === 'CMB-CLASICO');
    expect(combo?.components).toEqual([
      { name: 'Capuchino', quantity: 1 },
      { name: 'Pandebono', quantity: 2 },
    ]);
    expect(data.find((item) => item.sku === 'CAF-AMER')?.components).toEqual(
      [],
    );
  });

  it('CA-23: cada elemento tiene exactamente las claves públicas', async () => {
    await populate();
    const { data } = await menu();
    for (const item of data) {
      expect(Object.keys(item).sort()).toEqual(MENU_KEYS);
      for (const component of item.components)
        expect(Object.keys(component).sort()).toEqual(['name', 'quantity']);
    }
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/"(cost|costPercent|stock|active|soldOut)"/);
  });

  it('CA-23: el menú también responde con una sesión de cualquier rol', async () => {
    await populate();
    for (const role of ['admin', 'operador', 'repartidor', 'cliente'] as const)
      await harness.get('/menu', role).expect(200);
  });

  it('CA-24: refleja de inmediato un cambio de «agotado», de saldo y de estado', async () => {
    const { capu, combo } = await populate();
    const find = async (sku: string) =>
      (await menu()).data.find((item) => item.sku === sku);
    expect((await find('CAF-CAPU'))?.available).toBe(true);
    expect((await find('SNK-PAPA'))?.available).toBe(false);
    await harness
      .send(
        'patch',
        `/products/${capu.id}/sold-out`,
        { soldOut: true },
        'operador',
      )
      .expect(200);
    expect((await find('CAF-CAPU'))?.available).toBe(false);
    expect((await find('CMB-CLASICO'))?.available).toBe(false);
    await harness
      .send(
        'patch',
        `/products/${capu.id}/sold-out`,
        { soldOut: false },
        'operador',
      )
      .expect(200);
    expect((await find('CMB-CLASICO'))?.available).toBe(true);
    // Saldo del componente por debajo de la cantidad que usa el combo (2).
    const pandebono = await harness.context.source.query<{ id: string }[]>(
      `SELECT id FROM "${harness.context.ownedSchema}"."products" WHERE sku = 'PAN-PAND'`,
    );
    await harness
      .send(
        'post',
        '/movements',
        {
          productId: pandebono[0].id,
          type: 'OUT',
          quantity: 29,
          reason: 'Venta',
        },
        'operador',
      )
      .expect(201);
    expect((await find('CMB-CLASICO'))?.available).toBe(false);
    await harness
      .send('patch', `/products/${combo.id}/status`, { active: false })
      .expect(200);
    expect(await find('CMB-CLASICO')).toBeUndefined();
  });

  it('un menú sin productos responde una lista vacía', async () => {
    expect((await menu()).data).toEqual([]);
  });

  it('limita las peticiones por IP (429 tras 60 por minuto)', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 62; index++)
      statuses.push((await request(harness.server).get('/api/v1/menu')).status);
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });

  it('el catálogo interno lleva no-store y el menú no admite escritura', async () => {
    const response = await harness.get('/products', 'admin').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    await request(harness.server).post('/api/v1/menu').send({}).expect(404);
  });
});
