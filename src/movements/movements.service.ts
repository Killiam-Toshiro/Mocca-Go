import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  IsNull,
  MoreThan,
  QueryFailedError,
} from 'typeorm';
import { Identity } from '../auth/auth.service';
import { Session } from '../auth/entities/session.entity';
import {
  isConstraintViolation,
  MOVEMENT_USER_FK,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { Product } from '../products/entities/products.entity';
import { MovementType, StockMovement } from './entities/stock-movement.entity';
import {
  CreateMovementDto,
  ListMovementsDto,
  MAX_STOCK,
} from './movements.dto';
import { MovementView, movementView } from './movement.view';

export interface MovementInput {
  productId: string;
  userId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  orderId?: string;
}

export interface MovementOptions {
  /** Permite devolver saldo a un producto desactivado (cancelaciones). */
  allowInactive?: boolean;
  insufficientMessage?: (product: Product) => string;
}

@Injectable()
export class MovementsService {
  constructor(private readonly source: DataSource) {}

  /** Bloquea la fila del producto hasta el final de la transacción. */
  lockProduct(manager: EntityManager, id: string): Promise<Product | null> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .where('product.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  /**
   * Núcleo del saldo: valida el producto ya bloqueado, actualiza el saldo y
   * guarda el movimiento, todo dentro de la transacción de quien lo llama.
   */
  async applyLocked(
    manager: EntityManager,
    product: Product,
    input: MovementInput,
    options: MovementOptions = {},
  ): Promise<{ movement: StockMovement; stock: number }> {
    if (product.category === 'combo')
      throw new ConflictException(
        'Un combo no tiene saldo propio; registra el movimiento de sus componentes.',
      );
    if (!product.active && !options.allowInactive)
      throw new ConflictException('El producto está inactivo.');
    const stock =
      product.stock + (input.type === 'IN' ? input.quantity : -input.quantity);
    if (stock < 0)
      throw new ConflictException(
        options.insufficientMessage?.(product) ?? 'Saldo insuficiente.',
      );
    if (stock > MAX_STOCK)
      throw new ConflictException('El saldo excede el máximo permitido.');
    await manager.getRepository(Product).update({ id: product.id }, { stock });
    const movement = await manager.getRepository(StockMovement).save({
      productId: product.id,
      userId: input.userId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      orderId: input.orderId ?? null,
    });
    return { movement, stock };
  }

  /** Bloquea el producto y aplica el movimiento (uso interno, p. ej. pedidos). */
  async applyMovement(
    manager: EntityManager,
    input: MovementInput,
    options: MovementOptions = {},
  ): Promise<{ movement: StockMovement; stock: number }> {
    const product = await this.lockProduct(manager, input.productId);
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return this.applyLocked(manager, product, input, options);
  }

  async create(
    actor: Identity,
    input: CreateMovementDto,
  ): Promise<{ movement: MovementView; stock: number }> {
    try {
      return await this.source.transaction(async (manager) => {
        const product = await this.lockProduct(manager, input.productId);
        // La sesión pudo vencer o revocarse mientras esperaba el producto.
        const session = await manager.getRepository(Session).findOne({
          where: {
            id: actor.sessionId,
            userId: actor.id,
            revokedAt: IsNull(),
            expiresAt: MoreThan(new Date()),
          },
          relations: { user: true },
        });
        if (!session)
          throw new UnauthorizedException('Credenciales inválidas.');
        if (!product) throw new NotFoundException('Producto no encontrado.');
        const { movement, stock } = await this.applyLocked(manager, product, {
          productId: product.id,
          userId: session.userId,
          type: input.type,
          quantity: input.quantity,
          reason: input.reason,
        });
        movement.user = session.user;
        return { movement: movementView(movement), stock };
      });
    } catch (error) {
      // El usuario fue eliminado entre la revalidación de sesión y el INSERT.
      if (isConstraintViolation(error, '23503', MOVEMENT_USER_FK))
        throw new UnauthorizedException('Credenciales inválidas.');
      if (error instanceof QueryFailedError)
        throw new InternalServerErrorException(
          'No se pudo registrar el movimiento.',
        );
      throw error;
    }
  }

  list(input: ListMovementsDto): Promise<Page<MovementView>> {
    const params = pageParams(input);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const [movements, total] = await manager
        .getRepository(StockMovement)
        .findAndCount({
          select: {
            id: true,
            productId: true,
            type: true,
            quantity: true,
            reason: true,
            orderId: true,
            createdAt: true,
            user: { id: true, username: true },
          },
          relations: { user: true },
          where: {
            ...(input.productId === undefined
              ? {}
              : { productId: input.productId }),
            ...(input.type === undefined ? {} : { type: input.type }),
          },
          order: { createdAt: 'DESC', id: 'DESC' },
          skip: (params.page - 1) * params.limit,
          take: params.limit,
        });
      return buildPage(movements.map(movementView), params, total);
    });
  }
}
