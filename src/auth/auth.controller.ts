import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import { AuthGuard, AuthRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { IdentityResponse, LoginResponse } from './auth.responses';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Iniciar sesión (público)',
    description:
      'Usuario y contraseña producen un JWT de 15 minutos asociado a una ' +
      'sesión. Cinco fallos bloquean la cuenta 15 minutos.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiErrors(
    400,
    [401, 'Credenciales inválidas, usuario inexistente o cuenta bloqueada.'],
    429,
  )
  login(@Body() body: LoginDto) {
    return this.auth.login(body.username, body.password);
  }
  @Get('me')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({ summary: 'Identidad de la sesión (admin u operador)' })
  @ApiOkResponse({ type: IdentityResponse })
  @ApiErrors(401, 429)
  me(@Req() request: AuthRequest) {
    const { id, username, role } = request.identity!;
    return { id, username, role };
  }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({
    summary: 'Cerrar sesión (admin u operador)',
    description: 'Revoca la sesión; el mismo JWT devuelve 401 después.',
  })
  @ApiNoContentResponse({ description: 'Sesión revocada.' })
  @ApiErrors(401, 429)
  logout(@Req() request: AuthRequest) {
    return this.auth.logout(request.identity!);
  }
}
