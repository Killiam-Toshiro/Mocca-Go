import { createHash } from 'node:crypto';

/** Funciones puras de pedidos: total, expansión de combos, huella y tarjetas. */

export const MAX_ORDER_TOTAL = 200_000;
export const APPROVED_CARD = '4242424242424242';
export const DECLINED_CARD = '4000000000000002';

export type CardResult = 'approved' | 'declined' | 'unknown';

/** Resultado de las dos tarjetas de prueba; cualquier otra no existe. */
export function cardResult(cardNumber: string): CardResult {
  if (cardNumber === APPROVED_CARD) return 'approved';
  if (cardNumber === DECLINED_CARD) return 'declined';
  return 'unknown';
}

export function orderTotal(
  lines: readonly { unitPrice: number; quantity: number }[],
): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export interface Need {
  productId: string;
  quantity: number;
}

/**
 * Suma lo que consume cada línea (un combo aporta sus componentes × cantidad)
 * y lo ordena por id: bloquear siempre en ese orden evita interbloqueos.
 */
export function expandNeeds(
  lines: readonly { quantity: number; parts: readonly Need[] }[],
): Need[] {
  const totals = new Map<string, number>();
  for (const line of lines)
    for (const part of line.parts)
      totals.set(
        part.productId,
        (totals.get(part.productId) ?? 0) + part.quantity * line.quantity,
      );
  return [...totals.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : 1));
}

export function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

export interface HashInput {
  items: readonly { productId: string; quantity: number }[];
  pointId: string;
  floor?: number;
  deliveryNote?: string;
  note?: string;
  paymentMethod: string;
}

/**
 * Huella del contenido del pedido. No incluye el número de tarjeta: ese dato
 * nunca se conserva, ni siquiera en forma de resumen.
 */
export function requestHash(input: HashInput): string {
  const canonical = JSON.stringify({
    items: [...input.items]
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
    pointId: input.pointId,
    floor: input.floor ?? null,
    deliveryNote: input.deliveryNote ?? null,
    note: input.note ?? null,
    paymentMethod: input.paymentMethod,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
