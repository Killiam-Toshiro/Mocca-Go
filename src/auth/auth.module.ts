import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { RuntimeEnvironment } from '../config/runtime-environment';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
