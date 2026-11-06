import {
  Body,
  Controller,
  Delete,
  Get,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '../../auth/auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { ApiErrors } from '../../common/openapi';
import { BEARER_SCHEME } from '../../swagger';
import { CreateZoneDto, UpdateZoneDto } from '../delivery.dto';
import {
  PublicZonesResponse,
  ZoneResponse,
  ZonesResponse,
} from '../delivery.responses';
import { DeliveryService } from '../delivery.service';

const ZONE_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 de la zona.',
});
const NOT_FOUND: [404, string] = [404, 'Zona no encontrada.'];

@ApiTags('delivery-zones')
@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly delivery: DeliveryService) {}

  // Público: el cliente elige dónde recibir antes de registrarse.
  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Zonas y puntos de entrega (público)',
    description:
      'Solo zonas y puntos activos, ordenados por nombre. Las zonas sin puntos activos se omiten.',
  })
  @ApiOkResponse({ type: PublicZonesResponse })
  @ApiErrors(429)
  publicZones() {
    return this.delivery.publicZones();
  }

  @Get('all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({
    summary: 'Todas las zonas y puntos (solo admin)',
    description: 'Incluye inactivos y zonas sin puntos.',
  })
  @ApiOkResponse({ type: ZonesResponse })
  @ApiErrors(401, 403)
  allZones() {
    return this.delivery.allZones();
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({ summary: 'Crear zona (solo admin)' })
  @ApiCreatedResponse({ type: ZoneResponse })
  @ApiErrors(400, 401, 403, [409, 'Ya existe una zona con ese nombre.'])
  create(@Body() body: CreateZoneDto) {
    return this.delivery.createZone(body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ZONE_ID
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({
    summary: 'Editar, activar o desactivar una zona (solo admin)',
  })
  @ApiOkResponse({ type: ZoneResponse })
  @ApiErrors(400, 401, 403, NOT_FOUND, [
    409,
    'Ya existe una zona con ese nombre.',
  ])
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateZoneDto,
  ) {
    return this.delivery.updateZone(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ZONE_ID
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({ summary: 'Eliminar una zona sin puntos (solo admin)' })
  @ApiNoContentResponse({ description: 'Zona eliminada.' })
  @ApiErrors(400, 401, 403, NOT_FOUND, [409, 'La zona tiene puntos.'])
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.delivery.removeZone(id);
  }
}
