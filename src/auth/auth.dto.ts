import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { USERNAME_PATTERN } from '../users/users.dto';

export class LoginDto {
  @ApiProperty({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    example: 'admin',
  })
  @IsString()
  @Matches(USERNAME_PATTERN)
  username!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, format: 'password' })
  @IsString()
  @Length(12, 128)
  password!: string;
}
