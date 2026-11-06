import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { USER_ROLES, UserRole } from './entities/user.entity';

/** Usuario seguro: nunca incluye contraseña, hash ni datos de sesión. Los clientes añaden correo, nombre y teléfono. */
export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'operador' })
  username!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'operador' })
  role!: UserRole;

  @ApiProperty({
    type: String,
    format: 'email',
    nullable: true,
    example: null,
    description: 'Solo clientes; el personal devuelve `null`.',
  })
  email!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Clientes: su nombre. Personal: el que le asignó el admin (obligatorio para repartidores) o `null`.',
  })
  fullName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Formato E.164. Clientes: su teléfono. Personal: el que le asignó el admin (obligatorio para repartidores) o `null`.',
  })
  phone!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserPageResponse extends PageResponse {
  @ApiProperty({ type: [UserResponse] })
  data!: UserResponse[];
}
