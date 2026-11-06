import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Identity } from '../auth/auth.service';
import { addDays, startOfBogotaDay } from '../common/calendar-date';
import {
  isConstraintViolation,
  SURVEY_CUSTOMER_FK,
  SURVEY_ORDER_KEY,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { Order } from '../orders/entities/order.entity';
import { CreateSurveyDto, ListSurveysDto } from './surveys.dto';
import { OrderSurvey } from './entities/order-survey.entity';

export interface SurveyView {
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface SurveyRow extends SurveyView {
  number: number;
  customer: { name: string };
  zoneName: string;
}

const ALREADY = 'Este pedido ya tiene una respuesta de la encuesta.';

@Injectable()
export class SurveysService {
  constructor(private readonly source: DataSource) {}

  /** Responde la encuesta de un pedido propio y entregado (RN-99 a RN-102). */
  async create(
    actor: Identity,
    orderId: string,
    input: CreateSurveyDto,
  ): Promise<SurveyView> {
    try {
      return await this.source.transaction(async (manager) => {
        const order = await manager
          .getRepository(Order)
          .createQueryBuilder('order')
          .where('order.id = :orderId', { orderId })
          .setLock('pessimistic_write')
          .getOne();
        if (!order || order.customerId !== actor.id)
          throw new NotFoundException('Pedido no encontrado.');
        if (order.status !== 'entregado')
          throw new ConflictException(
            `El pedido #${order.number} está en estado «${order.status}»; la encuesta se responde cuando está «entregado».`,
          );
        const repository = manager.getRepository(OrderSurvey);
        if (await repository.existsBy({ orderId }))
          throw new ConflictException(ALREADY);
        const saved = await repository.save(
          repository.create({
            orderId,
            customerId: actor.id,
            rating: input.rating,
            comment: input.comment ?? null,
          }),
        );
        return {
          orderId,
          rating: saved.rating,
          comment: saved.comment,
          createdAt: saved.createdAt,
        };
      });
    } catch (error) {
      if (isConstraintViolation(error, '23505', SURVEY_ORDER_KEY))
        throw new ConflictException(ALREADY);
      if (isConstraintViolation(error, '23503', SURVEY_CUSTOMER_FK))
        throw new UnauthorizedException('Credenciales inválidas.');
      throw error;
    }
  }

  async list(input: ListSurveysDto): Promise<Page<SurveyRow>> {
    if (input.from && input.to && input.from > input.to)
      throw new BadRequestException('from no puede ser posterior a to.');
    const params = pageParams(input);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const query = manager
        .getRepository(OrderSurvey)
        .createQueryBuilder('survey')
        .innerJoinAndSelect('survey.order', 'order')
        .innerJoinAndSelect('order.customer', 'customer')
        .orderBy('survey.createdAt', 'DESC')
        .addOrderBy('survey.id', 'DESC')
        .skip((params.page - 1) * params.limit)
        .take(params.limit);
      if (input.rating)
        query.andWhere('survey.rating = :rating', {
          rating: Number(input.rating),
        });
      if (input.from)
        query.andWhere('survey.createdAt >= :from', {
          from: startOfBogotaDay(input.from),
        });
      if (input.to)
        query.andWhere('survey.createdAt < :to', {
          to: startOfBogotaDay(addDays(input.to, 1)),
        });
      const [surveys, total] = await query.getManyAndCount();
      return buildPage(
        surveys.map((survey) => ({
          orderId: survey.orderId,
          number: survey.order?.number ?? 0,
          rating: survey.rating,
          comment: survey.comment,
          customer: { name: survey.order?.customer?.fullName ?? '' },
          zoneName: survey.order?.zoneName ?? '',
          createdAt: survey.createdAt,
        })),
        params,
        total,
      );
    });
  }
}
