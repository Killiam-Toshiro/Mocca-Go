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
export const COMPONENT_PRODUCT_FK = 'product_components_component_id_fkey';
export const ZONE_NAME_KEY = 'delivery_zones_name_key';
export const POINT_NAME_KEY = 'delivery_points_name_key';
export const POINT_ZONE_FK = 'delivery_points_zone_id_fkey';
export const ORDER_IDEMPOTENCY_KEY = 'orders_idempotency_key';
export const ORDER_CUSTOMER_FK = 'orders_customer_id_fkey';
export const ORDER_POINT_FK = 'orders_point_id_fkey';
export const ORDER_EVENT_USER_FK = 'order_events_user_id_fkey';
export const ORDER_ITEM_PRODUCT_FK = 'order_items_product_id_fkey';
export const ORDER_COMPONENT_PRODUCT_FK =
  'order_item_components_product_id_fkey';
