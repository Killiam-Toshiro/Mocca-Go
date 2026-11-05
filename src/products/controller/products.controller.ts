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
  SetProductStatusDto,
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

// Lectura: cualquier usuario autenticado. Escritura: solo admin (por ruta).
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
    description: 'El producto nace activo y con stock 0.',
  })
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiErrors(400, 403, [409, 'El SKU ya existe.'])
  create(@Body() body: CreateProductDto) {
    return this.products.create(body);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar catálogo paginado (admin u operador)',
    description: 'Ordenado por SKU; incluye el saldo de cada producto.',
  })
  @ApiOkResponse({ type: ProductPageResponse })
  @ApiErrors(400)
  list(@Query() query: ListProductsDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @PRODUCT_ID
  @ApiOperation({ summary: 'Consultar producto y saldo (admin u operador)' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors(400, NOT_FOUND)
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  @PRODUCT_ID
  @ApiOperation({
    summary: 'Editar nombre o descripción (solo admin)',
    description: 'No modifica SKU, estado ni stock.',
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
    'El producto tiene movimientos; no se elimina.',
  ])
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.remove(id);
  }
}
