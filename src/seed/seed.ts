import { DataSource } from 'typeorm';
import { Product } from '../products/entities/products.entity';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SeedCredentials, seedCredentials } from './credentials';
import { hashPassword } from './password';

const products = [
  { sku: 'INV-001', name: 'Teclado', quantity: 20 },
  { sku: 'INV-002', name: 'Mouse', quantity: 30 },
  { sku: 'INV-003', name: 'Monitor', quantity: 10 },
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
          catalogue.create({ sku: data.sku, name: data.name }),
        );
        result.productsCreated++;
      }
      const seedKey = `inventory-v1:${data.sku}`;
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
          reason: 'Carga inicial de inventario',
          seedKey,
        }),
      );
      result.movementsCreated++;
    }
    return result;
  });
}
