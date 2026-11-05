import { AppEnvironment, validateEnvironment } from './environment';
import { AuthEnvironment, validateAuthEnvironment } from '../auth/auth.config';
import {
  DatabaseEnvironment,
  validateDatabaseEnvironment,
} from '../database/database.config';

export interface RuntimeEnvironment
  extends AppEnvironment, DatabaseEnvironment, AuthEnvironment {}

export function validateRuntimeEnvironment(
  environment: Record<string, unknown>,
): RuntimeEnvironment {
  return {
    ...validateEnvironment(environment),
    ...validateDatabaseEnvironment(environment),
    ...validateAuthEnvironment(environment),
  };
}
