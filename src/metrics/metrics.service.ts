import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { DeliveryPoint } from '../delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../delivery/entities/delivery-zone.entity';
import { OrderEvent } from '../orders/entities/order-event.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderSurvey } from '../surveys/entities/order-survey.entity';
import { MetricsQueryDto } from './metrics.dto';
import {
  fillDays,
  minutes,
  num,
  ON_TIME_MINUTES,
  Period,
  ratio,
  resolvePeriod,
  round,
} from './metrics.calc';
import { MetricsView, TimingView } from './metrics.view';

const TIME_ZONE = 'America/Bogota';
const SOLD = { paymentStatus: 'aprobado' } as const;

type Raw = Record<string, unknown>;

@Injectable()
export class MetricsService {
  constructor(private readonly source: DataSource) {}

  async report(input: MetricsQueryDto, now = new Date()): Promise<MetricsView> {
    const resolved = resolvePeriod(input.from, input.to, now);
    if ('error' in resolved) throw new BadRequestException(resolved.error);
    const { period } = resolved;
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      if (
        input.zoneId &&
        !(await manager.getRepository(DeliveryZone).existsBy({
          id: input.zoneId,
        }))
      )
        throw new NotFoundException('Zona no encontrada.');
      const scope = new Scope(manager, period, input.zoneId);
      const outcomes = await this.outcomes(scope);
      return {
        period: {
          from: period.from,
          to: period.to,
          days: period.days,
          zoneId: input.zoneId ?? null,
        },
        sales: await this.sales(scope, period),
        margin: await this.margin(scope),
        delivery: await this.delivery(scope),
        satisfaction: await this.satisfaction(scope, outcomes.entregado),
        retention: await this.retention(scope),
        outcomes,
      };
    });
  }

  private async sales(scope: Scope, period: Period) {
    const total = await scope
      .orders()
      .andWhere(`o.paymentStatus = :paid`, { paid: SOLD.paymentStatus })
      .select('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .getRawOne<Raw>();
    const orders = num(total?.orders) ?? 0;
    const revenue = num(total?.revenue) ?? 0;
    const daily = await scope
      .orders()
      .andWhere(`o.paymentStatus = :paid`, { paid: SOLD.paymentStatus })
      .select(
        `to_char(o.createdAt AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM-DD')`,
        'day',
      )
      .addSelect('COUNT(*)', 'orders')
      .addSelect('SUM(o.total)', 'revenue')
      .groupBy('day')
      .getRawMany<Raw>();
    return {
      orders,
      revenue,
      averageTicket: orders > 0 ? Math.round(revenue / orders) : 0,
      daily: fillDays(
        period,
        daily.map((row) => ({
          day: String(row.day),
          orders: num(row.orders) ?? 0,
          revenue: num(row.revenue) ?? 0,
        })),
      ),
    };
  }

  private async margin(scope: Scope) {
    const lines = () =>
      scope
        .orders()
        .andWhere(`o.paymentStatus = :paid`, { paid: SOLD.paymentStatus })
        .innerJoin(OrderItem, 'i', 'i.orderId = o.id');
    const total = await lines()
      .select('COALESCE(SUM(i.lineTotal), 0)', 'revenue')
      .addSelect('COALESCE(SUM(i.unitCost * i.quantity), 0)', 'cost')
      .getRawOne<Raw>();
    const byCategory = await lines()
      .select('i.category', 'category')
      .addSelect('SUM(i.lineTotal)', 'revenue')
      .addSelect('SUM(i.unitCost * i.quantity)', 'cost')
      .groupBy('i.category')
      .orderBy('i.category', 'ASC')
      .getRawMany<Raw>();
    const figures = (row: Raw | undefined) => {
      const revenue = num(row?.revenue) ?? 0;
      const variableCost = num(row?.cost) ?? 0;
      return {
        revenue,
        variableCost,
        margin: revenue - variableCost,
        variableCostRate: ratio(variableCost, revenue, 4),
      };
    };
    return {
      ...figures(total),
      byCategory: byCategory.map((row) => ({
        category: String(row.category),
        ...figures(row),
      })),
    };
  }

  /** Tiempos de los pedidos entregados, calculados con los eventos (RN-108). */
  private async delivery(scope: Scope) {
    const timings = (grouped: boolean) => {
      const query = scope.manager
        .createQueryBuilder()
        .from((sub) => {
          const inner = sub
            .select('o.id', 'id')
            .addSelect('o.zoneName', 'zone')
            .addSelect(
              `EXTRACT(EPOCH FROM (MAX(e.createdAt) FILTER (WHERE e.status = 'entregado') - o.createdAt)) / 60`,
              'total',
            )
            .addSelect(
              `EXTRACT(EPOCH FROM (MAX(e.createdAt) FILTER (WHERE e.status = 'listo') - o.createdAt)) / 60`,
              'kitchen',
            )
            .addSelect(
              `EXTRACT(EPOCH FROM (MAX(e.createdAt) FILTER (WHERE e.status = 'en_camino') - MAX(e.createdAt) FILTER (WHERE e.status = 'listo'))) / 60`,
              'waiting',
            )
            .addSelect(
              `EXTRACT(EPOCH FROM (MAX(e.createdAt) FILTER (WHERE e.status = 'entregado') - MAX(e.createdAt) FILTER (WHERE e.status = 'en_camino'))) / 60`,
              'transit',
            )
            .from(Order, 'o')
            .innerJoin(OrderEvent, 'e', 'e.orderId = o.id')
            .where('o.createdAt >= :start AND o.createdAt < :end', {
              start: scope.period.start,
              end: scope.period.end,
            })
            .andWhere(`o.status = 'entregado'`)
            .groupBy('o.id');
          if (scope.zoneId)
            inner
              .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
              .andWhere('p.zoneId = :zoneId', { zoneId: scope.zoneId });
          return inner;
        }, 't')
        .select('COUNT(*)', 'delivered')
        .addSelect('AVG(t.total)', 'avg')
        .addSelect(
          'percentile_cont(0.5) WITHIN GROUP (ORDER BY t.total)',
          'p50',
        )
        .addSelect(
          'percentile_cont(0.9) WITHIN GROUP (ORDER BY t.total)',
          'p90',
        )
        .addSelect('AVG(t.kitchen)', 'kitchen')
        .addSelect('AVG(t.waiting)', 'waiting')
        .addSelect('AVG(t.transit)', 'transit')
        .addSelect(
          `COUNT(*) FILTER (WHERE t.transit <= ${ON_TIME_MINUTES})`,
          'onTime',
        );
      if (grouped)
        query.addSelect('t.zone', 'zone').groupBy('t.zone').orderBy('t.zone');
      return query;
    };
    const view = (row: Raw | undefined) => {
      const delivered = num(row?.delivered) ?? 0;
      return {
        delivered,
        onTimeRate: ratio(num(row?.onTime) ?? 0, delivered, 4),
        totalMinutes: {
          average: minutes(row?.avg),
          median: minutes(row?.p50),
          p90: minutes(row?.p90),
        },
        stageMinutes: {
          kitchen: minutes(row?.kitchen),
          waiting: minutes(row?.waiting),
          delivery: minutes(row?.transit),
        },
      } satisfies TimingView;
    };
    const total = await timings(false).getRawOne<Raw>();
    const zones = await timings(true).getRawMany<Raw>();
    return {
      onTimeThresholdMinutes: ON_TIME_MINUTES,
      ...view(total),
      byZone: zones.map((row) => ({
        zoneName: String(row.zone),
        ...view(row),
      })),
    };
  }

  private async satisfaction(scope: Scope, delivered: number) {
    const rows = scope.manager
      .getRepository(OrderSurvey)
      .createQueryBuilder('s')
      .innerJoin(Order, 'o', 'o.id = s.orderId')
      .where('o.createdAt >= :start AND o.createdAt < :end', {
        start: scope.period.start,
        end: scope.period.end,
      })
      .select('s.rating', 'rating')
      .addSelect('COUNT(*)', 'count');
    if (scope.zoneId)
      rows
        .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
        .andWhere('p.zoneId = :zoneId', { zoneId: scope.zoneId });
    const found = await rows.groupBy('s.rating').getRawMany<Raw>();
    const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    let responses = 0;
    let sum = 0;
    for (const row of found) {
      const rating = Number(row.rating);
      const count = num(row.count) ?? 0;
      distribution[String(rating) as keyof typeof distribution] = count;
      responses += count;
      sum += rating * count;
    }
    return {
      responses,
      average: responses > 0 ? round(sum / responses, 1) : null,
      responseRate: ratio(responses, delivered, 4),
      distribution,
    };
  }

  private async retention(scope: Scope) {
    const row = await scope.manager
      .createQueryBuilder()
      .from((sub) => {
        const inner = sub
          .select('o.customerId', 'customer')
          .addSelect('COUNT(*)', 'n')
          .from(Order, 'o')
          .where('o.createdAt >= :start AND o.createdAt < :end', {
            start: scope.period.start,
            end: scope.period.end,
          })
          .andWhere('o.paymentStatus = :paid', { paid: SOLD.paymentStatus })
          .groupBy('o.customerId');
        if (scope.zoneId)
          inner
            .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
            .andWhere('p.zoneId = :zoneId', { zoneId: scope.zoneId });
        return inner;
      }, 'c')
      .select('COUNT(*)', 'customers')
      .addSelect('COUNT(*) FILTER (WHERE c.n >= 2)', 'repeat')
      .getRawOne<Raw>();
    const customers = num(row?.customers) ?? 0;
    const repeatCustomers = num(row?.repeat) ?? 0;
    return {
      customers,
      repeatCustomers,
      repeatRate: ratio(repeatCustomers, customers, 4),
    };
  }

  private async outcomes(scope: Scope) {
    const rows = await scope
      .orders()
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<Raw>();
    const result = { entregado: 0, no_entregado: 0, cancelado: 0, enCurso: 0 };
    for (const row of rows) {
      const count = num(row.count) ?? 0;
      const status = String(row.status);
      if (status === 'entregado') result.entregado += count;
      else if (status === 'no_entregado') result.no_entregado += count;
      else if (status === 'cancelado') result.cancelado += count;
      else result.enCurso += count;
    }
    return result;
  }
}

/** Periodo y zona compartidos por todas las consultas de un informe. */
class Scope {
  constructor(
    readonly manager: EntityManager,
    readonly period: Period,
    readonly zoneId: string | undefined,
  ) {}

  /** Pedidos creados en el periodo (y en la zona, si se filtra). */
  orders(): SelectQueryBuilder<Order> {
    const query = this.manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.createdAt >= :start AND o.createdAt < :end', {
        start: this.period.start,
        end: this.period.end,
      });
    if (this.zoneId)
      query
        .innerJoin(DeliveryPoint, 'p', 'p.id = o.pointId')
        .andWhere('p.zoneId = :zoneId', { zoneId: this.zoneId });
    return query;
  }
}
