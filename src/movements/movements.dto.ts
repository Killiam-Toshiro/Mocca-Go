import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { MOVEMENT_TYPES, MovementType } from './entities/stock-movement.entity';

export const MAX_STOCK = 2147483647;

export class CreateMovementDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 del producto.' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({
    enum: MOVEMENT_TYPES,
    description: '`IN` suma al saldo y `OUT` resta; nunca queda negativo.',
    example: 'IN',
  })
  @IsIn(MOVEMENT_TYPES)
  type!: MovementType;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MAX_STOCK,
    description: 'Número JSON entero, no texto.',
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_STOCK)
  quantity!: number;

  @ApiProperty({
    minLength: 1,
    maxLength: 300,
    description: 'Al menos un carácter visible; sin NUL.',
    example: 'Compra a proveedor',
  })
  @IsString()
  @Length(1, 300)
  @Matches(/\S/)
  // eslint-disable-next-line no-control-regex -- PostgreSQL rechaza NUL en texto
  @Matches(/^[^\u0000]*$/)
  reason!: string;
}

export class ListMovementsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por producto.' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({
    enum: MOVEMENT_TYPES,
    description: 'Filtra por tipo.',
  })
  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  type?: MovementType;
}
