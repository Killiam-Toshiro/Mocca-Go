import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  isConstraintViolation,
  MOVEMENT_PRODUCT_FK,
} from '../../common/database-errors';
import { buildPage, Page, pageParams } from '../../common/pagination';
import { StockMovement } from '../../movements/entities/stock-movement.entity';
import { Product } from '../entities/products.entity';
import { ProductView, productView } from '../products.view';
import {
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from '../DTOs/products.dto';

const SKU_UNIQUE_CONSTRAINT = 'products_sku_key';
const HAS_MOVEMENTS =
  'El producto tiene movimientos; desactívalo con PATCH /products/:id/status.';

/** Escapa los comodines de LIKE para que `%`, `_` y `\` se busquen como texto. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

export function isDuplicateSku(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver: unknown = error.driverError;
  return (
    typeof driver === 'object' &&
    driver !== null &&
    'code' in driver &&
    driver.code === '23505' &&
    'constraint' in driver &&
    driver.constraint === SKU_UNIQUE_CONSTRAINT
  );
}

@Injectable()
export class ProductsService {
  constructor(private readonly source: DataSource) {}

  async create(input: CreateProductDto): Promise<ProductView> {
    const repository = this.source.getRepository(Product);
    try {
      const product = await repository.save(
        repository.create({
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
        }),
      );
      return productView(product);
    } catch (error) {
      // El control de unicidad lo hace PostgreSQL; cualquier otro error se propaga.
      if (isDuplicateSku(error))
        throw new ConflictException('El SKU ya existe.');
      throw error;
    }
  }

  async list(input: ListProductsDto): Promise<Page<ProductView>> {
    const params = pageParams(input);
    const query = this.source
      .getRepository(Product)
      .createQueryBuilder('product');
    if (input.search !== undefined) {
      query.andWhere(
        "(product.sku ILIKE :pattern ESCAPE '\\' OR product.name ILIKE :pattern ESCAPE '\\')",
        { pattern: `%${escapeLike(input.search)}%` },
      );
    }
    if (input.active !== undefined)
      query.andWhere('product.active = :active', {
        active: input.active === 'true',
      });
    const [products, total] = await query
      .orderBy('product.sku', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();
    return buildPage(products.map(productView), params, total);
  }

  async findOne(id: string): Promise<ProductView> {
    const product = await this.source.getRepository(Product).findOneBy({ id });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return productView(product);
  }

  update(id: string, input: UpdateProductDto): Promise<ProductView> {
    if (input.name === undefined && input.description === undefined)
      throw new BadRequestException('Indica al menos un campo para editar.');
    return this.changeCatalogFields(id, (product) => {
      const changes: Partial<Pick<Product, 'name' | 'description'>> = {};
      if (input.name !== undefined && input.name !== product.name)
        changes.name = input.name;
      if (
        input.description !== undefined &&
        input.description !== product.description
      )
        changes.description = input.description;
      return changes;
    });
  }

  setStatus(id: string, active: boolean): Promise<ProductView> {
    return this.changeCatalogFields(id, (product) =>
      product.active === active ? {} : { active },
    );
  }

  /**
   * Elimina un producto sin movimientos (RN-08). Bloquea la fila igual que el
   * registro de movimientos, así que ambos quedan serializados; la FK RESTRICT
   * del historial es la red de seguridad.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.source.transaction(async (manager) => {
        const repository = manager.getRepository(Product);
        const product = await repository
          .createQueryBuilder('product')
          .where('product.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!product) throw new NotFoundException('Producto no encontrado.');
        if (
          await manager.getRepository(StockMovement).existsBy({ productId: id })
        )
          throw new ConflictException(HAS_MOVEMENTS);
        await repository.delete({ id });
      });
    } catch (error) {
      if (isConstraintViolation(error, '23503', MOVEMENT_PRODUCT_FK))
        throw new ConflictException(HAS_MOVEMENTS);
      throw error;
    }
  }

  /**
   * Bloquea la fila del producto, calcula qué columnas de catálogo cambian y
   * solo ejecuta el UPDATE si hay diferencias. Nunca escribe `stock`: como el
   * UPDATE incluye únicamente las columnas modificadas, una edición no pisa un
   * saldo cambiado por otra transacción.
   */
  private changeCatalogFields(
    id: string,
    changesFor: (
      product: Product,
    ) => Partial<Pick<Product, 'name' | 'description' | 'active'>>,
  ): Promise<ProductView> {
    return this.source.transaction(async (manager) => {
      const repository = manager.getRepository(Product);
      const product = await repository
        .createQueryBuilder('product')
        .where('product.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!product) throw new NotFoundException('Producto no encontrado.');
      const changes = changesFor(product);
      if (Object.keys(changes).length === 0) return productView(product);
      await repository.update({ id }, changes);
      return productView(await repository.findOneByOrFail({ id }));
    });
  }
}
