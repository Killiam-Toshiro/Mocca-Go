import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import {
  PRODUCT_CATEGORIES,
  ProductCategory,
} from '../entities/products.entity';

// Idéntico al CHECK products_sku_format de la migración inicial.
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,47}$/;
// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const HAS_VISIBLE_CHARACTER = /\S/;

const MAX_MONEY = 1_000_000;

export class ComponentInputDto {
  @ApiProperty({ format: 'uuid', description: 'Producto simple y activo.' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10, example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

export class CreateProductDto {
  @ApiProperty({
    pattern: SKU_PATTERN.source,
    minLength: 1,
    maxLength: 48,
    description: 'Mayúsculas, dígitos y `._-`; único e inmutable.',
    example: 'INV-100',
  })
  @IsString()
  @Matches(SKU_PATTERN)
  sku!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 120,
    description: 'Al menos un carácter visible; sin NUL.',
    example: 'Cable HDMI',
  })
  @IsString()
  @Length(1, 120)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 500,
    description: 'Opcional; sin NUL.',
    example: 'Dos metros',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(NO_NUL)
  description?: string | null;

  @ApiProperty({ enum: PRODUCT_CATEGORIES, example: 'cafe' })
  @IsIn(PRODUCT_CATEGORIES)
  category!: ProductCategory;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_MONEY,
    description:
      'Pesos COP, entero. Obligatorio en productos simples. En un combo es opcional: si se omite, vale la suma de los precios de sus componentes al crearlo.',
    example: 4500,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY)
  price?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: MAX_MONEY,
    description:
      'Costo variable unitario en pesos COP. Obligatorio en productos simples; no se admite en combos (se calcula).',
    example: 1600,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  cost?: number;

  @ApiPropertyOptional({
    type: [ComponentInputDto],
    description:
      'Obligatorio en combos (2 a 10 productos distintos); no se admite en productos simples.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ComponentInputDto)
  components?: ComponentInputDto[];
}

export class UpdateProductDto {
  // `name` no admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 120,
    description:
      'No admite null. Envía al menos uno de `name`, `description`, `category`, `price` o `cost`.',
    example: 'Cable HDMI 2 m',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 120)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name?: string;

  // `description: null` borra la descripción.
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 500,
    description: '`null` borra la descripción; sin NUL.',
    example: 'Dos metros',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(NO_NUL)
  description?: string | null;

  @ApiPropertyOptional({
    enum: PRODUCT_CATEGORIES,
    description: 'No se puede pasar hacia ni desde `combo`.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(PRODUCT_CATEGORIES)
  category?: ProductCategory;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_MONEY,
    example: 4500,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY)
  price?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: MAX_MONEY,
    description: 'No se admite en combos (se calcula).',
    example: 1600,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  cost?: number;
}

export class SetSoldOutDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  soldOut!: boolean;
}

export class ReplaceComponentsDto {
  @ApiProperty({
    type: [ComponentInputDto],
    description: '2 a 10 productos simples, activos y distintos.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ComponentInputDto)
  components!: ComponentInputDto[];
}

export class SetProductStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active!: boolean;
}

export class ListProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 64,
    description: 'Texto parcial en SKU o nombre, sin distinguir mayúsculas.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(NO_NUL)
  search?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Filtra por estado; sin él se listan activos e inactivos.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';

  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES })
  @IsOptional()
  @IsIn(PRODUCT_CATEGORIES)
  category?: ProductCategory;
}
