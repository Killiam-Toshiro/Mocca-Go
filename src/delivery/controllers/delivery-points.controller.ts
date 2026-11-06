import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { ApiErrors } from '../../common/openapi';
import { BEARER_SCHEME } from '../../swagger';
import { CreatePointDto, UpdatePointDto } from '../delivery.dto';
import { PointResponse } from '../delivery.responses';
import { DeliveryService } from '../delivery.service';

const POINT_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del punto.',
});
const NOT_FOUND: [404, string] = [404, 'Punto o zona no encontrados.'];
const NAME_TAKEN: [409, string] = [409, 'Ya existe un punto con ese nombre.'];

@ApiTags('delivery-points')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401, 403)
@Controller('delivery-points')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class DeliveryPointsController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post()
  @ApiOperation({ summary: 'Crear punto de entrega (solo admin)' })
  @ApiCreatedResponse({ type: PointResponse })
  @ApiErrors(400, NOT_FOUND, NAME_TAKEN)
  create(@Body() body: CreatePointDto) {
    return this.delivery.createPoint(body);
  }

  @Patch(':id')
  @POINT_ID
  @ApiOperation({
    summary: 'Editar, mover, activar o desactivar un punto (solo admin)',
  })
  @ApiOkResponse({ type: PointResponse })
  @ApiErrors(400, NOT_FOUND, NAME_TAKEN)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdatePointDto,
  ) {
    return this.delivery.updatePoint(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @POINT_ID
  @ApiOperation({ summary: 'Eliminar un punto (solo admin)' })
  @ApiNoContentResponse({ description: 'Punto eliminado.' })
  @ApiErrors(400, [404, 'Punto no encontrado.'])
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.delivery.removePoint(id);
  }
}
