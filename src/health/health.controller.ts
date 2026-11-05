import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ApiErrors } from '../common/openapi';

export const READINESS_TIMEOUT_MS = 2000;

export class HealthResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly source: DataSource) {}

  @Get()
  @ApiOperation({
    summary: 'Disponibilidad del proceso (público)',
    description: 'Indica que el proceso HTTP responde; no comprueba la BD.',
  })
  @ApiOkResponse({ type: HealthResponse })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Disponibilidad de PostgreSQL (público)',
    description: 'Ejecuta `SELECT 1` con un límite de 2 segundos.',
  })
  @ApiOkResponse({ type: HealthResponse })
  @ApiErrors([503, 'Base de datos no disponible.'])
  async getReadiness(): Promise<{ status: 'ok' }> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.source.query('SELECT 1'),
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('timeout')),
            READINESS_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      // Sin detalles: el motivo real no se expone al cliente.
      throw new ServiceUnavailableException('Base de datos no disponible.');
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ok' };
  }
}
