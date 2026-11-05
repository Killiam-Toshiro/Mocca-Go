import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseEnvironment } from './database.config';
import { InitialInventory1791244800000 } from './migrations/1791244800000-initial-inventory';
import { Product } from '../products/entities/products.entity';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { User } from '../users/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { Authentication1791244801000 } from './migrations/1791244801000-authentication';
import { RemoveTwoFactor1791244802000 } from './migrations/1791244802000-remove-two-factor';

export function databaseOptions(
  config: DatabaseEnvironment,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    username: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    schema: config.DB_SCHEMA,
    ssl: config.DB_SSL ? { rejectUnauthorized: true } : false,
    entities: [User, Product, StockMovement, Session],
    migrations: [
      InitialInventory1791244800000,
      Authentication1791244801000,
      RemoveTwoFactor1791244802000,
    ],
    migrationsTableName: 'schema_migrations',
    migrationsTransactionMode: 'all',
    synchronize: false,
    dropSchema: false,
    migrationsRun: false,
    logging: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    connectTimeoutMS: 5000,
  };
}

export function createDataSource(config: DatabaseEnvironment): DataSource {
  return new DataSource(databaseOptions(config));
}
