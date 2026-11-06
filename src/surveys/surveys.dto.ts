import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../common/calendar-date';
import { PaginationQueryDto } from '../common/pagination';
import { trimmed } from '../customers/customers.dto';

// PostgreSQL no admite el carácter NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const defined = (_: unknown, value: unknown) => value !== undefined;

export class CreateSurveyDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 300,
    example: 'Llegó caliente y rápido',
  })
  @Transform(trimmed)
  @ValidateIf(defined)
  @IsString()
  @Length(1, 300)
  @Matches(NO_NUL)
  comment?: string;
}

export class ListSurveysDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 5 })
  @ValidateIf(defined)
  @Matches(/^[1-5]$/)
  rating?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Desde este día, inclusive (hora de Colombia).',
  })
  @ValidateIf(defined)
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Hasta este día, inclusive (hora de Colombia).',
  })
  @ValidateIf(defined)
  @IsCalendarDate()
  to?: string;
}
