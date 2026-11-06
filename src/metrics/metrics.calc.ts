import { addDays, bogotaDate, startOfBogotaDay } from '../common/calendar-date';

/** Días del periodo por defecto (hoy y los 29 anteriores). */
export const DEFAULT_PERIOD_DAYS = 30;
/** Periodo máximo que se admite consultar. */
export const MAX_PERIOD_DAYS = 366;
/** Reparto «a tiempo»: lo que promete la hora estimada del 018. */
export const ON_TIME_MINUTES = 15;

export interface Period {
  from: string;
  to: string;
  days: number;
  /** Primer instante del periodo (inclusive). */
  start: Date;
  /** Primer instante posterior al periodo (exclusivo). */
  end: Date;
}

export type PeriodResult = { period: Period } | { error: string };

/** Días entre dos fechas `YYYY-MM-DD`, ambas inclusive. */
export function daysBetween(from: string, to: string): number {
  const ms =
    new Date(`${to}T00:00:00.000Z`).getTime() -
    new Date(`${from}T00:00:00.000Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Periodo de las métricas (RN-105): por defecto los últimos 30 días hasta hoy,
 * en hora de Colombia. Devuelve el error de validación en vez de lanzarlo.
 */
export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): PeriodResult {
  const last = to ?? bogotaDate(now);
  const first = from ?? addDays(last, -(DEFAULT_PERIOD_DAYS - 1));
  if (first > last) return { error: 'from no puede ser posterior a to.' };
  const days = daysBetween(first, last);
  if (days > MAX_PERIOD_DAYS)
    return {
      error: `El periodo no puede pasar de ${MAX_PERIOD_DAYS} días.`,
    };
  return {
    period: {
      from: first,
      to: last,
      days,
      start: startOfBogotaDay(first),
      end: startOfBogotaDay(addDays(last, 1)),
    },
  };
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Número que llega de PostgreSQL como texto o `null`. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Razón `part / whole` con `digits` decimales; `null` si no hay denominador. */
export function ratio(
  part: number,
  whole: number,
  digits: number,
): number | null {
  return whole > 0 ? round(part / whole, digits) : null;
}

/** Minutos con un decimal; `null` si no hay dato. */
export function minutes(value: unknown): number | null {
  const parsed = num(value);
  return parsed === null ? null : round(parsed, 1);
}

export interface DailyPoint {
  date: string;
  orders: number;
  revenue: number;
}

/** Serie diaria con ceros en los días sin ventas. */
export function fillDays(
  period: Pick<Period, 'from' | 'to'>,
  rows: { day: string; orders: number; revenue: number }[],
): DailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days = daysBetween(period.from, period.to);
  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(period.from, offset);
    const row = byDay.get(date);
    return { date, orders: row?.orders ?? 0, revenue: row?.revenue ?? 0 };
  });
}
