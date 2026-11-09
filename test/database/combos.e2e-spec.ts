import { randomUUID } from 'node:crypto';
import { ProductComponent } from '../../src/products/entities/product-component.entity';
import { Product } from '../../src/products/entities/products.entity';
import { CatalogHarness, ErrorBody, ProductBody } from '../helpers/catalog-app';

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Combos: HTTP con PostgreSQL real', () => {
  const harness = new CatalogHarness();
  let capu: Product;
  let pandebono: Product;
  let latte: Product;

  const links = () =>
    harness.context.source.getRepository(ProductComponent).find();
  const products = () => harness.context.source.getRepository(Product);
  const comboBody = (
    sku: string,
    components: { productId: string; quantity: number }[],
    extra: object = {},
  ) => ({
    sku,
    name: `Combo ${sku}`,
    category: 'combo',
    price: 6500,
    components,
    ...extra,
  });
  const createCombo = (body: object) => harness.send('post', '/products', body);
  const classic = () =>
    comboBody('CMB-CLASICO', [
      { productId: capu.id, quantity: 1 },
      { productId: pandebono.id, quantity: 1 },
    ]);
  const move = (productId: string, type: 'IN' | 'OUT', quantity: number) =>
    harness.send(
      'post',
      '/movements',
      { productId, type, quantity, reason: 'Prueba' },
      'operador',
    );

  beforeEach(async () => {
    await harness.start();
    capu = await harness.simple('CAF-CAPU', { cost: 1600, stock: 40 });
    pandebono = await harness.simple('PAN-PAND', {
      category: 'panaderia',
      cost: 900,
      stock: 30,
    });
    latte = await harness.simple('CAF-LATT', { cost: 1900, stock: 5 });
  });
  afterEach(() => harness.stop());

  describe('creación (CA-06, CA-07)', () => {
    it('CA-06: crea un combo con costo, porcentaje y saldo calculados', async () => {
      const response = await createCombo(classic()).expect(201);
      const body = response.body as ProductBody;
      expect(body).toMatchObject({
        sku: 'CMB-CLASICO',
        category: 'combo',
        price: 6500,
        cost: 2500,
        costPercent: 38.5,
        stock: 30,
        available: true,
        soldOut: false,
        active: true,
      });
      expect(body.components).toEqual([
        {
          productId: capu.id,
          sku: 'CAF-CAPU',
          name: 'Producto CAF-CAPU',
          quantity: 1,
        },
        {
          productId: pandebono.id,
          sku: 'PAN-PAND',
          name: 'Producto PAN-PAND',
          quantity: 1,
        },
      ]);
      // El combo no guarda saldo ni costo propios.
      expect(await harness.stored(body.id)).toMatchObject({
        stock: 0,
        cost: 0,
      });
      expect(await links()).toHaveLength(2);
    });

    it('CA-06: la cantidad multiplica costo y saldo', async () => {
      const body = (
        await createCombo(
          comboBody('CMB-X', [
            { productId: latte.id, quantity: 2 },
            { productId: pandebono.id, quantity: 3 },
          ]),
        ).expect(201)
      ).body as ProductBody;
      expect(body.cost).toBe(2 * 1900 + 3 * 900);
      // ⌊5 ÷ 2⌋ = 2 y ⌊30 ÷ 3⌋ = 10.
      expect(body.stock).toBe(2);
    });

    it('CA-07: rechaza composiciones inválidas sin dejar combos ni filas de composición', async () => {
      const inactive = await harness.simple('INA-1', { active: false });
      const other = await harness.simple('OTR-1');
      const existingCombo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const baseline = await products().count();
      const part = (p: { id: string }, quantity = 1) => ({
        productId: p.id,
        quantity,
      });
      const many = [];
      for (let index = 0; index < 11; index++)
        many.push(part(await harness.simple(`MAS-${index}`)));
      const invalid: [string, object][] = [
        ['sin componentes', comboBody('CMB-1', [])],
        ['un solo componente', comboBody('CMB-1', [part(capu)])],
        ['once componentes', comboBody('CMB-1', many)],
        ['componente repetido', comboBody('CMB-1', [part(capu), part(capu)])],
        [
          'componente inexistente',
          comboBody('CMB-1', [
            part(capu),
            { productId: randomUUID(), quantity: 1 },
          ]),
        ],
        [
          'componente inactivo',
          comboBody('CMB-1', [part(capu), part(inactive)]),
        ],
        [
          'componente que es un combo',
          comboBody('CMB-1', [
            part(capu),
            { productId: existingCombo.id, quantity: 1 },
          ]),
        ],
        ['cantidad 0', comboBody('CMB-1', [part(capu, 0), part(other)])],
        ['cantidad 11', comboBody('CMB-1', [part(capu, 11), part(other)])],
        [
          'cantidad decimal',
          comboBody('CMB-1', [part(capu, 1.5), part(other)]),
        ],
        [
          'costo enviado',
          comboBody('CMB-1', [part(capu), part(other)], { cost: 500 }),
        ],
        [
          'combo sin la clave components',
          { sku: 'CMB-1', name: 'X', category: 'combo', price: 5000 },
        ],
      ];
      for (const [, body] of invalid) {
        const response = await createCombo(body).expect(400);
        expect((response.body as ErrorBody).statusCode).toBe(400);
      }
      expect(await products().count()).toBe(baseline + 11);
      expect(await links()).toHaveLength(2);
    });

    it('los motivos de composición se explican en el mensaje', async () => {
      const message = async (components: object[]) =>
        JSON.stringify(
          (
            (
              await createCombo(comboBody('CMB-1', components as never)).expect(
                400,
              )
            ).body as ErrorBody
          ).message,
        );
      expect(await message([{ productId: capu.id, quantity: 1 }])).toMatch(
        /entre 2 y 10/,
      );
      expect(
        await message([
          { productId: capu.id, quantity: 1 },
          { productId: capu.id, quantity: 1 },
        ]),
      ).toMatch(/repitas/);
      expect(
        await message([
          { productId: capu.id, quantity: 1 },
          { productId: randomUUID(), quantity: 1 },
        ]),
      ).toMatch(/no existe/);
    });

    it('un SKU repetido en un combo devuelve 409 y no deja composición', async () => {
      await createCombo(classic()).expect(201);
      await createCombo(classic()).expect(409);
      expect(await links()).toHaveLength(2);
    });
  });

  describe('saldo y movimientos (CA-09, CA-10)', () => {
    it('CA-09: el saldo y la disponibilidad del combo siguen a sus componentes', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const read = async () =>
        (await harness.get(`/products/${combo.id}`, 'admin').expect(200))
          .body as ProductBody;
      expect((await read()).stock).toBe(30);
      await move(pandebono.id, 'OUT', 29).expect(201);
      expect(await read()).toMatchObject({ stock: 1, available: true });
      await move(pandebono.id, 'OUT', 1).expect(201);
      expect(await read()).toMatchObject({ stock: 0, available: false });
      await move(pandebono.id, 'IN', 60).expect(201);
      await move(capu.id, 'OUT', 35).expect(201);
      expect(await read()).toMatchObject({ stock: 5, available: true });
    });

    it('CA-10: un movimiento sobre el combo es 409 y sin cambios; el del componente funciona', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const response = await move(combo.id, 'IN', 5).expect(409);
      expect((response.body as ErrorBody).message).toBe(
        'Un combo no tiene saldo propio; registra el movimiento de sus componentes.',
      );
      await move(combo.id, 'OUT', 1).expect(409);
      expect(await harness.stored(combo.id)).toMatchObject({ stock: 0 });
      await move(randomUUID(), 'IN', 1).expect(404);
      await move(capu.id, 'IN', 5).expect(201);
      expect((await harness.stored(capu.id)).stock).toBe(45);
    });
  });

  describe('reemplazo de composición (CA-13, CA-14)', () => {
    it('CA-13: reemplaza la composición y recalcula costo, saldo y disponibilidad', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      await wait(15);
      const body = (
        await harness
          .send('put', `/products/${combo.id}/components`, {
            components: [
              { productId: latte.id, quantity: 2 },
              { productId: capu.id, quantity: 4 },
            ],
          })
          .expect(200)
      ).body as ProductBody;
      expect(body.components.map((c) => [c.sku, c.quantity])).toEqual([
        ['CAF-CAPU', 4],
        ['CAF-LATT', 2],
      ]);
      expect(body).toMatchObject({
        cost: 4 * 1600 + 2 * 1900,
        stock: 2,
        available: true,
      });
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        new Date(combo.updatedAt).getTime(),
      );
      const rows = await links();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.componentId).sort()).toEqual(
        [latte.id, capu.id].sort(),
      );
    });

    it('repetir la misma composición no cambia updatedAt', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      await wait(15);
      const body = (
        await harness
          .send('put', `/products/${combo.id}/components`, {
            components: [
              { productId: pandebono.id, quantity: 1 },
              { productId: capu.id, quantity: 1 },
            ],
          })
          .expect(200)
      ).body as ProductBody;
      expect(body.updatedAt).toBe(combo.updatedAt);
    });

    it('CA-14: una composición inválida conserva la anterior', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const inactive = await harness.simple('INA-1', { active: false });
      for (const components of [
        [],
        [{ productId: capu.id, quantity: 1 }],
        [
          { productId: capu.id, quantity: 1 },
          { productId: capu.id, quantity: 2 },
        ],
        [
          { productId: capu.id, quantity: 1 },
          { productId: inactive.id, quantity: 1 },
        ],
        [
          { productId: capu.id, quantity: 1 },
          { productId: combo.id, quantity: 1 },
        ],
        [
          { productId: capu.id, quantity: 99 },
          { productId: latte.id, quantity: 1 },
        ],
        [
          { productId: capu.id, quantity: 1 },
          { productId: randomUUID(), quantity: 1 },
        ],
      ])
        await harness
          .send('put', `/products/${combo.id}/components`, { components })
          .expect(400);
      const rows = await links();
      expect(rows.map((r) => [r.componentId, r.quantity]).sort()).toEqual(
        [
          [capu.id, 1],
          [pandebono.id, 1],
        ].sort(),
      );
    });

    it('CA-14: sobre un producto simple 409, inexistente 404, UUID inválido 400', async () => {
      const parts = {
        components: [
          { productId: capu.id, quantity: 1 },
          { productId: latte.id, quantity: 1 },
        ],
      };
      const response = await harness
        .send('put', `/products/${pandebono.id}/components`, parts)
        .expect(409);
      expect((response.body as ErrorBody).message).toBe(
        'El producto no es un combo.',
      );
      await harness
        .send('put', `/products/${randomUUID()}/components`, parts)
        .expect(404);
      await harness
        .send('put', '/products/no-es-uuid/components', parts)
        .expect(400);
      await harness
        .send('put', `/products/${pandebono.id}/components`, {})
        .expect(400);
      expect(await links()).toHaveLength(0);
    });

    it('solo el admin reemplaza la composición', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const body = { components: [{ productId: latte.id, quantity: 1 }] };
      for (const role of ['operador', 'repartidor', 'cliente'] as const)
        await harness
          .send('put', `/products/${combo.id}/components`, body, role)
          .expect(403);
      await harness.get('/products').expect(401);
      expect(await links()).toHaveLength(2);
    });
  });

  describe('eliminar y desactivar (CA-17, CA-18)', () => {
    it('CA-17: un componente no se elimina; un combo sí y arrastra su composición', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const response = await harness
        .send('delete', `/products/${capu.id}`)
        .expect(409);
      expect((response.body as ErrorBody).message).toBe(
        'El producto es componente de un combo.',
      );
      expect(await harness.stored(capu.id)).toBeDefined();
      await harness.send('delete', `/products/${combo.id}`).expect(204);
      expect(await links()).toHaveLength(0);
      expect(await products().countBy({ id: capu.id })).toBe(1);
      expect(await products().countBy({ id: pandebono.id })).toBe(1);
      // Sin combo que lo use, el componente vuelve a poder eliminarse.
      await harness.send('delete', `/products/${capu.id}`).expect(204);
    });

    it('CA-18: desactivar un componente deja el combo listado pero no disponible', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      await harness
        .send('patch', `/products/${capu.id}/status`, { active: false })
        .expect(200);
      expect(
        (await harness.get(`/products/${combo.id}`, 'admin').expect(200)).body,
      ).toMatchObject({ available: false, active: true });
      await harness
        .send('patch', `/products/${capu.id}/status`, { active: true })
        .expect(200);
      expect(
        (await harness.get(`/products/${combo.id}`, 'admin').expect(200)).body,
      ).toMatchObject({ available: true });
    });
  });

  describe('concurrencia (CA-25)', () => {
    it('crear un combo con un componente y eliminar ese componente nunca deja un combo huérfano ni un 500', async () => {
      for (let round = 0; round < 8; round++) {
        const victim = await harness.simple(`VIC-${round}`);
        const [creation, deletion] = await Promise.all([
          createCombo(
            comboBody(`CMB-R${round}`, [
              { productId: victim.id, quantity: 1 },
              { productId: pandebono.id, quantity: 1 },
            ]),
          ),
          harness.send('delete', `/products/${victim.id}`),
        ]);
        expect([201, 400]).toContain(creation.status);
        expect([204, 409]).toContain(deletion.status);
        // Gana exactamente una de las dos operaciones.
        expect(creation.status === 201).toBe(deletion.status === 409);
        const survivors = await products().countBy({ id: victim.id });
        expect(survivors).toBe(creation.status === 201 ? 1 : 0);
        const orphan = await harness.context.source
          .getRepository(ProductComponent)
          .count({ where: { componentId: victim.id } });
        expect(orphan).toBe(creation.status === 201 ? 1 : 0);
      }
    });

    it('reemplazar la composición y desactivar un componente a la vez deja un estado coherente', async () => {
      const combo = (await createCombo(classic()).expect(201))
        .body as ProductBody;
      const [put, off] = await Promise.all([
        harness.send('put', `/products/${combo.id}/components`, {
          components: [
            { productId: latte.id, quantity: 1 },
            { productId: capu.id, quantity: 1 },
          ],
        }),
        harness.send('patch', `/products/${latte.id}/status`, {
          active: false,
        }),
      ]);
      expect([200, 400]).toContain(put.status);
      expect(off.status).toBe(200);
      const latteRow = await harness.stored(latte.id);
      expect(latteRow.active).toBe(false);
      const rows = await links();
      expect(rows).toHaveLength(2);
    });
  });
});

