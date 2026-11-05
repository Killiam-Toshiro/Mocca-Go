import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
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
import { ChangePasswordDto, LoginDto } from './auth.dto';
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
      'Usuario (personal) o correo (clientes) y contraseña producen un JWT ' +
      'asociado a una sesión; se envía exactamente uno de `username` o ' +
      '`email`. Cinco fallos bloquean la cuenta 15 minutos.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiErrors(
    400,
    [401, 'Credenciales inválidas, usuario inexistente o cuenta bloqueada.'],
    429,
  )
  login(@Body() body: LoginDto) {
    if (body.username !== undefined && body.email !== undefined)
      throw new BadRequestException('Envía username o email, no ambos.');
    return this.auth.login(
      body.username !== undefined
        ? { username: body.username }
        : { email: body.email! },
      body.password,
    );
  }
  @Get('me')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({ summary: 'Identidad de la sesión (cualquier rol)' })
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
    summary: 'Cerrar sesión (cualquier rol)',
    description: 'Revoca la sesión; el mismo JWT devuelve 401 después.',
  })
  @ApiNoContentResponse({ description: 'Sesión revocada.' })
  @ApiErrors(401, 429)
  logout(@Req() request: AuthRequest) {
    return this.auth.logout(request.identity!);
  }
  @Patch('password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth(BEARER_SCHEME)
  @ApiOperation({
    summary: 'Cambiar mi contraseña (cualquier rol)',
    description:
      'Verifica la contraseña actual con el mismo contador de fallos del ' +
      'login (cinco fallos bloquean la cuenta 15 minutos), exige una nueva ' +
      'distinta y revoca las demás sesiones; la actual sigue válida.',
  })
  @ApiNoContentResponse({ description: 'Contraseña cambiada.' })
  @ApiErrors(
    [400, 'Campos inválidos o la contraseña nueva es igual a la actual.'],
    401,
    [403, 'La contraseña actual no es correcta o la cuenta está bloqueada.'],
    429,
  )
  changePassword(@Req() request: AuthRequest, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(
      request.identity!,
      body.currentPassword,
      body.newPassword,
    );
  }
}
