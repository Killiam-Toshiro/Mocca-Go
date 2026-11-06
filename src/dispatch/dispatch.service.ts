import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Identity } from '../auth/auth.service';
import {
  isConstraintViolation,
  ORDER_EVENT_USER_FK,
  ROUND_COURIER_FK,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { DeliveryPoint } from '../delivery/entities/delivery-point.entity';
import { OrderEvent } from '../orders/entities/order-event.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderNotificationsService } from '../orders/notifications/order-notifications.service';
import { ORDER_RELATIONS, orderView } from '../orders/orders.view';
import { User } from '../users/entities/user.entity';
import {
  etaFrom,
  groupByZone,
  MAX_ACTIVE_ROUNDS,
  MAX_ROUND_ORDERS,
} from './dispatch.calc';
import { CreateRoundDto, FailOrderDto, ListRoundsDto } from './dispatch.dto';
import { QueueView, RoundView, roundView } from './dispatch.view';
import { DispatchRound } from './entities/dispatch-round.entity';

interface LockedOrder {
  id: string;
  zone_id: string;
  zone_name: string;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly source: DataSource,
    private readonly notifications: OrderNotificationsService,
  ) {}

  /** Pedidos `listo` agrupados por zona (RN-83). */
  async queue(): Promise<QueueView> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const rows = await manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
        .select(['o.id AS id', 'o.number AS number', 'p.zoneId AS zone_id'])
        .where('o.status = :status', { status: 'listo' })
        .orderBy('o.number', 'ASC')
        .getRawMany<{ id: string; number: number; zone_id: string }>();
      const orders = await manager.getRepository(Order).find({
        relations: ORDER_RELATIONS,
        where: { id: In(rows.map((row) => row.id)) },
      });
      const byId = new Map(orders.map((order) => [order.id, order]));
      const entries = rows.flatMap((row) => {
        const order = byId.get(row.id);
        return order
          ? [
              {
                zoneId: row.zone_id,
                zoneName: order.zoneName,
                number: order.number,
                order: orderView(order),
              },
            ]
          : [];
      });
      return groupByZone(entries);
    });
  }

  /** Crea la ronda y sale: los pedidos pasan a `en_camino` (RN-84 a RN-87). */
  async createRound(
    actor: Identity,
    input: CreateRoundDto,
  ): Promise<RoundView> {
    try {
      return await this.source.transaction(async (manager) => {
        // La fila del repartidor serializa sus propias rondas (límite de RN-85).
        const courier = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: actor.id })
          .setLock('pessimistic_write')
          .getOne();
        if (!courier)
          throw new UnauthorizedException('Credenciales inválidas.');
        const missing = [
          courier.fullName ? null : 'el nombre completo',
          courier.phone ? null : 'el teléfono',
        ].filter(Boolean);
        if (missing.length > 0)
          throw new ConflictException(
            `Tu perfil de repartidor no tiene ${missing.join(' ni ')}; pídele al administrador que lo complete.`,
          );
        const active = await manager.getRepository(DispatchRound).count({
          where: { courierId: actor.id, status: 'activa' },
        });
        if (active >= MAX_ACTIVE_ROUNDS)
          throw new ConflictException(
            `Ya tienes ${MAX_ACTIVE_ROUNDS} rondas activas; termina una antes de salir con otra.`,
          );

        const picked = input.orderIds
          ? await this.lockChosen(manager, input.orderIds)
          : await this.lockSuggested(manager);

        const startedAt = new Date();
        const round = await manager.getRepository(DispatchRound).save(
          manager.getRepository(DispatchRound).create({
            courierId: actor.id,
            zoneId: picked[0].zone_id,
            zoneName: picked[0].zone_name,
            status: 'activa',
            startedAt,
            etaAt: etaFrom(startedAt),
            finishedAt: null,
          }),
        );
        const ids = picked.map((row) => row.id);
        const orders = manager.getRepository(Order);
        await orders.update(
          { id: In(ids) },
          { status: 'en_camino', roundId: round.id },
        );
        const moved = await orders.find({ where: { id: In(ids) } });
        for (const order of moved) {
          await manager.getRepository(OrderEvent).insert({
            orderId: order.id,
            status: 'en_camino',
            userId: actor.id,
          });
          await this.notifications.publish(
            manager,
            {
              id: order.id,
              number: order.number,
              customerId: order.customerId,
            },
            'en_camino',
          );
        }
        return this.load(manager, round.id);
      });
    } catch (error) {
      throw this.mapUserFk(error);
    }
  }

  deliver(actor: Identity, id: string): Promise<RoundView['orders'][number]> {
    return this.close(actor, id, 'entregado', null);
  }

  fail(
    actor: Identity,
    id: string,
    input: FailOrderDto,
  ): Promise<RoundView['orders'][number]> {
    return this.close(actor, id, 'no_entregado', input.reason.trim());
  }

  async rounds(
    actor: Identity,
    input: ListRoundsDto,
  ): Promise<Page<RoundView>> {
    const params = pageParams(input);
    const courier = actor.role === 'repartidor';
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const repo = manager.getRepository(DispatchRound);
      const [rounds, total] = await repo.findAndCount({
        relations: { courier: true },
        where: {
          ...(courier ? { courierId: actor.id } : {}),
          ...(input.status
            ? { status: input.status }
            : courier
              ? { status: 'activa' as const }
              : {}),
        },
        order: { startedAt: 'DESC', id: 'DESC' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });
      const views = await this.withOrders(manager, rounds);
      return buildPage(views, params, total);
    });
  }

  async round(actor: Identity, id: string): Promise<RoundView> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const round = await manager.getRepository(DispatchRound).findOne({
        relations: { courier: true },
        where: { id },
      });
      if (
        !round ||
        (actor.role === 'repartidor' && round.courierId !== actor.id)
      )
        throw new NotFoundException('Ronda no encontrada.');
      return (await this.withOrders(manager, [round]))[0];
    });
  }

  /** Ruta propia: bloquea por id (orden estable) y valida existencia, estado y zona. */
  private async lockChosen(
    manager: EntityManager,
    orderIds: string[],
  ): Promise<LockedOrder[]> {
    const sorted = [...orderIds].sort();
    const rows = await this.lockable(manager)
      .addSelect(['o.status AS status', 'o.number AS number'])
      .where('o.id IN (:...ids)', { ids: sorted })
      .orderBy('o.id', 'ASC')
      .getRawMany<LockedOrder & { status: string; number: number }>();
    const found = new Map(rows.map((row) => [row.id, row]));
    const absent = sorted.filter((id) => !found.has(id));
    if (absent.length > 0)
      throw new NotFoundException(
        `Pedido no encontrado: ${absent.join(', ')}.`,
      );
    const notReady = rows.filter((row) => row.status !== 'listo');
    if (notReady.length > 0)
      throw new ConflictException(
        `Los pedidos ${notReady.map((row) => `#${row.number}`).join(', ')} ya no están en estado «listo».`,
      );
    const zones = [...new Set(rows.map((row) => row.zone_name))];
    if (new Set(rows.map((row) => row.zone_id)).size > 1)
      throw new ConflictException(
        `Una ronda es de una sola zona; elegiste pedidos de: ${zones.join(', ')}.`,
      );
    return rows;
  }

  /** Sugerencia: zona del `listo` más antiguo libre y hasta 5 de sus pedidos (RN-84). */
  private async lockSuggested(manager: EntityManager): Promise<LockedOrder[]> {
    const first = await this.lockable(manager)
      .where('o.status = :status', { status: 'listo' })
      .orderBy('o.number', 'ASC')
      .limit(1)
      .setOnLocked('skip_locked')
      .getRawMany<LockedOrder>();
    if (first.length === 0)
      throw new ConflictException('No hay pedidos listos para despachar.');
    const rows = await this.lockable(manager)
      .where('o.status = :status AND p.zoneId = :zone', {
        status: 'listo',
        zone: first[0].zone_id,
      })
      .orderBy('o.number', 'ASC')
      .limit(MAX_ROUND_ORDERS)
      .setOnLocked('skip_locked')
      .getRawMany<LockedOrder>();
    return rows.length > 0 ? rows : first;
  }

  /** Pedidos con su zona, bloqueando solo las filas de `orders`. */
  private lockable(manager: EntityManager) {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
      .select(['o.id AS id', 'p.zoneId AS zone_id', 'o.zoneName AS zone_name'])
      .setLock('pessimistic_write', undefined, ['o']);
  }

  /** Cierra un pedido de una ronda propia y, si era el último, la ronda (RN-88 a RN-91). */
  private async close(
    actor: Identity,
    id: string,
    to: 'entregado' | 'no_entregado',
    reason: string | null,
  ) {
    try {
      return await this.source.transaction(async (manager) => {
        const orders = manager.getRepository(Order);
        const order = await orders
          .createQueryBuilder('order')
          .where('order.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        const round = order?.roundId
          ? await manager
              .getRepository(DispatchRound)
              .createQueryBuilder('round')
              .where('round.id = :id', { id: order.roundId })
              .setLock('pessimistic_write')
              .getOne()
          : null;
        if (!order || !round || round.courierId !== actor.id)
          throw new NotFoundException('Pedido no encontrado.');
        if (order.status !== 'en_camino')
          throw new ConflictException(
            `El pedido #${order.number} está en estado «${order.status}»; solo uno «en_camino» se puede cerrar.`,
          );
        await orders.update(id, { status: to, failureReason: reason });
        await manager
          .getRepository(OrderEvent)
          .insert({ orderId: id, status: to, userId: actor.id });
        await this.notifications.publish(
          manager,
          { id, number: order.number, customerId: order.customerId },
          to,
        );
        const pending = await orders.count({
          where: { roundId: round.id, status: 'en_camino' },
        });
        if (pending === 0)
          await manager
            .getRepository(DispatchRound)
            .update(round.id, { status: 'finalizada', finishedAt: new Date() });
        return orderView(
          await orders.findOneOrFail({
            relations: ORDER_RELATIONS,
            where: { id },
          }),
        );
      });
    } catch (error) {
      throw this.mapUserFk(error);
    }
  }

  private mapUserFk(error: unknown): unknown {
    if (
      isConstraintViolation(error, '23503', ORDER_EVENT_USER_FK) ||
      isConstraintViolation(error, '23503', ROUND_COURIER_FK)
    )
      return new UnauthorizedException('Credenciales inválidas.');
    return error;
  }

  private async load(manager: EntityManager, id: string): Promise<RoundView> {
    const round = await manager.getRepository(DispatchRound).findOneOrFail({
      relations: { courier: true },
      where: { id },
    });
    return (await this.withOrders(manager, [round]))[0];
  }

  private async withOrders(
    manager: EntityManager,
    rounds: DispatchRound[],
  ): Promise<RoundView[]> {
    if (rounds.length === 0) return [];
    const orders = await manager.getRepository(Order).find({
      relations: ORDER_RELATIONS,
      where: { roundId: In(rounds.map((round) => round.id)) },
    });
    return rounds.map((round) =>
      roundView(
        round,
        orders.filter((order) => order.roundId === round.id).map(orderView),
      ),
    );
  }
}
