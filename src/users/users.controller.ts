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
  Req,
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
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/openapi';
import { BEARER_SCHEME } from '../swagger';
import {
  ChangeRoleDto,
  CreateUserDto,
  ListUsersDto,
  UpdateUserDto,
} from './users.dto';
import { UserPageResponse, UserResponse } from './users.responses';
import { USER_NOT_FOUND, UsersService } from './users.service';

const USER_ID = ApiParam({
  name: 'id',
  format: 'uuid',
  description: 'UUID v4 del usuario.',
});
const NOT_FOUND: [404, string] = [404, USER_NOT_FOUND];

@ApiTags('users')
@ApiBearerAuth(BEARER_SCHEME)
@ApiErrors(401, 403)
@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear usuario (solo admin)',
    description: 'No hay registro público; el admin comunica la contraseña.',
  })
  @ApiCreatedResponse({ type: UserResponse })
  @ApiErrors(400, [409, 'El username ya existe.'])
  create(@Req() request: AuthRequest, @Body() body: CreateUserDto) {
    return this.users.create(request.identity!, body);
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios paginados (solo admin)' })
  @ApiOkResponse({ type: UserPageResponse })
  @ApiErrors(400)
  list(@Req() request: AuthRequest, @Query() query: ListUsersDto) {
    return this.users.list(request.identity!, query);
  }

  @Get(':id')
  @USER_ID
  @ApiOperation({ summary: 'Consultar usuario (solo admin)' })
  @ApiOkResponse({ type: UserResponse })
  @ApiErrors(400, NOT_FOUND)
  findOne(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.users.findOne(request.identity!, id);
  }

  @Patch(':id')
  @USER_ID
  @ApiOperation({
    summary: 'Editar username o contraseña (solo admin)',
    description:
      'No cambia el rol. Una contraseña nueva revoca las demás sesiones del ' +
      'usuario editado y reinicia su bloqueo de intentos.',
  })
  @ApiOkResponse({ type: UserResponse })
  @ApiErrors(400, NOT_FOUND, [409, 'El username ya existe.'])
  update(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(request.identity!, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @USER_ID
  @ApiOperation({
    summary: 'Eliminar usuario sin movimientos (solo admin)',
    description: 'Sus sesiones dejan de ser válidas de inmediato.',
  })
  @ApiNoContentResponse({ description: 'Usuario eliminado.' })
  @ApiErrors(400, NOT_FOUND, [
    409,
    'Es el último admin, es tu propio usuario o tiene movimientos.',
  ])
  remove(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.users.remove(request.identity!, id);
  }

  @Patch(':id/role')
  @USER_ID
  @ApiOperation({
    summary: 'Cambiar rol (solo admin)',
    description: 'Los nuevos permisos aplican desde la siguiente petición.',
  })
  @ApiOkResponse({ type: UserResponse })
  @ApiErrors(400, NOT_FOUND, [
    409,
    'No se puede degradar al último admin registrado.',
  ])
  changeRole(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ChangeRoleDto,
  ) {
    return this.users.changeRole(request.identity!, id, body.role);
  }
}
