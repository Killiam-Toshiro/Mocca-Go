import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Post,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import { RegisterCustomerDto, UpdateCustomerDto } from './customers.dto';
import { CustomerResponse } from './customers.responses';
import {
  CUSTOMER_NOT_FOUND,
  CustomersService,
  EMAIL_TAKEN,
} from './customers.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Registrar cliente (público)',
    description:
      'Crea la cuenta con correo y contraseña. No inicia sesión: después se ' +
      'llama a `POST /auth/login` con `email` y `password`.',
  })
  @ApiCreatedResponse({ type: CustomerResponse })
  @ApiErrors(
    400,
    [409, EMAIL_TAKEN],
    [429, 'Más de 5 registros por minuto desde la misma IP.'],
  )
  register(@Body() body: RegisterCustomerDto) {
    return this.customers.register(body);
  }

  @Get('me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('cliente')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({ summary: 'Consultar mi perfil (solo cliente)' })
  @ApiOkResponse({ type: CustomerResponse })
  @ApiErrors(401, 403, [404, CUSTOMER_NOT_FOUND])
  profile(@Req() request: AuthRequest) {
    return this.customers.profile(request.identity!);
  }

  @Patch('me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('cliente')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({
    summary: 'Editar mi nombre o teléfono (solo cliente)',
    description: 'El correo no se puede cambiar.',
  })
  @ApiOkResponse({ type: CustomerResponse })
  @ApiErrors(400, 401, 403, [404, CUSTOMER_NOT_FOUND])
  update(@Req() request: AuthRequest, @Body() body: UpdateCustomerDto) {
    return this.customers.updateProfile(request.identity!, body);
  }
}
