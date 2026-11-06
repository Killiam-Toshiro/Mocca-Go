/** Pedidos máximos por ronda (D-106). */
export const MAX_ROUND_ORDERS = 5;
/** Rondas activas máximas por repartidor (D-106). */
export const MAX_ACTIVE_ROUNDS = 2;
/** Minutos entre la salida y la hora estimada de llegada (constante, D-106). */
export const ETA_MINUTES = 15;

/** Enlace de WhatsApp: el teléfono E.164 sin el `+`. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/^\+/, '')}`;
}

/** Hora estimada de llegada para una salida dada. */
export function etaFrom(start: Date): Date {
  return new Date(start.getTime() + ETA_MINUTES * 60_000);
}

export interface QueueEntry<T> {
  zoneId: string;
  zoneName: string;
  /** Número de pedido: el menor es el más antiguo. */
  number: number;
  order: T;
}

export interface ZoneGroup<T> {
  zoneId: string;
  zoneName: string;
  oldestNumber: number;
  orders: T[];
}

/**
 * Agrupa los pedidos `listo` por zona (RN-83): las zonas se ordenan por su
 * pedido más antiguo y dentro de cada zona los pedidos van del más antiguo al
 * más nuevo. La zona sugerida es la primera.
 */
export function groupByZone<T>(entries: QueueEntry<T>[]): {
  suggestedZoneId: string | null;
  zones: ZoneGroup<T>[];
} {
  const sorted = [...entries].sort((a, b) => a.number - b.number);
  const zones = new Map<string, ZoneGroup<T>>();
  for (const entry of sorted) {
    const group = zones.get(entry.zoneId);
    if (group) group.orders.push(entry.order);
    else
      zones.set(entry.zoneId, {
        zoneId: entry.zoneId,
        zoneName: entry.zoneName,
        oldestNumber: entry.number,
        orders: [entry.order],
      });
  }
  const list = [...zones.values()];
  return { suggestedZoneId: list[0]?.zoneId ?? null, zones: list };
}
