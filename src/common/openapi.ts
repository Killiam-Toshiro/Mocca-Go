import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiResponse } from '@nestjs/swagger';

/** Cuerpo de error que produce NestJS para cualquier excepción HTTP. */
export class ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description:
      'Mensaje del error. En errores de validación es una lista de mensajes.',
    example: 'Credenciales inválidas.',
  })
  message!: string | string[];

  @ApiProperty({ required: false, example: 'Bad Request' })
  error?: string;
}

/** Campos comunes de los listados paginados. */
export class PageResponse {
  @ApiProperty({ example: 1, minimum: 1 })
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({ example: 3, minimum: 0 })
  total!: number;

  @ApiProperty({ example: 1, minimum: 0 })
  totalPages!: number;
}

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

const DEFAULT_ERRORS: Record<ErrorStatus, string> = {
  400: 'Parámetros inválidos, campos faltantes o campos no permitidos.',
  401: 'JWT ausente, alterado, expirado o de una sesión cerrada.',
  403: 'El rol vigente no tiene permiso para esta operación.',
  404: 'Recurso no encontrado.',
  409: 'La operación entra en conflicto con el estado actual.',
  429: 'Demasiadas peticiones desde la misma IP (20 por minuto).',
  503: 'Un servicio del que depende la API no está disponible.',
};

/**
 * Documenta las respuestas de error de una ruta. Cada elemento es un código o
 * un par [código, descripción] cuando la ruta necesita explicar el motivo.
 */
export function ApiErrors(
  ...errors: Array<ErrorStatus | [ErrorStatus, string]>
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...errors.map((error) => {
      const [status, description] = Array.isArray(error)
        ? error
        : [error, DEFAULT_ERRORS[error]];
      return ApiResponse({ status, description, type: ErrorResponse });
    }),
  );
}
