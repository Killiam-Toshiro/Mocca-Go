import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { IsCalendarDate } from '../common/calendar-date';

const defined = (_: unknown, value: unknown) => value !== undefined;

export class MetricsQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-07',
    description:
      'Primer día del periodo (hora de Colombia). Por defecto, 29 días antes de `to`.',
  })
  @ValidateIf(defined)
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-05',
    description: 'Último día del periodo, inclusive. Por defecto, hoy.',
  })
  @ValidateIf(defined)
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Limita las cifras a los pedidos de una zona de entrega.',
  })
  @ValidateIf(defined)
  @IsUUID('4')
  zoneId?: string;
}
