import { ApiProperty } from '@nestjs/swagger';

class MetricsPeriodResponse {
  @ApiProperty({ example: '2026-10-07' })
  from!: string;

  @ApiProperty({ example: '2026-11-05' })
  to!: string;

  @ApiProperty({ example: 30 })
  days!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  zoneId!: string | null;
}

class DailyPointResponse {
  @ApiProperty({ example: '2026-10-07' })
  date!: string;

  @ApiProperty({ example: 4 })
  orders!: number;

  @ApiProperty({ example: 34800 })
  revenue!: number;
}

class SalesResponse {
  @ApiProperty({ example: 120, description: 'Pedidos con pago aprobado.' })
  orders!: number;

  @ApiProperty({ example: 1044000 })
  revenue!: number;

  @ApiProperty({ example: 8700 })
  averageTicket!: number;

  @ApiProperty({ type: [DailyPointResponse], description: 'Con ceros.' })
  daily!: DailyPointResponse[];
}

class MarginFiguresResponse {
  @ApiProperty({ example: 500000 })
  revenue!: number;

  @ApiProperty({ example: 150000 })
  variableCost!: number;

  @ApiProperty({ example: 350000 })
  margin!: number;

  @ApiProperty({ type: Number, nullable: true, example: 0.3 })
  variableCostRate!: number | null;
}

class CategoryMarginResponse extends MarginFiguresResponse {
  @ApiProperty({ example: 'cafe' })
  category!: string;
}

class MarginResponse extends MarginFiguresResponse {
  @ApiProperty({ type: [CategoryMarginResponse] })
  byCategory!: CategoryMarginResponse[];
}

class TotalMinutesResponse {
  @ApiProperty({ type: Number, nullable: true, example: 21.4 })
  average!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 20 })
  median!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 29.5 })
  p90!: number | null;
}

class StageMinutesResponse {
  @ApiProperty({ type: Number, nullable: true, example: 8.1 })
  kitchen!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 4.2 })
  waiting!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 9.1 })
  delivery!: number | null;
}

class TimingResponse {
  @ApiProperty({ example: 100 })
  delivered!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.91,
    description: 'Proporción de entregas con reparto de 15 minutos o menos.',
  })
  onTimeRate!: number | null;

  @ApiProperty({ type: TotalMinutesResponse })
  totalMinutes!: TotalMinutesResponse;

  @ApiProperty({ type: StageMinutesResponse })
  stageMinutes!: StageMinutesResponse;
}

class ZoneTimingResponse extends TimingResponse {
  @ApiProperty({ example: 'Zona 1' })
  zoneName!: string;
}

class DeliveryResponse extends TimingResponse {
  @ApiProperty({ example: 15 })
  onTimeThresholdMinutes!: number;

  @ApiProperty({ type: [ZoneTimingResponse] })
  byZone!: ZoneTimingResponse[];
}

class DistributionResponse {
  @ApiProperty({ example: 1 })
  '1'!: number;

  @ApiProperty({ example: 2 })
  '2'!: number;

  @ApiProperty({ example: 6 })
  '3'!: number;

  @ApiProperty({ example: 20 })
  '4'!: number;

  @ApiProperty({ example: 41 })
  '5'!: number;
}

class SatisfactionResponse {
  @ApiProperty({ example: 70 })
  responses!: number;

  @ApiProperty({ type: Number, nullable: true, example: 4.4 })
  average!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.7 })
  responseRate!: number | null;

  @ApiProperty({ type: DistributionResponse })
  distribution!: DistributionResponse;
}

class RetentionResponse {
  @ApiProperty({ example: 60 })
  customers!: number;

  @ApiProperty({ example: 49 })
  repeatCustomers!: number;

  @ApiProperty({ type: Number, nullable: true, example: 0.8167 })
  repeatRate!: number | null;
}

class OutcomesResponse {
  @ApiProperty({ example: 100 })
  entregado!: number;

  @ApiProperty({ example: 3 })
  no_entregado!: number;

  @ApiProperty({ example: 6 })
  cancelado!: number;

  @ApiProperty({
    example: 5,
    description: 'recibido, en_preparacion, listo o en_camino.',
  })
  enCurso!: number;
}

export class MetricsResponse {
  @ApiProperty({ type: MetricsPeriodResponse })
  period!: MetricsPeriodResponse;

  @ApiProperty({ type: SalesResponse })
  sales!: SalesResponse;

  @ApiProperty({ type: MarginResponse })
  margin!: MarginResponse;

  @ApiProperty({ type: DeliveryResponse })
  delivery!: DeliveryResponse;

  @ApiProperty({ type: SatisfactionResponse })
  satisfaction!: SatisfactionResponse;

  @ApiProperty({ type: RetentionResponse })
  retention!: RetentionResponse;

  @ApiProperty({ type: OutcomesResponse })
  outcomes!: OutcomesResponse;
}
