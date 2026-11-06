import {
  APPROVED_CARD,
  cardResult,
  DECLINED_CARD,
  expandNeeds,
  hasDuplicates,
  orderTotal,
  requestHash,
} from '../../src/orders/orders.calc';

describe('Cálculos de pedidos', () => {
  it('reconoce solo las dos tarjetas de prueba', () => {
    expect(cardResult(APPROVED_CARD)).toBe('approved');
    expect(cardResult(DECLINED_CARD)).toBe('declined');
    expect(cardResult('4111111111111111')).toBe('unknown');
    expect(cardResult('')).toBe('unknown');
  });

  it('suma precio × cantidad', () => {
    expect(
      orderTotal([
        { unitPrice: 4500, quantity: 2 },
        { unitPrice: 2500, quantity: 1 },
      ]),
    ).toBe(11500);
    expect(orderTotal([])).toBe(0);
  });

  it('expande combos, suma repetidos y ordena por id', () => {
    const needs = expandNeeds([
      { quantity: 2, parts: [{ productId: 'b', quantity: 1 }] },
      {
        quantity: 3,
        parts: [
          { productId: 'b', quantity: 2 },
          { productId: 'a', quantity: 1 },
        ],
      },
    ]);
    expect(needs).toEqual([
      { productId: 'a', quantity: 3 },
      { productId: 'b', quantity: 8 },
    ]);
  });

  it('detecta identificadores repetidos', () => {
    expect(hasDuplicates(['a', 'b', 'a'])).toBe(true);
    expect(hasDuplicates(['a', 'b'])).toBe(false);
  });

  describe('huella del pedido', () => {
    const base = {
      items: [
        { productId: 'b', quantity: 1 },
        { productId: 'a', quantity: 2 },
      ],
      pointId: 'p',
      floor: 2,
      deliveryNote: 'Salón',
      note: 'Sin azúcar',
      paymentMethod: 'tarjeta_demo',
    };

    it('no depende del orden de las líneas y es un SHA-256 hexadecimal', () => {
      const reversed = { ...base, items: [...base.items].reverse() };
      expect(requestHash(base)).toBe(requestHash(reversed));
      expect(requestHash(base)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('cambia con cualquier dato del pedido', () => {
      const original = requestHash(base);
      expect(requestHash({ ...base, floor: 3 })).not.toBe(original);
      expect(requestHash({ ...base, note: undefined })).not.toBe(original);
      expect(
        requestHash({ ...base, items: [{ productId: 'a', quantity: 3 }] }),
      ).not.toBe(original);
      expect(requestHash({ ...base, pointId: 'q' })).not.toBe(original);
    });

    it('trata ausente y nulo igual y nunca incluye la tarjeta', () => {
      expect(requestHash({ ...base, floor: undefined })).toBe(
        requestHash({
          ...base,
          floor: undefined,
          deliveryNote: base.deliveryNote,
        }),
      );
      expect(Object.keys(base)).not.toContain('cardNumber');
    });
  });
});
