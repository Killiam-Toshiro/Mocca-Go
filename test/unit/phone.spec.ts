import { E164_PATTERN, normalizePhone } from '../../src/customers/phone';

describe('normalizePhone (RN-19)', () => {
  it.each([
    '3001234567',
    '300 123 4567',
    '(300) 123-4567',
    '300.123.4567',
    '+57 300 123 4567',
    '+573001234567',
    '573001234567',
    '0057 3001234567',
    '  3001234567  ',
  ])('normaliza el celular colombiano %p', (input) => {
    expect(normalizePhone(input)).toBe('+573001234567');
  });

  it.each([
    ['+1 415 555 2671', '+14155552671'],
    ['+34 612 345 678', '+34612345678'],
    ['0034612345678', '+34612345678'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('acepta el número internacional %p', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '2001234567',
    '300123',
    '30012345678',
    '+57 601 234 5678',
    '+573001234',
    '5730012345678',
    '+0123456789',
    '+1234567',
    '+1234567890123456',
    '3001234567x',
    '++573001234567',
    '300+1234567',
    '14155552671',
  ])('rechaza %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('todo resultado cumple el formato E.164 de la base de datos', () => {
    for (const input of ['3001234567', '+14155552671', '0034612345678'])
      expect(normalizePhone(input)).toMatch(E164_PATTERN);
  });
});
