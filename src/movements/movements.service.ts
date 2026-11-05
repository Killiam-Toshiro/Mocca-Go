import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, IsNull, MoreThan, QueryFailedError } from 'typeorm';
import { Identity } from '../auth/auth.service';
import { Session } from '../auth/entities/session.entity';
import {
  isConstraintViolation,
  MOVEMENT_USER_FK,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { Product } from '../products/entities/products.entity';
import { StockMovement } from './entities/stock-movement.entity';
import {
  CreateMovementDto,
  ListMovementsDto,
  MAX_STOCK,
} from './movements.dto';
import { MovementView, movementView } from './movement.view';

@Injectable()
export class MovementsService {
  constructor(private readonly source: DataSource) {}

  async create(
    actor: Identity,
    input: CreateMovementDto,
  ): Promise<{ movement: MovementView; stock: number }> {
    try {
      return await this.source.transaction(async (manager) => {
        const products = manager.getRepository(Product);
        const product = await products
          .createQueryBuilder('product')
          .where('product.id = :id', { id: input.productId })
          .setLock('pessimistic_write')
          .getOne();
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
        if (!product.active)
          throw new ConflictException('El producto está inactivo.');
        const stock =
          product.stock +
          (input.type === 'IN' ? input.quantity : -input.quantity);
        if (stock < 0) throw new ConflictException('Saldo insuficiente.');
        if (stock > MAX_STOCK)
          throw new ConflictException('El saldo excede el máximo permitido.');
        await products.update({ id: product.id }, { stock });
        const movement = await manager.getRepository(StockMovement).save({
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
