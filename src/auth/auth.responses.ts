import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, UserRole } from '../users/entities/user.entity';

export class LoginResponse {
  @ApiProperty({ description: 'JWT HS256 de acceso.', example: 'eyJhbGciOi…' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Segundos de validez del JWT.', example: 900 })
  expiresIn!: number;
}

export class IdentityResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'admin' })
  username!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'admin' })
  role!: UserRole;
}
