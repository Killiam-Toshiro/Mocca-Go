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
import { ListSurveysDto } from './surveys.dto';
import { SurveyPageResponse } from './surveys.responses';
import { SurveysService } from './surveys.service';

@ApiTags('surveys')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('surveys')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar respuestas de la encuesta (solo admin)',
    description:
      'La más reciente primero; filtros por calificación y por rango de fechas (hora de Colombia, ambos días inclusive).',
  })
  @ApiOkResponse({ type: SurveyPageResponse })
  @ApiErrors(400, 403)
  list(@Query() query: ListSurveysDto) {
    return this.surveys.list(query);
  }
}
