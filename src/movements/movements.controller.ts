import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import { CreateMovementDto, ListMovementsDto } from './movements.dto';
import {
  CreatedMovementResponse,
  MovementPageResponse,
} from './movements.responses';
import { MovementsService } from './movements.service';

@ApiTags('movements')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('movements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'operador')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar entrada o salida (admin u operador)',
    description:
      'Actualiza el saldo y guarda el movimiento en una transacción. No es ' +
      'idempotente: repetirlo registra otro movimiento.',
  })
  @ApiCreatedResponse({ type: CreatedMovementResponse })
  @ApiErrors(
    400,
    [404, 'Producto no encontrado.'],
    [409, 'Producto inactivo, saldo insuficiente o saldo máximo excedido.'],
  )
  create(@Req() request: AuthRequest, @Body() body: CreateMovementDto) {
    return this.movements.create(request.identity!, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Historial paginado (admin u operador)',
    description: 'Más reciente primero; filtros por producto y tipo.',
  })
  @ApiOkResponse({ type: MovementPageResponse })
  @ApiErrors(400)
  list(@Query() query: ListMovementsDto) {
    return this.movements.list(query);
  }
}
