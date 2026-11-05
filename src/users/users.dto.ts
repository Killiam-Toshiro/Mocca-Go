import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { USER_ROLES, UserRole } from './entities/user.entity';
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

  @ApiProperty({ enum: USER_ROLES, example: 'operador' })
  @IsIn(USER_ROLES)
  role!: UserRole;
}

export class UpdateUserDto {
  // Ningún campo admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    description: 'Envía al menos `username` o `password`.',
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
}

export class ChangeRoleDto {
  @ApiProperty({ enum: USER_ROLES, example: 'admin' })
  @IsIn(USER_ROLES)
  role!: UserRole;
}

export class ListUsersDto extends PaginationQueryDto {}
