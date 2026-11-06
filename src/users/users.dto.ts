import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';
import {
  PHONE_MESSAGE,
  phoneToE164,
  trimmed,
} from '../customers/customers.dto';
import { STAFF_ROLES, StaffRole } from './entities/user.entity';
import { PaginationQueryDto } from '../common/pagination';

/** Username canónico; idéntico al CHECK users_username_format. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export class CreateUserDto {
  @ApiProperty({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    description:
      'Minúsculas ASCII, dígitos y `._-`, empezando por letra o dígito.',
    example: 'nuevo_operador',
  })
  @IsString()
  @Matches(USERNAME_PATTERN)
  username!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description: 'Contraseña inicial; se guarda con hash scrypt.',
  })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiProperty({
    enum: STAFF_ROLES,
    example: 'operador',
    description: 'Rol de personal. `cliente` solo nace del registro propio.',
  })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @ApiPropertyOptional({
    example: '300 123 4567',
    description:
      'Obligatorio para el rol `repartidor`. Celular colombiano o internacional; se guarda en E.164.',
  })
  @Transform(phoneToE164)
  @ValidateIf(
    (object: CreateUserDto, value) =>
      object.role === 'repartidor' || value !== undefined,
  )
  @IsString({ message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 80,
    example: 'Carlos Gómez',
    description:
      'Obligatorio para el rol `repartidor`; lo ve el cliente cuando su pedido va en camino.',
  })
  @Transform(trimmed)
  @ValidateIf(
    (object: CreateUserDto, value) =>
      object.role === 'repartidor' || value !== undefined,
  )
  @IsString()
  @Length(2, 80)
  fullName?: string;
}

export class UpdateUserDto {
  // Ningún campo admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    description: 'Envía al menos un campo.',
    example: 'operador_renombrado',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(USERNAME_PATTERN)
  username?: string;

  @ApiPropertyOptional({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description:
      'Contraseña nueva; revoca las demás sesiones del usuario editado.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(12, 128)
  password?: string;

  @ApiPropertyOptional({
    example: '+57 300 123 4567',
    description:
      'Teléfono del personal (no aplica a clientes); se guarda en E.164.',
  })
  @Transform(phoneToE164)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 80,
    description: 'Nombre del personal (no aplica a clientes).',
  })
  @Transform(trimmed)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 80)
  fullName?: string;
}

export class ChangeRoleDto {
  @ApiProperty({
    enum: STAFF_ROLES,
    example: 'admin',
    description: 'Rol de personal; un cliente no cambia de rol.',
  })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

export class ListUsersDto extends PaginationQueryDto {}
