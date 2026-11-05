import { randomUUID } from 'node:crypto';
import {
  ComponentState,
  comboCost,
  comboStock,
  costPercent,
  isAvailable,
} from '../../src/products/catalog';
import { Product } from '../../src/products/entities/products.entity';
import { menuItemView, productView } from '../../src/products/products.view';

const part = (override: Partial<ComponentState> = {}): ComponentState => ({
  quantity: 1,
  cost: 1000,
  stock: 10,
  active: true,
  soldOut: false,
  ...override,
});

describe('costPercent (CA-08)', () => {
  it('redondea a un decimal', () => {
    expect(costPercent(2600, 7000)).toBe(37.1);
    expect(costPercent(2500, 6500)).toBe(38.5);
    expect(costPercent(2800, 7500)).toBe(37.3);
    expect(costPercent(3800, 10000)).toBe(38);
    expect(costPercent(0, 1000)).toBe(0);
  });

  it('puede superar el 100 % y es null con precio 0', () => {
    expect(costPercent(3000, 2000)).toBe(150);
    expect(costPercent(500, 0)).toBeNull();
  });
});

describe('comboCost y comboStock', () => {
  it('suma costo × cantidad', () => {
    expect(comboCost([])).toBe(0);
    expect(
      comboCost([part({ cost: 1600 }), part({ cost: 900, quantity: 3 })]),
    ).toBe(4300);
  });

  it('el saldo es el mínimo de ⌊saldo ÷ cantidad⌋ y 0 sin componentes', () => {
    expect(comboStock([])).toBe(0);
    expect(comboStock([part({ stock: 40 }), part({ stock: 30 })])).toBe(30);
    expect(comboStock([part({ stock: 7, quantity: 2 })])).toBe(3);
    expect(comboStock([part({ stock: 1, quantity: 2 }), part()])).toBe(0);
  });
});

describe('isAvailable (RN-33)', () => {
  const simple = { active: true, soldOut: false, price: 3000, stock: 1 };

  it('un producto simple requiere activo, no agotado, precio y saldo', () => {
    expect(isAvailable(simple)).toBe(true);
    expect(isAvailable({ ...simple, active: false })).toBe(false);
    expect(isAvailable({ ...simple, soldOut: true })).toBe(false);
    expect(isAvailable({ ...simple, price: 0 })).toBe(false);
    expect(isAvailable({ ...simple, stock: 0 })).toBe(false);
  });

  it('un combo exige cada componente activo, disponible y con saldo suficiente', () => {
    const combo = { ...simple, stock: 0 };
    const ok = [part(), part({ quantity: 2, stock: 2 })];
    expect(isAvailable({ ...combo, components: ok })).toBe(true);
    expect(isAvailable({ ...combo, components: [] })).toBe(false);
    expect(
      isAvailable({ ...combo, components: [...ok, part({ active: false })] }),
    ).toBe(false);
    expect(
      isAvailable({ ...combo, components: [...ok, part({ soldOut: true })] }),
    ).toBe(false);
    expect(
      isAvailable({ ...combo, components: [...ok, part({ stock: 0 })] }),
    ).toBe(false);
    expect(
      isAvailable({
        ...combo,
        components: [part({ quantity: 3, stock: 2 })],
      }),
    ).toBe(false);
    expect(isAvailable({ ...combo, soldOut: true, components: ok })).toBe(
      false,
    );
  });
});

describe('vistas de producto y menú', () => {
  const base = (override: Partial<Product>): Product =>
    Object.assign(new Product(), {
      id: randomUUID(),
      sku: 'CMB-X',
      name: 'Combo X',
      description: null,
      category: 'combo',
      price: 8000,
      cost: 0,
      soldOut: false,
      active: true,
      stock: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...override,
    });
  const rows = [
    {
      ...part({ cost: 1600, stock: 5 }),
      productId: randomUUID(),
      sku: 'A',
      name: 'Uno',
    },
    {
      ...part({ cost: 900, stock: 3 }),
      productId: randomUUID(),
      sku: 'B',
      name: 'Dos',
    },
  ];

  it('un combo calcula costo, saldo y disponibilidad desde sus componentes', () => {
    const view = productView(base({}), rows);
    expect(view).toMatchObject({
      cost: 2500,
      costPercent: 31.3,
      stock: 3,
      available: true,
    });
    expect(view.components.map((c) => c.sku)).toEqual(['A', 'B']);
  });

  it('un producto simple usa su propia fila y no tiene componentes', () => {
    const view = productView(
      base({ category: 'cafe', cost: 1000, stock: 4 }),
      [],
    );
    expect(view).toMatchObject({
      cost: 1000,
      costPercent: 12.5,
      stock: 4,
      available: true,
      components: [],
    });
  });

  it('el menú nunca incluye costo, saldo ni estado interno', () => {
    const item = menuItemView(base({}), rows);
    expect(Object.keys(item).sort()).toEqual([
      'available',
      'category',
      'components',
      'description',
      'id',
      'name',
      'price',
      'sku',
    ]);
    expect(item.components).toEqual([
      { name: 'Uno', quantity: 1 },
      { name: 'Dos', quantity: 1 },
    ]);
  });
});
