import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { ORDER_STATUSES, OrderStatus } from './entities/order.entity';

const HAS_VISIBLE_CHARACTER = /\S/;
// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const defined = (_: unknown, value: unknown) => value !== undefined;

export class OrderLineDto {
  @ApiProperty({ format: 'uuid', description: 'Producto del menú.' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10, example: 2 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

export class PaymentDto {
  @ApiProperty({ enum: ['tarjeta_demo'], example: 'tarjeta_demo' })
  @IsIn(['tarjeta_demo'])
  method!: 'tarjeta_demo';

  @ApiProperty({
    pattern: '^[0-9]{16}$',
    description:
      'Tarjeta de prueba: `4242424242424242` aprueba y `4000000000000002` rechaza (402). No se guarda.',
    example: '4242424242424242',
  })
  @IsString()
  @Matches(/^[0-9]{16}$/)
  cardNumber!: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderLineDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];

  @ApiProperty({ format: 'uuid', description: 'Punto de entrega (015).' })
  @IsUUID('4')
  pointId!: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 30,
    description: 'Obligatorio si el punto tiene pisos; no se envía si no.',
    example: 2,
  })
  @ValidateIf(defined)
  @IsInt()
  @Min(1)
  @Max(30)
  floor?: number;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: 'Indicación para ubicar al cliente.',
    example: 'Junto a la entrada del salón 302',
  })
  @ValidateIf(defined)
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  deliveryNote?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: 'Nota para la cocina.',
    example: 'Sin azúcar',
  })
  @ValidateIf(defined)
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  note?: string;

  @ApiProperty({ type: PaymentDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;
}

export class CancelOrderDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: 'Obligatorio para admin y operador.',
    example: 'El cliente lo solicitó por teléfono',
  })
  @ValidateIf(defined)
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  reason?: string;
}

export class ListOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @ValidateIf(defined)
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}

export const KITCHEN_STATUSES = [
  'recibido',
  'en_preparacion',
  'listo',
] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export class ListKitchenDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: KITCHEN_STATUSES,
    description:
      'Por defecto se listan `recibido` y `en_preparacion`, el más antiguo primero.',
  })
  @ValidateIf(defined)
  @IsIn(KITCHEN_STATUSES)
  status?: KitchenStatus;
}
