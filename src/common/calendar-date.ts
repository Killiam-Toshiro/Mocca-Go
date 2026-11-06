import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/** Fecha de calendario `YYYY-MM-DD` que existe de verdad (no admite 2026-02-30). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function IsCalendarDate(options?: ValidationOptions) {
  return (target: object, propertyName: string): void =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName,
      options: {
        message: ({ property }: ValidationArguments) =>
          `${property} debe ser una fecha YYYY-MM-DD válida.`,
        ...options,
      },
      validator: { validate: isCalendarDate },
    });
}

/** Colombia está en UTC−5 todo el año (sin horario de verano). */
export const BOGOTA_OFFSET = '-05:00';

/** Instante en que empieza el día de calendario `date` en hora de Colombia. */
export function startOfBogotaDay(date: string): Date {
  return new Date(`${date}T00:00:00.000${BOGOTA_OFFSET}`);
}

/** Fecha de calendario (en Colombia) que corresponde a un instante. */
export function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Suma `days` días a una fecha `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}