describe('Precio de un combo: HTTP con PostgreSQL real', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  let round = 0;
  const parts = async (priceA = 4500, priceB = 2500, quantityB = 2) => {
    round++;
    const a = await harness.simple(`A-${round}`, { price: priceA });
    const b = await harness.simple(`B-${round}`, { price: priceB });
    return [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: quantityB },
    ];
  };
  const combo = (components: object[], extra: object = {}) =>
    harness.send('post', '/products', {
      sku: 'CMB-1',
      name: 'Combo',
      category: 'combo',
      components,
      ...extra,
    });

  it('sin precio vale la suma de precio × cantidad de sus componentes', async () => {
    const body = (await combo(await parts()).expect(201)).body as ProductBody;
    expect(body.price).toBe(4500 + 2 * 2500);
  });

  it('con precio explícito se respeta (promoción) y luego se puede editar', async () => {
    const body = (await combo(await parts(), { price: 6000 }).expect(201))
      .body as ProductBody;
    expect(body).toMatchObject({ price: 6000, cost: 3000 });
    const edited = (
      await harness
        .send('patch', `/products/${body.id}`, { price: 5500 })
        .expect(200)
    ).body as ProductBody;
    expect(edited.price).toBe(5500);
  });

  it('el precio no sigue a los componentes después de crear el combo', async () => {
    const body = (await combo(await parts()).expect(201)).body as ProductBody;
    await harness
      .send('patch', `/products/${body.components[0].productId}`, {
        price: 9000,
      })
      .expect(200);
    const read = (
      await harness.get(`/products/${body.id}`, 'admin').expect(200)
    ).body as ProductBody;
    expect(read.price).toBe(9500);
  });

  it('rechaza con 400 si la suma no es un precio válido y no se indica otro', async () => {
    await combo(await parts(0, 0)).expect(400);
    await combo(await parts(900_000, 900_000)).expect(400);
    await combo(await parts(900_000, 900_000), {
      sku: 'CMB-2',
      price: 50_000,
    }).expect(201);
  });

  it('un producto simple sigue exigiendo precio', async () => {
    await harness
      .send('post', '/products', {
        sku: 'S-1',
        name: 'Simple',
        category: 'snack',
        cost: 100,
      })
      .expect(400);
  });
});
