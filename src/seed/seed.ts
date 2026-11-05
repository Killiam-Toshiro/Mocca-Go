import { DataSource } from 'typeorm';
import { ProductComponent } from '../products/entities/product-component.entity';
import { Product, SimpleCategory } from '../products/entities/products.entity';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SeedCredentials, seedCredentials } from './credentials';
import { hashPassword } from './password';

interface SeedProduct {
  sku: string;
  name: string;
  category: SimpleCategory;
  price: number;
  cost: number;
  quantity: number;
}

interface SeedCombo {
  sku: string;
  name: string;
  price: number;
  components: { sku: string; quantity: number }[];
}

// Menú inicial de Mocca Go; los precios y costos (COP) son datos de partida.
const products: SeedProduct[] = [
  {
    sku: 'CAF-AMER',
    name: 'Americano (caliente)',
    category: 'cafe',
    price: 3500,
    cost: 1000,
    quantity: 40,
  },
  {
    sku: 'CAF-CAPU',
    name: 'Capuchino (caliente)',
    category: 'cafe',
    price: 4500,
    cost: 1600,
    quantity: 40,
  },
  {
    sku: 'CAF-LATT',
    name: 'Latte (caliente)',
    category: 'cafe',
    price: 5000,
    cost: 1900,
    quantity: 30,
  },
  {
    sku: 'CAF-COLD',
    name: 'Cold brew (frío)',
    category: 'cafe',
    price: 5500,
    cost: 1800,
    quantity: 30,
  },
  {
    sku: 'CAF-LFRI',
    name: 'Latte frío',
    category: 'cafe',
    price: 5500,
    cost: 2000,
    quantity: 30,
  },
  {
    sku: 'CAF-FRAP',
    name: 'Frappé de café (frío)',
    category: 'cafe',
    price: 7000,
    cost: 2600,
    quantity: 25,
  },
  {
    sku: 'BEB-JNAR',
    name: 'Jugo natural de naranja',
    category: 'bebida',
    price: 5000,
    cost: 1800,
    quantity: 25,
  },
  {
    sku: 'BEB-JMOR',
    name: 'Jugo natural de mora',
    category: 'bebida',
    price: 5000,
    cost: 1900,
    quantity: 25,
  },
  {
    sku: 'BEB-GASE',
    name: 'Gaseosa',
    category: 'bebida',
    price: 3000,
    cost: 1300,
    quantity: 48,
  },
  {
    sku: 'BEB-AGUA',
    name: 'Agua',
    category: 'bebida',
    price: 2000,
    cost: 700,
    quantity: 48,
  },
  {
    sku: 'BEB-TEFR',
    name: 'Té frío',
    category: 'bebida',
    price: 3500,
    cost: 1100,
    quantity: 30,
  },
  {
    sku: 'PAN-ESPO',
    name: 'Esponjado de queso',
    category: 'panaderia',
    price: 3000,
    cost: 1100,
    quantity: 30,
  },
  {
    sku: 'PAN-PAND',
    name: 'Pandebono',
    category: 'panaderia',
    price: 2500,
    cost: 900,
    quantity: 30,
  },
  {
    sku: 'PAN-ALMO',
    name: 'Almojábana',
    category: 'panaderia',
    price: 2500,
    cost: 900,
    quantity: 30,
  },
  {
    sku: 'PAS-CHEE',
    name: 'Porción de cheesecake',
    category: 'pasteleria',
    price: 7500,
    cost: 3000,
    quantity: 16,
  },
  {
    sku: 'PAS-CUPC',
    name: 'Cupcake',
    category: 'pasteleria',
    price: 5000,
    cost: 1900,
    quantity: 20,
  },
  {
    sku: 'SNK-PAPA',
    name: 'Papas fritas',
    category: 'snack',
    price: 3500,
    cost: 1500,
    quantity: 40,
  },
  {
    sku: 'SNK-GAAV',
    name: 'Galletas de avena',
    category: 'snack',
    price: 3000,
    cost: 1000,
    quantity: 40,
  },
  {
    sku: 'SNK-GACH',
    name: 'Galletas con chips de chocolate',
    category: 'snack',
    price: 3500,
    cost: 1200,
    quantity: 40,
  },
  {
    sku: 'SNK-MIXF',
    name: 'Mix de frutos secos',
    category: 'snack',
    price: 4000,
    cost: 1700,
    quantity: 30,
  },
];

