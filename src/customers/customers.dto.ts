import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { normalizePhone } from './phone';

export const PHONE_MESSAGE =
  'phone debe ser un celular colombiano o un número internacional válido.';

export const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lowerEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
/** Un teléfono no interpretable pasa a `null` y falla `@IsString`. */
export const phoneToE164 = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizePhone(value) : value;

export class RegisterCustomerDto {
  @ApiProperty({
    format: 'email',
    maxLength: 254,
    example: 'ana.perez@u.icesi.edu.co',
    description: 'Se guarda en minúsculas y es único.',
  })
  @Transform(lowerEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description: 'Se guarda con hash scrypt.',
  })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiProperty({ minLength: 2, maxLength: 100, example: 'Ana Pérez' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 100)
  fullName!: string;

  @ApiProperty({
    example: '300 123 4567',
    description:
      'Celular colombiano o número internacional (`+…`). Se guarda en formato E.164, p. ej. `+573001234567`.',
  })
  @Transform(phoneToE164)
  @IsString({ message: PHONE_MESSAGE })
  phone!: string;
}

export class UpdateCustomerDto {
  // Ningún campo admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
    description: 'Envía al menos `fullName` o `phone`.',
  })
  @Transform(trimmed)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @ApiPropertyOptional({
    example: '+57 300 123 4567',
    description:
      'Celular colombiano o número internacional; se guarda en E.164.',
  })
  @Transform(phoneToE164)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: PHONE_MESSAGE })
  phone?: string;
}
