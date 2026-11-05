import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { ORDER_STATUSES } from './entities/order.entity';

export class OrderComponentResponse {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'CAF-CAPU' })
  sku!: string;

  @ApiProperty({ example: 'Capuchino' })
  name!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 10,
    description: 'Por unidad del combo.',
  })
  quantity!: number;
}

export class OrderItemResponse {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'CAF-CAPU' })
  sku!: string;

  @ApiProperty({ example: 'Capuchino (caliente)' })
  name!: string;

  @ApiProperty({ example: 'cafe' })
  category!: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Pesos COP al momento de comprar.',
    example: 4500,
  })
  unitPrice!: number;

  @ApiProperty({ example: 9000 })
  lineTotal!: number;

  @ApiProperty({
    type: [OrderComponentResponse],
    description: '[] si es simple.',
  })
  components!: OrderComponentResponse[];
}

export class OrderDeliveryResponse {
  @ApiProperty({ format: 'uuid' })
  pointId!: string;

  @ApiProperty({ example: 'Edificio A' })
  pointName!: string;

  @ApiProperty({ example: 'Zona 1' })
  zoneName!: string;

  @ApiProperty({ type: 'integer', nullable: true, example: 2 })
  floor!: number | null;

  @ApiProperty({ type: String, nullable: true })
  deliveryNote!: string | null;
}

export class OrderPaymentResponse {
  @ApiProperty({ example: 'tarjeta_demo' })
  method!: string;

  @ApiProperty({ example: '4242' })
  last4!: string;

  @ApiProperty({ enum: ['aprobado', 'reembolsado'] })
  status!: string;
}

export class OrderCustomerResponse {
  @ApiProperty({ example: 'Ana Pérez' })
  name!: string;

  @ApiProperty({ example: '+573001112233' })
  phone!: string;
}

export class OrderEventResponse {
  @ApiProperty({ enum: ORDER_STATUSES })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  at!: Date;
}

export class OrderResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1001, description: 'Consecutivo legible.' })
  number!: number;

  @ApiProperty({ enum: ORDER_STATUSES, example: 'recibido' })
  status!: string;

  @ApiProperty({ description: 'Pesos COP.', example: 9000 })
  total!: number;

  @ApiProperty({ type: [OrderItemResponse] })
  items!: OrderItemResponse[];

  @ApiProperty({ type: OrderDeliveryResponse })
  delivery!: OrderDeliveryResponse;

  @ApiProperty({ type: String, nullable: true, example: 'Sin azúcar' })
  note!: string | null;

  @ApiProperty({ type: OrderPaymentResponse })
  payment!: OrderPaymentResponse;

  @ApiProperty({ type: OrderCustomerResponse })
  customer!: OrderCustomerResponse;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: [OrderEventResponse] })
  events!: OrderEventResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class OrderPageResponse extends PageResponse {
  @ApiProperty({ type: [OrderResponse] })
  data!: OrderResponse[];
}
