import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const HAS_VISIBLE_CHARACTER = /\S/;
// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;

const defined = (_: unknown, value: unknown) => value !== undefined;
const notNullish = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;

export class CreateZoneDto {
  @ApiProperty({ minLength: 1, maxLength: 60, example: 'Zona 1' })
  @IsString()
  @Length(1, 60)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name!: string;
}

export class UpdateZoneDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 60, example: 'Zona 1' })
  @ValidateIf(defined)
  @IsString()
  @Length(1, 60)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @ValidateIf(defined)
  @IsBoolean()
  active?: boolean;
}

export class CreatePointDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  zoneId!: string;

  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Edificio A' })
  @IsString()
  @Length(1, 80)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 200,
    example: 'Se entrega en la plazoleta',
  })
  @ValidateIf(notNullish)
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  hint?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 30,
    description: 'Número de pisos; null o ausente si el lugar no tiene pisos.',
    example: 4,
  })
  @ValidateIf(notNullish)
  @IsInt()
  @Min(1)
  @Max(30)
  floors?: number | null;
}

export class UpdatePointDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Mueve el punto.' })
  @ValidateIf(defined)
  @IsUUID('4')
  zoneId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 80, example: 'Edificio A' })
  @ValidateIf(defined)
  @IsString()
  @Length(1, 80)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 200,
    description: 'null borra la indicación.',
  })
  @ValidateIf(notNullish)
  @IsString()
  @Length(1, 200)
  @Matches(HAS_VISIBLE_CHARACTER)
  @Matches(NO_NUL)
  hint?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 30,
    description: 'null significa «sin pisos».',
  })
  @ValidateIf(notNullish)
  @IsInt()
  @Min(1)
  @Max(30)
  floors?: number | null;

  @ApiPropertyOptional({ example: true })
  @ValidateIf(defined)
  @IsBoolean()
  active?: boolean;
}
