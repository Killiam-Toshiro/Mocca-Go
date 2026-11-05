import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { PRODUCT_CATEGORIES } from './entities/products.entity';

export class ComponentResponse {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'CAF-CAPU' })
  sku!: string;

  @ApiProperty({ example: 'Capuchino' })
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 1 })
  quantity!: number;
}

export class MenuComponentResponse {
  @ApiProperty({ example: 'Capuchino' })
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 1 })
  quantity!: number;
}

export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CAF-CAPU' })
  sku!: string;

  @ApiProperty({ example: 'Capuchino' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Café con leche' })
  description!: string | null;

  @ApiProperty({ enum: PRODUCT_CATEGORIES, example: 'cafe' })
  category!: string;

  @ApiProperty({ minimum: 0, description: 'Pesos COP.', example: 4500 })
  price!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Costo variable unitario; en un combo se calcula.',
    example: 1600,
  })
  cost!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`cost ÷ price × 100` con un decimal; null si el precio es 0.',
    example: 35.6,
  })
  costPercent!: number | null;

  @ApiProperty({
    description: 'Interruptor manual «agotado» de la cocina.',
    example: false,
  })
  soldOut!: boolean;

  @ApiProperty({
    description:
      'Calculado: activo, no agotado, con precio y con saldo (en un combo, saldo de todos sus componentes).',
    example: true,
  })
  available!: boolean;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({
    minimum: 0,
    description:
      'Saldo de solo lectura; solo cambia con movimientos. En un combo es calculado.',
    example: 0,
  })
  stock!: number;

  @ApiProperty({ type: [ComponentResponse], description: '[] si es simple.' })
  components!: ComponentResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ProductPageResponse extends PageResponse {
  @ApiProperty({ type: [ProductResponse] })
  data!: ProductResponse[];
}

export class MenuItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CAF-CAPU' })
  sku!: string;

  @ApiProperty({ example: 'Capuchino' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Café con leche' })
  description!: string | null;

  @ApiProperty({ enum: PRODUCT_CATEGORIES, example: 'cafe' })
  category!: string;

  @ApiProperty({ minimum: 0, description: 'Pesos COP.', example: 4500 })
  price!: number;

  @ApiProperty({ example: true })
  available!: boolean;

  @ApiProperty({ type: [MenuComponentResponse] })
  components!: MenuComponentResponse[];
}

export class MenuResponse {
  @ApiProperty({ type: [MenuItemResponse] })
  data!: MenuItemResponse[];
}
