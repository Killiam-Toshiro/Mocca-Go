/** Funciones puras del catálogo: costo, saldo y disponibilidad (RN-31 a RN-33). */

export interface ComponentState {
  quantity: number;
  cost: number;
  stock: number;
  active: boolean;
  soldOut: boolean;
}

/** `cost ÷ price × 100` con un decimal; `null` si el precio es 0. */
export function costPercent(cost: number, price: number): number | null {
  if (price <= 0) return null;
  return Math.round((cost / price) * 1000) / 10;
}

/** Costo de un combo: suma de `cost × cantidad` de sus componentes. */
export function comboCost(components: readonly ComponentState[]): number {
  return components.reduce((sum, item) => sum + item.cost * item.quantity, 0);
}

/** Combos completos que alcanzan con el saldo actual; 0 sin componentes. */
export function comboStock(components: readonly ComponentState[]): number {
  if (components.length === 0) return 0;
  return Math.min(
    ...components.map((item) => Math.floor(item.stock / item.quantity)),
  );
}

export interface AvailabilityInput {
  active: boolean;
  soldOut: boolean;
  price: number;
  stock: number;
  /** `undefined` para productos simples. */
  components?: readonly ComponentState[];
}

export function isAvailable(input: AvailabilityInput): boolean {
  if (!input.active || input.soldOut || input.price <= 0) return false;
  if (input.components === undefined) return input.stock >= 1;
  return (
    input.components.length > 0 &&
    input.components.every(
      (item) => item.active && !item.soldOut && item.stock >= item.quantity,
    )
  );
}
