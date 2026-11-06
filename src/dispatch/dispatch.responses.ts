import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { OrderResponse } from '../orders/orders.responses';
import { ROUND_STATUSES } from './entities/dispatch-round.entity';

export class ZoneQueueResponse {
  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ example: 'Zona 1' })
  zoneName!: string;

  @ApiProperty({
    example: 1042,
    description: 'Número del pedido `listo` más antiguo de la zona.',
  })
  oldestNumber!: number;

  @ApiProperty({
    type: [OrderResponse],
    description: 'Del más antiguo al más nuevo.',
  })
  orders!: OrderResponse[];
}

export class QueueResponse {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Zona del pedido `listo` más antiguo; `null` si no hay pedidos.',
  })
  suggestedZoneId!: string | null;

  @ApiProperty({
    type: [ZoneQueueResponse],
    description: 'Zonas ordenadas por su pedido más antiguo.',
  })
  zones!: ZoneQueueResponse[];
}

export class RoundZoneResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zona 1' })
  name!: string;
}

export class RoundCourierResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Carlos Gómez' })
  fullName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+573001234500' })
  phone!: string | null;
}

export class RoundResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ROUND_STATUSES, example: 'activa' })
  status!: string;

  @ApiProperty({ type: RoundZoneResponse })
  zone!: RoundZoneResponse;

  @ApiProperty({ type: RoundCourierResponse })
  courier!: RoundCourierResponse;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Salida más 15 minutos (constante).',
  })
  etaAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ type: [OrderResponse] })
  orders!: OrderResponse[];
}

export class RoundPageResponse extends PageResponse {
  @ApiProperty({ type: [RoundResponse] })
  data!: RoundResponse[];
}
