import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';
import { USER_ROLES, UserRole } from './entities/user.entity';

/** Usuario seguro: nunca incluye contraseña, hash ni datos de sesión. */
export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'operador' })
  username!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'operador' })
  role!: UserRole;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserPageResponse extends PageResponse {
  @ApiProperty({ type: [UserResponse] })
  data!: UserResponse[];
}
