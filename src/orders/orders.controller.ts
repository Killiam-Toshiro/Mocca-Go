import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import { CancelOrderDto, CreateOrderDto, ListOrdersDto } from './orders.dto';
import { OrderPageResponse, OrderResponse } from './orders.responses';
import { OrdersService } from './orders.service';

/** Lo único que se usa de la respuesta HTTP: fijar el código (201 o 200). */
interface StatusSetter {
  status(code: number): unknown;
}

const ORDER_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del pedido.',
});

@ApiTags('orders')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('orders')
@UseGuards(AuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles('cliente')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID generado por el cliente. Repetirlo con el mismo contenido devuelve el pedido ya creado (200).',
  })
  @ApiOperation({
    summary: 'Crear pedido y pagar con tarjeta de demostración (solo cliente)',
    description:
      'Calcula el total con los precios del menú, cobra con la tarjeta de prueba y descuenta el saldo con movimientos `OUT` en una sola transacción.',
  })
  @ApiCreatedResponse({ type: OrderResponse })
  @ApiOkResponse({
    type: OrderResponse,
    description: 'Repetición con la misma clave y el mismo contenido.',
  })
  @ApiErrors(
    400,
    [402, 'Pago rechazado (tarjeta de prueba `4000000000000002`).'],
    403,
    [404, 'Producto o punto de entrega no encontrado.'],
    [
      409,
      'Producto no disponible, saldo insuficiente, punto inactivo o clave de idempotencia usada con otro contenido.',
    ],
    429,
  )
  async create(
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateOrderDto,
    @Res({ passthrough: true }) response: StatusSetter,
  ) {
    if (key === undefined || !isUUID(key))
      throw new BadRequestException(
        'El encabezado Idempotency-Key debe ser un UUID.',
      );
    const result = await this.orders.create(
      request.identity!,
      key.toLowerCase(),
      body,
    );
    response.status(result.created ? 201 : 200);
    return result.order;
  }

  @Get()
  @Roles('cliente', 'admin', 'operador')
  @ApiOperation({
    summary: 'Listar pedidos (cliente: los suyos; admin y operador: todos)',
    description: 'Más reciente primero; filtro opcional por estado.',
  })
  @ApiOkResponse({ type: OrderPageResponse })
  @ApiErrors(400, 403)
  list(@Req() request: AuthRequest, @Query() query: ListOrdersDto) {
    return this.orders.list(request.identity!, query);
  }

  @Get(':id')
  @Roles('cliente', 'admin', 'operador')
  @ORDER_ID
  @ApiOperation({ summary: 'Consultar un pedido' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(400, 403, [404, 'Pedido no encontrado (o es de otro cliente).'])
  findOne(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.orders.findOne(request.identity!, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('cliente', 'admin', 'operador')
  @ORDER_ID
  @ApiOperation({
    summary: 'Cancelar un pedido y devolver el saldo',
    description:
      'El cliente solo cancela el suyo en `recibido`; admin y operador, en `recibido` o `en_preparacion`, con `reason`. Registra movimientos `IN` y reembolsa el pago de demostración.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiErrors(
    400,
    403,
    [404, 'Pedido no encontrado (o es de otro cliente).'],
    [409, 'El pedido no se puede cancelar en su estado actual.'],
  )
  cancel(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancel(request.identity!, id, body.reason);
  }
}
