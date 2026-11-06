import {
  addDays,
  bogotaDate,
  isCalendarDate,
  startOfBogotaDay,
} from '../../src/common/calendar-date';
import {
  daysBetween,
  fillDays,
  minutes,
  num,
  ratio,
  resolvePeriod,
  round,
} from '../../src/metrics/metrics.calc';

describe('Fechas de Colombia', () => {
  it('isCalendarDate acepta solo fechas que existen', () => {
    expect(isCalendarDate('2026-11-05')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-1-1',
      'ayer',
      '',
      5,
      null,
    ])
      expect(isCalendarDate(bad)).toBe(false);
  });

  it('el día empieza a las 05:00 UTC', () => {
    expect(startOfBogotaDay('2026-11-05').toISOString()).toBe(
      '2026-11-05T05:00:00.000Z',
    );
  });

  it('bogotaDate convierte un instante UTC a su día en Colombia', () => {
    expect(bogotaDate(new Date('2026-11-06T04:30:00Z'))).toBe('2026-11-05');
    expect(bogotaDate(new Date('2026-11-06T05:00:00Z'))).toBe('2026-11-06');
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-05', -29)).toBe('2026-10-07');
  });
});

describe('Periodo de las métricas', () => {
  const now = new Date('2026-11-06T03:00:00Z'); // 5 de noviembre, 22:00 en Colombia

  it('por defecto son los últimos 30 días hasta hoy (hora de Colombia)', () => {
    const result = resolvePeriod(undefined, undefined, now);
    if ('error' in result) throw new Error(result.error);
    expect(result.period).toMatchObject({
      from: '2026-10-07',
      to: '2026-11-05',
      days: 30,
    });
    expect(result.period.start.toISOString()).toBe('2026-10-07T05:00:00.000Z');
    expect(result.period.end.toISOString()).toBe('2026-11-06T05:00:00.000Z');
  });

  it('con solo from o solo to completa el otro extremo', () => {
    const onlyTo = resolvePeriod(undefined, '2026-11-30', now);
    expect('period' in onlyTo && onlyTo.period.from).toBe('2026-11-01');
    const onlyFrom = resolvePeriod('2026-11-01', undefined, now);
    expect('period' in onlyFrom && onlyFrom.period.days).toBe(5);
  });

  it('un solo día vale 1 y el máximo es 366', () => {
    const one = resolvePeriod('2026-11-05', '2026-11-05', now);
    expect('period' in one && one.period.days).toBe(1);
    const max = resolvePeriod('2025-11-05', '2026-11-05', now);
    expect('period' in max && max.period.days).toBe(366);
    expect(resolvePeriod('2025-11-04', '2026-11-05', now)).toHaveProperty(
      'error',
    );
  });

  it('from posterior a to es un error', () => {
    expect(resolvePeriod('2026-11-06', '2026-11-05', now)).toEqual({
      error: 'from no puede ser posterior a to.',
    });
  });

  it('daysBetween cuenta ambos extremos', () => {
    expect(daysBetween('2026-11-01', '2026-11-05')).toBe(5);
  });
});

describe('Redondeos y tasas', () => {
  it('round, ratio y minutes', () => {
    expect(round(0.35555, 4)).toBe(0.3556);
    expect(round(2.5, 0)).toBe(3);
    expect(ratio(8000, 22500, 4)).toBe(0.3556);
    expect(ratio(1, 0, 4)).toBeNull();
    expect(minutes('23.3333')).toBe(23.3);
    expect(minutes(null)).toBeNull();
    expect(minutes(undefined)).toBeNull();
  });

  it('num convierte texto numérico y descarta lo que no lo es', () => {
    expect(num('12')).toBe(12);
    expect(num(null)).toBeNull();
    expect(num('abc')).toBeNull();
  });

  it('fillDays rellena con ceros los días sin ventas', () => {
    const series = fillDays({ from: '2026-11-01', to: '2026-11-03' }, [
      { day: '2026-11-02', orders: 2, revenue: 9000 },
    ]);
    expect(series).toEqual([
      { date: '2026-11-01', orders: 0, revenue: 0 },
      { date: '2026-11-02', orders: 2, revenue: 9000 },
      { date: '2026-11-03', orders: 0, revenue: 0 },
    ]);
  });
});
