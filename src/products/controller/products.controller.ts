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
  Put,
  Query,
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
import {
  CreateProductDto,
  ListProductsDto,
  ReplaceComponentsDto,
  SetProductStatusDto,
  SetSoldOutDto,
  UpdateProductDto,
} from '../DTOs/products.dto';
import { ProductPageResponse, ProductResponse } from '../products.responses';
import { ProductsService } from '../services/products.services';

const PRODUCT_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del producto.',
});
const NOT_FOUND: [404, string] = [404, 'Producto no encontrado.'];

// Lectura: admin y operador (datos internos). Escritura: solo admin, salvo «agotado».
@ApiTags('products')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401)
@Controller('products')
@UseGuards(AuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({
    summary: 'Crear producto (solo admin)',
    description:
      'Nace activo, sin «agotado» y con stock 0. Simple: `cost` obligatorio. Combo: `components` obligatorio y `cost` se calcula.',
  })
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiErrors(400, 403, [409, 'El SKU ya existe.'])
  create(@Body() body: CreateProductDto) {
    return this.products.create(body);
  }

  @Get()
  @Roles('admin', 'operador')
  @ApiOperation({
    summary: 'Listar catálogo paginado (admin u operador)',
    description: 'Ordenado por SKU; incluye el saldo de cada producto.',
  })
  @ApiOkResponse({ type: ProductPageResponse })
  @ApiErrors(400, 403)
  list(@Query() query: ListProductsDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @Roles('admin', 'operador')
  @PRODUCT_ID
  @ApiOperation({ summary: 'Consultar producto y saldo (admin u operador)' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, 403, NOT_FOUND)
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  @PRODUCT_ID
  @ApiOperation({
    summary:
      'Editar nombre, descripción, categoría, precio o costo (solo admin)',
    description:
      'No modifica SKU, estado, «agotado», stock ni componentes. `cost` no se admite en combos y la categoría no pasa hacia ni desde `combo`.',
  })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, 403, NOT_FOUND)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.products.update(id, body);
  }

  @Patch(':id/status')
  @Roles('admin')
  @PRODUCT_ID
  @ApiOperation({
    summary: 'Activar o desactivar producto (solo admin)',
    description: 'Desactivar conserva saldo e historial.',
  })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, 403, NOT_FOUND)
  setStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SetProductStatusDto,
  ) {
    return this.products.setStatus(id, body.active);
  }

  @Patch(':id/sold-out')
  @Roles('admin', 'operador')
  @PRODUCT_ID
  @ApiOperation({
    summary: 'Marcar o desmarcar «agotado» (admin u operador)',
    description:
      'Idempotente. Responde el producto con su `available` resultante.',
  })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, 403, NOT_FOUND)
  setSoldOut(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SetSoldOutDto,
  ) {
    return this.products.setSoldOut(id, body.soldOut);
  }

  @Put(':id/components')
  @Roles('admin')
  @PRODUCT_ID
  @ApiOperation({
    summary: 'Reemplazar la composición de un combo (solo admin)',
    description:
      '2 a 10 productos simples, activos y distintos, con cantidad de 1 a 10. Si la composición es inválida se conserva la anterior.',
  })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, 403, NOT_FOUND, [409, 'El producto no es un combo.'])
  replaceComponents(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReplaceComponentsDto,
  ) {
    return this.products.replaceComponents(id, body.components);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('admin')
  @PRODUCT_ID
  @ApiOperation({
    summary: 'Eliminar producto sin movimientos (solo admin)',
    description: 'Con historial responde 409: se desactiva con /status.',
  })
  @ApiNoContentResponse({ description: 'Producto eliminado.' })
  @ApiErrors(400, 403, NOT_FOUND, [
    409,
    'El producto tiene movimientos o es componente de un combo; no se elimina.',
  ])
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.remove(id);
  }
}
