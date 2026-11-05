import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrors } from '../../common/openapi';
import { MenuResponse } from '../products.responses';
import { ProductsService } from '../services/products.services';

// Público: el cliente decide antes de registrarse. Sin sesión, con límite por IP.
@ApiTags('menu')
@Controller('menu')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class MenuController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'Menú vendible (público)',
    description:
      'Productos activos ordenados por categoría (combo, café, bebida, panadería, pastelería, snack) y nombre, con su disponibilidad. No incluye costo, saldo ni estado interno.',
  })
  @ApiOkResponse({ type: MenuResponse })
  @ApiErrors(429)
  menu() {
    return this.products.menu();
  }
}
