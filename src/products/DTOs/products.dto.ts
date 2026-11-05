import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

// Idéntico al CHECK products_sku_format de la migración inicial.
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,47}$/;
// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const HAS_VISIBLE_CHARACTER = /\S/;

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
}

export class UpdateProductDto {
  // `name` no admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 120,
    description: 'No admite null. Envía al menos `name` o `description`.',
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
}
