import {
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
import { BEARER_SCHEME } from '../swagger';
import { KitchenService } from './kitchen.service';
import {
  OrderNotificationsService,
  StreamRequest,
  StreamResponse,
} from './notifications/order-notifications.service';
import { ListKitchenDto } from './orders.dto';
import { OrderPageResponse, OrderResponse } from './orders.responses';

const ORDER_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del pedido.',
});

@ApiTags('kitchen')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('kitchen')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operador', 'admin')
export class KitchenController {
  constructor(
    private readonly kitchen: KitchenService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  @Get('orders')
  @ApiOperation({
    summary: 'Cola de cocina (operador y admin)',
    description:
      'Por defecto `recibido` y `en_preparacion`, el pedido más antiguo primero; con `status` también se pueden ver los `listo`.',
  })
  @ApiOkResponse({ type: OrderPageResponse })
  @ApiErrors(400, 403)
  queue(@Query() query: ListKitchenDto) {
    return this.kitchen.queue(query);
  }

  @Post('orders/:id/start')
  @HttpCode(200)
  @ORDER_ID
  @ApiOperation({
    summary: 'Empezar a preparar un pedido (recibido → en_preparacion)',
    description: 'Registra quién y cuándo, y avisa al cliente y a la cocina.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Pedido no encontrado.'],
    [409, 'El pedido no está en estado `recibido`.'],
  )
  start(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.kitchen.start(request.identity!, id);
  }

  @Post('orders/:id/ready')
  @HttpCode(200)
  @ORDER_ID
  @ApiOperation({
    summary: 'Marcar un pedido como listo (en_preparacion → listo)',
    description: 'Registra quién y cuándo, y avisa al cliente y a la cocina.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Pedido no encontrado.'],
    [409, 'El pedido no está en estado `en_preparacion`.'],
  )
  ready(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.kitchen.ready(request.identity!, id);
  }

  @Get('stream')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Canal en tiempo real de la cocina (SSE)',
    description:
      'Envía `ready` al abrir y tras cada reconexión de la escucha (el cliente vuelve a consultar la cola), un evento `order` por cada pedido nuevo, cambio de estado o cancelación, y un comentario de latido cada 25 segundos. Máximo 5 canales por usuario.',
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
    this.notifications.serve(request.identity!, 'kitchen', request, response);
  }
}
