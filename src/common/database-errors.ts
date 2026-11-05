import { QueryFailedError } from 'typeorm';

/** Violación de FK (`23503`) o de unicidad (`23505`) de PostgreSQL. */
export type ViolationCode = '23503' | '23505';

/**
 * Indica si el error es la violación de una restricción concreta. Comparar
 * también el nombre evita enmascarar otros fallos con el mismo código.
 */
export function isConstraintViolation(
  error: unknown,
  code: ViolationCode,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver: unknown = error.driverError;
  return (
    typeof driver === 'object' &&
    driver !== null &&
    'code' in driver &&
    driver.code === code &&
    'constraint' in driver &&
    driver.constraint === constraint
  );
}

// PostgreSQL nombra así las FK declaradas en línea en la migración inicial.
export const MOVEMENT_PRODUCT_FK = 'stock_movements_product_id_fkey';
export const MOVEMENT_USER_FK = 'stock_movements_user_id_fkey';
