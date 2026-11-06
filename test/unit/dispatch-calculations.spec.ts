import {
  ETA_MINUTES,
  etaFrom,
  groupByZone,
  MAX_ACTIVE_ROUNDS,
  MAX_ROUND_ORDERS,
  whatsappUrl,
} from '../../src/dispatch/dispatch.calc';

describe('Cálculos del despacho', () => {
  it('constantes de negocio', () => {
    expect(MAX_ROUND_ORDERS).toBe(5);
    expect(MAX_ACTIVE_ROUNDS).toBe(2);
    expect(ETA_MINUTES).toBe(15);
  });

  it('whatsappUrl quita el signo + del teléfono E.164', () => {
    expect(whatsappUrl('+573001234567')).toBe('https://wa.me/573001234567');
    expect(whatsappUrl('573001234567')).toBe('https://wa.me/573001234567');
  });

  it('etaFrom suma 15 minutos exactos sin mutar la fecha de salida', () => {
    const start = new Date('2026-11-05T17:00:00.000Z');
    expect(etaFrom(start).toISOString()).toBe('2026-11-05T17:15:00.000Z');
    expect(start.toISOString()).toBe('2026-11-05T17:00:00.000Z');
  });

  describe('groupByZone', () => {
    const entry = (zoneId: string, number: number) => ({
      zoneId,
      zoneName: `Zona ${zoneId}`,
      number,
      order: number,
    });

    it('sin pedidos no hay zona sugerida', () => {
      expect(groupByZone([])).toEqual({ suggestedZoneId: null, zones: [] });
    });

    it('ordena las zonas por su pedido más antiguo y los pedidos de más antiguo a más nuevo', () => {
      const result = groupByZone([
        entry('B', 1005),
        entry('A', 1003),
        entry('B', 1001),
        entry('A', 1010),
        entry('C', 1002),
      ]);
      expect(result.suggestedZoneId).toBe('B');
      expect(result.zones.map((z) => z.zoneId)).toEqual(['B', 'C', 'A']);
      expect(result.zones.map((z) => z.oldestNumber)).toEqual([
        1001, 1002, 1003,
      ]);
      expect(result.zones[0].orders).toEqual([1001, 1005]);
      expect(result.zones[2].orders).toEqual([1003, 1010]);
    });

    it('no modifica la lista de entrada', () => {
      const input = [entry('B', 2), entry('A', 1)];
      groupByZone(input);
      expect(input.map((e) => e.number)).toEqual([2, 1]);
    });
  });
});
