import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Parámetros de paginación compartidos. Ambos llegan como texto decimal sin
 * signos, espacios, fracciones ni ceros iniciales: page 1–10000 y limit 1–100.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 10000,
    default: 1,
    description: 'Página, en dígitos sin signos ni ceros iniciales.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[1-9]\d{0,3}|10000)$/)
  page?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Registros por página, en dígitos sin ceros iniciales.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/)
  limit?: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export interface Page<T> extends PageParams {
  data: T[];
  total: number;
  totalPages: number;
}

export function pageParams(input: PaginationQueryDto): PageParams {
  return {
    page: Number(input.page ?? '1'),
    limit: Number(input.limit ?? '20'),
  };
}

export function buildPage<T>(
  data: T[],
  params: PageParams,
  total: number,
): Page<T> {
  return {
    data,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
