import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import { MetricsQueryDto } from './metrics.dto';
import { MetricsResponse } from './metrics.responses';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('metrics')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOperation({
    summary: 'Métricas del negocio (solo admin)',
    description:
      'Ventas, margen, tiempos de despacho, satisfacción, recompra y resultado de los pedidos creados en el periodo (hora de Colombia). Por defecto, los últimos 30 días; máximo 366.',
  })
  @ApiOkResponse({ type: MetricsResponse })
  @ApiErrors(400, 403, [404, 'La zona indicada no existe.'])
  report(@Query() query: MetricsQueryDto) {
    return this.metrics.report(query);
  }
}
