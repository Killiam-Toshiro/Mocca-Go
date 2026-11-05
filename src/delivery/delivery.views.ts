import { DeliveryPoint } from './entities/delivery-point.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';

export interface PublicPointView {
  id: string;
  name: string;
  hint: string | null;
  floors: number | null;
}

export interface PublicZoneView {
  id: string;
  name: string;
  points: PublicPointView[];
}

export interface AdminPointView extends PublicPointView {
  zoneId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminZoneView {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  points: AdminPointView[];
}

export function adminPointView(point: DeliveryPoint): AdminPointView {
  return {
    id: point.id,
    zoneId: point.zoneId,
    name: point.name,
    hint: point.hint,
    floors: point.floors,
    active: point.active,
    createdAt: point.createdAt,
    updatedAt: point.updatedAt,
  };
}

export function adminZoneView(
  zone: DeliveryZone,
  points: DeliveryPoint[],
): AdminZoneView {
  return {
    id: zone.id,
    name: zone.name,
    active: zone.active,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
    points: points.map(adminPointView),
  };
}

export type JoinedPoint = DeliveryPoint & { zone: DeliveryZone };

export function compareByName(
  a: { name: string; id: string },
  b: { name: string; id: string },
) {
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Agrupa los puntos activos por zona, ordenados por nombre (RN-45). */
export function publicZones(points: JoinedPoint[]): PublicZoneView[] {
  const byZone = new Map<
    string,
    { zone: DeliveryZone; points: JoinedPoint[] }
  >();
  for (const point of points) {
    const entry = byZone.get(point.zone.id) ?? { zone: point.zone, points: [] };
    entry.points.push(point);
    byZone.set(point.zone.id, entry);
  }
  return [...byZone.values()]
    .sort((a, b) => compareByName(a.zone, b.zone))
    .map(({ zone, points: list }) => ({
      id: zone.id,
      name: zone.name,
      points: list.sort(compareByName).map((point) => ({
        id: point.id,
        name: point.name,
        hint: point.hint,
        floors: point.floors,
      })),
    }));
}
