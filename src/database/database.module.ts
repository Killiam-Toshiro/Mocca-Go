import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuntimeEnvironment } from '../config/runtime-environment';
import { databaseOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>) => ({
        ...databaseOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_SCHEMA: config.get('DB_SCHEMA', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
        }),
        retryAttempts: 1,
      }),
    }),
  ],
})
export class DatabaseModule {}
