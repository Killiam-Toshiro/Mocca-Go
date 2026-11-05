import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';

export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INV-100' })
  sku!: string;

  @ApiProperty({ example: 'Cable HDMI' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Dos metros' })
  description!: string | null;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({
    minimum: 0,
    description: 'Saldo de solo lectura; solo cambia con movimientos.',
    example: 0,
  })
  stock!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ProductPageResponse extends PageResponse {
  @ApiProperty({ type: [ProductResponse] })
  data!: ProductResponse[];
}
