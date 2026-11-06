import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { USERNAME_PATTERN } from '../users/users.dto';

export class LoginDto {
  @ApiPropertyOptional({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    example: 'admin',
    description:
      'Personal (admin, operador, repartidor). Excluyente con `email`.',
  })
  @ValidateIf((object: LoginDto) => object.email === undefined)
  @IsString()
  @Matches(USERNAME_PATTERN)
  username?: string;

  @ApiPropertyOptional({
    format: 'email',
    maxLength: 254,
    example: 'ana.perez@u.icesi.edu.co',
    description:
      'Clientes. Excluyente con `username`; no distingue mayúsculas.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((object: LoginDto) => object.username === undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ minLength: 12, maxLength: 128, format: 'password' })
  @IsString()
  @Length(12, 128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ minLength: 12, maxLength: 128, format: 'password' })
  @IsString()
  @Length(12, 128)
  currentPassword!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description: 'Debe ser distinta de la actual.',
  })
  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
