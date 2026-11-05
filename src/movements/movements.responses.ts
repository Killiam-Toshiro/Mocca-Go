import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { MOVEMENT_TYPES, MovementType } from './entities/stock-movement.entity';

export class MovementUserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'operador' })
  username!: string;
}

export class MovementResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ enum: MOVEMENT_TYPES, example: 'IN' })
  type!: MovementType;

  @ApiProperty({ minimum: 1, example: 10 })
  quantity!: number;

  @ApiProperty({ example: 'Compra a proveedor' })
  reason!: string;

  @ApiProperty({
    type: MovementUserResponse,
    description: 'Responsable, tomado de la sesión.',
  })
  user!: MovementUserResponse;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class CreatedMovementResponse {
  @ApiProperty({ type: MovementResponse })
  movement!: MovementResponse;

  @ApiProperty({
    minimum: 0,
    description: 'Saldo confirmado por esta transacción.',
    example: 10,
  })
  stock!: number;
}

export class MovementPageResponse extends PageResponse {
  @ApiProperty({ type: [MovementResponse] })
  data!: MovementResponse[];
}
