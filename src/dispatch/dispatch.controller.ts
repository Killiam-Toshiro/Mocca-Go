import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import {
  OrderNotificationsService,
  StreamRequest,
  StreamResponse,
} from '../orders/notifications/order-notifications.service';
import { OrderResponse } from '../orders/orders.responses';
import { BEARER_SCHEME } from '../swagger';
import { CreateRoundDto, FailOrderDto, ListRoundsDto } from './dispatch.dto';
import {
  QueueResponse,
  RoundPageResponse,
  RoundResponse,
} from './dispatch.responses';
import { DispatchService } from './dispatch.service';

const ORDER_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del pedido.',
});

@ApiTags('dispatch')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('dispatch')
@UseGuards(AuthGuard, RolesGuard)
@Roles('repartidor')
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  @Get('queue')
  @Roles('repartidor', 'operador', 'admin')
  @ApiOperation({
    summary: 'Cola de despacho: pedidos listos por zona',
    description:
      'Zonas ordenadas por su pedido más antiguo; `suggestedZoneId` es la zona del `listo` más antiguo.',
  })
  @ApiOkResponse({ type: QueueResponse })
  @ApiErrors(403)
  queue() {
    return this.dispatch.queue();
  }

  @Post('rounds')
  @ApiOperation({
    summary: 'Crear una ronda y salir a repartir (repartidor)',
    description:
      'Sin `orderIds` toma la sugerencia (zona del `listo` más antiguo y hasta 5 pedidos); con `orderIds` arma una ruta propia de una sola zona. Los pedidos pasan a `en_camino` con ETA de 15 minutos. Máximo 2 rondas activas.',
  })
  @ApiCreatedResponse({ type: RoundResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Algún pedido de `orderIds` no existe.'],
    [
      409,
      'Sin pedidos listos, pedidos no listos o de varias zonas, perfil incompleto o 2 rondas activas.',
    ],
  )
  createRound(@Req() request: AuthRequest, @Body() body: CreateRoundDto) {
    return this.dispatch.createRound(request.identity!, body);
  }

  @Get('rounds')
  @Roles('repartidor', 'operador', 'admin')
  @ApiOperation({
    summary: 'Listar rondas',
    description:
      'El repartidor ve las suyas (por defecto las activas); admin y operador ven todas. La más reciente primero.',
  })
  @ApiOkResponse({ type: RoundPageResponse })
  @ApiErrors(400, 403)
  rounds(@Req() request: AuthRequest, @Query() query: ListRoundsDto) {
    return this.dispatch.rounds(request.identity!, query);
  }

  @Get('rounds/:id')
  @Roles('repartidor', 'operador', 'admin')
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID v4 de la ronda.' })
  @ApiOperation({ summary: 'Detalle de una ronda con sus pedidos' })
  @ApiOkResponse({ type: RoundResponse })
  @ApiErrors(400, 403, [404, 'Ronda no encontrada (o de otro repartidor).'])
  round(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.dispatch.round(request.identity!, id);
  }

  @Post('orders/:id/deliver')
  @HttpCode(200)
  @ORDER_ID
  @ApiOperation({
    summary: 'Marcar un pedido como entregado (en_camino → entregado)',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Pedido inexistente o de una ronda ajena.'],
    [409, 'El pedido no está `en_camino`.'],
  )
  deliver(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.dispatch.deliver(request.identity!, id);
  }

  @Post('orders/:id/fail')
  @HttpCode(200)
  @ORDER_ID
  @ApiOperation({
    summary: 'Marcar un pedido como no entregado (en_camino → no_entregado)',
    description: 'Exige un motivo. No mueve inventario ni pago.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Pedido inexistente o de una ronda ajena.'],
    [409, 'El pedido no está `en_camino`.'],
  )
  fail(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: FailOrderDto,
  ) {
    return this.dispatch.fail(request.identity!, id, body);
  }

  @Get('stream')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Canal en tiempo real del repartidor (SSE)',
    description:
      'Mismo formato que el canal de la cocina: `ready`, un evento `order` por cada cambio de estado y latido cada 25 segundos. Máximo 5 canales por usuario.',
  })
  @ApiOkResponse({
    description: 'Flujo `text/event-stream`.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrors(403, [429, 'Demasiados canales abiertos o aperturas por minuto.'])
  stream(
    @Req() request: AuthRequest & StreamRequest,
    @Res() response: StreamResponse,
  ): void {
    this.notifications.serve(request.identity!, 'dispatch', request, response);
  }
}
