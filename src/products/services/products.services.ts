import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  COMPONENT_PRODUCT_FK,
  isConstraintViolation,
  MOVEMENT_PRODUCT_FK,
} from '../../common/database-errors';
import { buildPage, Page, pageParams } from '../../common/pagination';
import { StockMovement } from '../../movements/entities/stock-movement.entity';
import { ProductComponent } from '../entities/product-component.entity';
import { Product } from '../entities/products.entity';
import {
  ComponentRow,
  MenuItemView,
  menuItemView,
  ProductView,
  productView,
} from '../products.view';
import {
  ComponentInputDto,
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from '../DTOs/products.dto';

const SKU_UNIQUE_CONSTRAINT = 'products_sku_key';
const HAS_MOVEMENTS =
  'El producto tiene movimientos; desactívalo con PATCH /products/:id/status.';
const IS_COMPONENT = 'El producto es componente de un combo.';
const MENU_LIMIT = 200;
const MENU_ORDER = `CASE product.category WHEN 'combo' THEN 0 WHEN 'cafe' THEN 1 WHEN 'bebida' THEN 2 WHEN 'panaderia' THEN 3 WHEN 'pasteleria' THEN 4 ELSE 5 END`;

type CatalogChanges = Partial<
  Pick<
    Product,
    | 'name'
    | 'description'
    | 'active'
    | 'category'
    | 'price'
    | 'cost'
    | 'soldOut'
  >
>;

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

  /** Componentes de varios combos con una sola consulta. */
  private async componentsOf(
    manager: EntityManager,
    comboIds: string[],
  ): Promise<Map<string, ComponentRow[]>> {
    const byCombo = new Map<string, ComponentRow[]>();
    if (comboIds.length === 0) return byCombo;
    const rows = await manager
      .getRepository(ProductComponent)
      .createQueryBuilder('link')
      .innerJoinAndSelect('link.component', 'component')
      .where('link.comboId IN (:...comboIds)', { comboIds })
      .orderBy('component.sku', 'ASC')
      .getMany();
    for (const link of rows) {
      const component = link.component as Product;
      const list = byCombo.get(link.comboId) ?? [];
      list.push({
        productId: component.id,
        sku: component.sku,
        name: component.name,
        quantity: link.quantity,
        cost: component.cost,
        stock: component.stock,
        active: component.active,
        soldOut: component.soldOut,
      });
      byCombo.set(link.comboId, list);
    }
    return byCombo;
  }

  private async viewOf(
    manager: EntityManager,
    products: Product[],
  ): Promise<ProductView[]> {
    const combos = await this.componentsOf(
      manager,
      products.filter((p) => p.category === 'combo').map((p) => p.id),
    );
    return products.map((p) => productView(p, combos.get(p.id)));
  }

  private lock(manager: EntityManager, id: string): Promise<Product | null> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .where('product.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  /**
   * Valida la composición (RN-30) y devuelve los productos componentes. Los
   * bloquea en modo compartido y en orden de id: una eliminación o
   * desactivación concurrente espera a que termine la transacción.
   */
  private async validateComponents(
    manager: EntityManager,
    inputs: ComponentInputDto[],
  ): Promise<Product[]> {
    if (inputs.length < 2 || inputs.length > 10)
      throw new BadRequestException('Un combo lleva entre 2 y 10 componentes.');
    const ids = inputs.map((item) => item.productId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('No repitas productos en la composición.');
    const found = await manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .where('product.id IN (:...ids)', { ids })
      .orderBy('product.id', 'ASC')
      .setLock('pessimistic_read')
      .getMany();
    if (found.length !== ids.length)
      throw new BadRequestException('Algún componente no existe.');
    for (const product of found) {
      if (product.category === 'combo')
        throw new BadRequestException(
          `El componente ${product.sku} es un combo; un combo no contiene combos.`,
        );
      if (!product.active)
        throw new BadRequestException(
          `El componente ${product.sku} está inactivo.`,
        );
    }
    return found;
  }

  async create(input: CreateProductDto): Promise<ProductView> {
    const isCombo = input.category === 'combo';
    if (isCombo) {
      if (input.cost !== undefined)
        throw new BadRequestException(
          'El costo de un combo se calcula; no lo envíes.',
        );
      if (input.components === undefined)
        throw new BadRequestException('Un combo requiere componentes.');
    } else {
      if (input.components !== undefined)
        throw new BadRequestException('Solo un combo admite componentes.');
      if (input.cost === undefined)
        throw new BadRequestException('El costo es obligatorio.');
      if (input.price === undefined)
        throw new BadRequestException('El precio es obligatorio.');
    }
    try {
      return await this.source.transaction(async (manager) => {
        let price = input.price;
        if (isCombo) {
          const parts = await this.validateComponents(
            manager,
            input.components ?? [],
          );
          // Sin precio explícito, el combo vale la suma de sus componentes.
          price ??= parts.reduce(
            (sum, part) =>
              sum +
              part.price *
                (input.components ?? []).filter(
                  (item) => item.productId === part.id,
                )[0].quantity,
            0,
          );
          if (price < 1 || price > 1_000_000)
            throw new BadRequestException(
              'La suma de los componentes no da un precio válido (1 a 1.000.000); indica el precio.',
            );
        }
        const repository = manager.getRepository(Product);
        const product = await repository.save(
          repository.create({
            sku: input.sku,
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            price,
            cost: isCombo ? 0 : input.cost,
          }),
        );
        if (isCombo)
          await manager.getRepository(ProductComponent).insert(
            (input.components ?? []).map((item) => ({
              comboId: product.id,
              componentId: item.productId,
              quantity: item.quantity,
            })),
          );
        const [view] = await this.viewOf(manager, [product]);
        return view;
      });
    } catch (error) {
      // El control de unicidad lo hace PostgreSQL; cualquier otro error se propaga.
      if (isDuplicateSku(error))
        throw new ConflictException('El SKU ya existe.');
      if (isConstraintViolation(error, '23503', COMPONENT_PRODUCT_FK))
        throw new BadRequestException('Algún componente no existe.');
      throw error;
    }
  }

  list(input: ListProductsDto): Promise<Page<ProductView>> {
    const params = pageParams(input);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const query = manager
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
      if (input.category !== undefined)
        query.andWhere('product.category = :category', {
          category: input.category,
        });
      const [products, total] = await query
        .orderBy('product.sku', 'ASC')
        .addOrderBy('product.id', 'ASC')
        .skip((params.page - 1) * params.limit)
        .take(params.limit)
        .getManyAndCount();
      return buildPage(await this.viewOf(manager, products), params, total);
    });
  }

  findOne(id: string): Promise<ProductView> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const product = await manager.getRepository(Product).findOneBy({ id });
      if (!product) throw new NotFoundException('Producto no encontrado.');
      const [view] = await this.viewOf(manager, [product]);
      return view;
    });
  }

  /** Menú público (RN-37): solo productos activos, sin datos internos. */
  menu(): Promise<{ data: MenuItemView[] }> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const products = await manager
        .getRepository(Product)
        .createQueryBuilder('product')
        .where('product.active = true')
        .orderBy(MENU_ORDER, 'ASC')
        .addOrderBy('product.name', 'ASC')
        .addOrderBy('product.id', 'ASC')
        .limit(MENU_LIMIT)
        .getMany();
      const combos = await this.componentsOf(
        manager,
        products.filter((p) => p.category === 'combo').map((p) => p.id),
      );
      return {
        data: products.map((p) => menuItemView(p, combos.get(p.id))),
      };
    });
  }

  update(id: string, input: UpdateProductDto): Promise<ProductView> {
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.category === undefined &&
      input.price === undefined &&
      input.cost === undefined
    )
      throw new BadRequestException('Indica al menos un campo para editar.');
    return this.changeCatalogFields(id, (product) => {
      const isCombo = product.category === 'combo';
      if (isCombo && input.cost !== undefined)
        throw new BadRequestException(
          'El costo de un combo se calcula; no lo envíes.',
        );
      if (
        input.category !== undefined &&
        (input.category === 'combo') !== isCombo
      )
        throw new BadRequestException(
          'Un producto no se convierte en combo ni a la inversa.',
        );
      const changes: CatalogChanges = {};
      if (input.name !== undefined && input.name !== product.name)
        changes.name = input.name;
      if (
        input.description !== undefined &&
        input.description !== product.description
      )
        changes.description = input.description;
      if (input.category !== undefined && input.category !== product.category)
        changes.category = input.category;
      if (input.price !== undefined && input.price !== product.price)
        changes.price = input.price;
      if (input.cost !== undefined && input.cost !== product.cost)
        changes.cost = input.cost;
      return changes;
    });
  }

  setStatus(id: string, active: boolean): Promise<ProductView> {
    return this.changeCatalogFields(id, (product) =>
      product.active === active ? {} : { active },
    );
  }

  setSoldOut(id: string, soldOut: boolean): Promise<ProductView> {
    return this.changeCatalogFields(id, (product) =>
      product.soldOut === soldOut ? {} : { soldOut },
    );
  }

  /** Reemplaza toda la composición de un combo en una transacción (RN-30). */
  async replaceComponents(
    id: string,
    inputs: ComponentInputDto[],
  ): Promise<ProductView> {
    try {
      return await this.source.transaction(async (manager) => {
        const product = await this.lock(manager, id);
        if (!product) throw new NotFoundException('Producto no encontrado.');
        if (product.category !== 'combo')
          throw new ConflictException('El producto no es un combo.');
        await this.validateComponents(manager, inputs);
        const links = manager.getRepository(ProductComponent);
        const current = await links.findBy({ comboId: id });
        const same =
          current.length === inputs.length &&
          inputs.every((item) =>
            current.some(
              (link) =>
                link.componentId === item.productId &&
                link.quantity === item.quantity,
            ),
          );
        if (!same) {
          await links.delete({ comboId: id });
          await links.insert(
            inputs.map((item) => ({
              comboId: id,
              componentId: item.productId,
              quantity: item.quantity,
            })),
          );
          await manager
            .getRepository(Product)
            .createQueryBuilder()
            .update()
            .set({ updatedAt: () => 'now()' })
            .where('id = :id', { id })
            .execute();
        }
        const fresh = await manager
          .getRepository(Product)
          .findOneByOrFail({ id });
        const [view] = await this.viewOf(manager, [fresh]);
        return view;
      });
    } catch (error) {
      if (isConstraintViolation(error, '23503', COMPONENT_PRODUCT_FK))
        throw new BadRequestException('Algún componente no existe.');
      throw error;
    }
  }

  /**
   * Elimina un producto sin movimientos (RN-08) que no sea componente de un
   * combo (RN-35). Bloquea la fila igual que el registro de movimientos, así
   * que ambos quedan serializados; las FK RESTRICT son la red de seguridad.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.source.transaction(async (manager) => {
        const product = await this.lock(manager, id);
        if (!product) throw new NotFoundException('Producto no encontrado.');
        if (
          await manager
            .getRepository(ProductComponent)
            .existsBy({ componentId: id })
        )
          throw new ConflictException(IS_COMPONENT);
        if (
          await manager.getRepository(StockMovement).existsBy({ productId: id })
        )
          throw new ConflictException(HAS_MOVEMENTS);
        await manager.getRepository(Product).delete({ id });
      });
    } catch (error) {
      if (isConstraintViolation(error, '23503', MOVEMENT_PRODUCT_FK))
        throw new ConflictException(HAS_MOVEMENTS);
      if (isConstraintViolation(error, '23503', COMPONENT_PRODUCT_FK))
        throw new ConflictException(IS_COMPONENT);
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
    changesFor: (product: Product) => CatalogChanges,
  ): Promise<ProductView> {
    return this.source.transaction(async (manager) => {
      const repository = manager.getRepository(Product);
      const product = await this.lock(manager, id);
      if (!product) throw new NotFoundException('Producto no encontrado.');
      const changes = changesFor(product);
      const fresh =
        Object.keys(changes).length === 0
          ? product
          : (await repository.update({ id }, changes),
            await repository.findOneByOrFail({ id }));
      const [view] = await this.viewOf(manager, [fresh]);
      return view;
    });
  }
}
