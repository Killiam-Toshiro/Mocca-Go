import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { MAX_ROUND_ORDERS } from './dispatch.calc';
import { ROUND_STATUSES, RoundStatus } from './entities/dispatch-round.entity';

const HAS_VISIBLE_CHARACTER = /\S/;
// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const defined = (_: unknown, value: unknown) => value !== undefined;

export class CreateRoundDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_ROUND_ORDERS,
    description:
      'Ruta propia: pedidos `listo` de una sola zona. Si se omite, se usa la sugerencia (zona del pedido `listo` más antiguo y hasta 5 de sus pedidos).',
  })
  @ValidateIf(defined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ROUND_ORDERS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderIds?: string[];
}

export class FailOrderDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 200,
    example: 'El cliente no estaba en el punto de entrega',
  })
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  reason!: string;
}

export class ListRoundsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ROUND_STATUSES,
    description:
      'El repartidor ve por defecto sus rondas `activa`; admin y operador ven todas si no se filtra.',
  })
  @ValidateIf(defined)
  @IsIn(ROUND_STATUSES)
  status?: RoundStatus;
}
