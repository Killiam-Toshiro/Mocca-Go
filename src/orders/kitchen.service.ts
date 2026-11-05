import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Identity } from '../auth/auth.service';
import {
  isConstraintViolation,
  ORDER_EVENT_USER_FK,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { OrderEvent } from './entities/order-event.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderNotificationsService } from './notifications/order-notifications.service';
import { ListKitchenDto } from './orders.dto';
import { ORDER_RELATIONS, OrderView, orderView } from './orders.view';

/** Estados que la cocina atiende por defecto (RN-70). */
const ACTIVE: OrderStatus[] = ['recibido', 'en_preparacion'];

@Injectable()
export class KitchenService {
  constructor(
    private readonly source: DataSource,
    private readonly notifications: OrderNotificationsService,
  ) {}

  /** Cola de cocina: el pedido más antiguo primero. */
  async queue(input: ListKitchenDto): Promise<Page<OrderView>> {
    const params = pageParams(input);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const [orders, total] = await manager.getRepository(Order).findAndCount({
        relations: ORDER_RELATIONS,
        where: { status: input.status ? input.status : In(ACTIVE) },
        order: { number: 'ASC' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });
      return buildPage(orders.map(orderView), params, total);
    });
  }

  start(actor: Identity, id: string): Promise<OrderView> {
    return this.advance(actor, id, 'recibido', 'en_preparacion');
  }

  ready(actor: Identity, id: string): Promise<OrderView> {
    return this.advance(actor, id, 'en_preparacion', 'listo');
  }

  /**
   * Una sola transición hacia adelante (RN-65 a RN-69): bloquea la fila del
   * pedido, verifica el estado de origen, registra el evento y emite el aviso
   * en la misma transacción.
   */
  private async advance(
    actor: Identity,
    id: string,
    from: OrderStatus,
    to: OrderStatus,
  ): Promise<OrderView> {
    try {
      return await this.source.transaction(async (manager) => {
        const orders = manager.getRepository(Order);
        const order = await orders
          .createQueryBuilder('order')
          .where('order.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!order) throw new NotFoundException('Pedido no encontrado.');
        if (order.status !== from)
          throw new ConflictException(
            `El pedido #${order.number} está en estado «${order.status}»; para pasar a «${to}» debe estar en «${from}».`,
          );
        await orders.update(id, { status: to });
        await manager
          .getRepository(OrderEvent)
          .insert({ orderId: id, status: to, userId: actor.id });
        await this.notifications.publish(
          manager,
          { id, number: order.number, customerId: order.customerId },
          to,
        );
        return orderView(
          await orders.findOneOrFail({
            relations: ORDER_RELATIONS,
            where: { id },
          }),
        );
      });
    } catch (error) {
      if (isConstraintViolation(error, '23503', ORDER_EVENT_USER_FK))
        throw new UnauthorizedException('Credenciales inválidas.');
      throw error;
    }
  }
}