const combos: SeedCombo[] = [
  {
    sku: 'CMB-CLASICO',
    name: 'Combo Clásico',
    price: 6500,
    components: [
      { sku: 'CAF-CAPU', quantity: 1 },
      { sku: 'PAN-PAND', quantity: 1 },
    ],
  },
  {
    sku: 'CMB-ESTUDIO',
    name: 'Combo Estudio',
    price: 7500,
    components: [
      { sku: 'CAF-COLD', quantity: 1 },
      { sku: 'SNK-GAAV', quantity: 1 },
    ],
  },
  {
    sku: 'CMB-DULCE',
    name: 'Combo Dulce',
    price: 10000,
    components: [
      { sku: 'CAF-LATT', quantity: 1 },
      { sku: 'PAS-CUPC', quantity: 1 },
    ],
  },
];

export interface SeedResult {
  usersCreated: number;
  productsCreated: number;
  movementsCreated: number;
}

export async function runSeed(
  source: DataSource,
  credentials: SeedCredentials,
): Promise<SeedResult> {
  seedCredentials({
    SEED_ADMIN_PASSWORD: credentials.adminPassword,
    SEED_OPERATOR_PASSWORD: credentials.operatorPassword,
    SEED_COURIER_PASSWORD: credentials.courierPassword,
  });
  return source.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [721003, 1]);
    const result: SeedResult = {
      usersCreated: 0,
      productsCreated: 0,
      movementsCreated: 0,
    };
    const users = manager.getRepository(User);
    const userData: { username: string; role: UserRole; password: string }[] = [
      { username: 'admin', role: 'admin', password: credentials.adminPassword },
      {
        username: 'operador',
        role: 'operador',
        password: credentials.operatorPassword,
      },
      {
        username: 'repartidor',
        role: 'repartidor',
        password: credentials.courierPassword,
      },
    ];
    for (const data of userData) {
      if (!(await users.existsBy({ username: data.username }))) {
        await users.save(
          users.create({
            username: data.username,
            role: data.role,
            passwordHash: await hashPassword(data.password),
          }),
        );
        result.usersCreated++;
      }
    }
    const admin = await users.findOneByOrFail({ username: 'admin' });
    const catalogue = manager.getRepository(Product);
    const movements = manager.getRepository(StockMovement);
    for (const data of products) {
      let product = await catalogue.findOneBy({ sku: data.sku });
      if (!product) {
        product = await catalogue.save(
          catalogue.create({
            sku: data.sku,
            name: data.name,
            category: data.category,
            price: data.price,
            cost: data.cost,
          }),
        );
        result.productsCreated++;
      }
      const seedKey = `mocca-menu-v1:${data.sku}`;
      if (await movements.existsBy({ seedKey })) continue;
      product = await catalogue.findOneOrFail({
        where: { id: product.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product.active)
        throw new Error(
          'No se puede aplicar el seed a un producto inactivo sin entrada inicial.',
        );
      product.stock += data.quantity;
      await catalogue.save(product);
      await movements.save(
        movements.create({
          productId: product.id,
          userId: admin.id,
          type: 'IN',
          quantity: data.quantity,
          reason: 'Carga inicial del menú',
          seedKey,
        }),
      );
      result.movementsCreated++;
    }
    const links = manager.getRepository(ProductComponent);
    for (const data of combos) {
      if (await catalogue.existsBy({ sku: data.sku })) continue;
      const combo = await catalogue.save(
        catalogue.create({
          sku: data.sku,
          name: data.name,
          category: 'combo',
          price: data.price,
        }),
      );
      for (const item of data.components) {
        const component = await catalogue.findOneByOrFail({ sku: item.sku });
        await links.insert({
          comboId: combo.id,
          componentId: component.id,
          quantity: item.quantity,
        });
      }
      result.productsCreated++;
    }
    return result;
  });
}
