import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateRuntimeEnvironment } from './config/runtime-environment';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/module/products.module';
import { MovementsModule } from './movements/movements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      skipProcessEnv: true,
      validate: validateRuntimeEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    MovementsModule,
  ],
})
export class AppModule {}
