import { ApiProperty } from '@nestjs/swagger';

/** Perfil del cliente: nunca incluye contraseña, hash ni el username interno. */
export class CustomerResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'ana.perez@u.icesi.edu.co' })
  email!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  fullName!: string;

  @ApiProperty({ example: '+573001234567', description: 'Formato E.164.' })
  phone!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
