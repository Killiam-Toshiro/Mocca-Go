import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { StockMovement } from '../../src/movements/entities/stock-movement.entity';
import { User } from '../../src/users/entities/user.entity';
import { movementView } from '../../src/movements/movement.view';
import {
  CreateMovementDto,
  ListMovementsDto,
  MAX_STOCK,
} from '../../src/movements/movements.dto';

describe('Contratos de movimientos y proyección auditada', () => {
  const valid = {
    productId: randomUUID(),
    type: 'IN',
    quantity: 1,
    reason: 'Carga inicial',
  };
  const options = { whitelist: true, forbidNonWhitelisted: true };
  const errors = <T extends object>(type: new () => T, value: object) =>
    validateSync(plainToInstance(type, value), options);

  it.each([
    {},
    { type: 'OUT' },
    { quantity: MAX_STOCK },
    { reason: 'x'.repeat(300) },
  ])('acepta entradas en los límites %j', (changes) => {
    expect(errors(CreateMovementDto, { ...valid, ...changes })).toEqual([]);
  });

  it.each([
    { productId: undefined },
    { productId: 'no-uuid' },
    { productId: '12345678-1234-1234-1234-123456789012' },
    { type: undefined },
    { type: 'in' },
    { type: 'ADJUST' },
    { quantity: undefined },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: '1' },
    { quantity: true },
    { quantity: null },
    { quantity: MAX_STOCK + 1 },
    { reason: undefined },
    { reason: null },
    { reason: 123 },
    { reason: '' },
    { reason: ' \t\n' },
    { reason: 'a\u0000b' },
    { reason: 'x'.repeat(301) },
    { stock: 100 },
    { userId: randomUUID() },
    { seedKey: 'injected' },
  ])('rechaza creación fuera del contrato %j', (changes) => {
    expect(
      errors(CreateMovementDto, { ...valid, ...changes }).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    {},
    { productId: valid.productId },
    { type: 'OUT' },
    { productId: valid.productId, type: 'IN', page: '10000', limit: '100' },
  ])('acepta filtros válidos %j', (query) => {
    expect(errors(ListMovementsDto, query)).toEqual([]);
  });

  it.each([
    { productId: 'bad' },
    { productId: ['a', 'b'] },
    { type: 'in' },
    { type: ['IN', 'OUT'] },
    { page: '01' },
    { page: '0' },
    { page: '10001' },
    { page: ['1', '2'] },
    { limit: '101' },
    { limit: '1.5' },
    { limit: '1e2' },
    { userId: valid.productId },
  ])('rechaza filtros no canónicos %j', (query) => {
    expect(errors(ListMovementsDto, query).length).toBeGreaterThan(0);
  });

  it('expone responsable e identidad sin claves internas o secretos', () => {
    const user = Object.assign(new User(), {
      id: randomUUID(),
      username: 'fixture',
      passwordHash: 'private-hash',
      totpSecret: 'private-secret',
      role: 'admin',
    });
    const movement = Object.assign(new StockMovement(), {
      id: randomUUID(),
      productId: valid.productId,
      type: 'IN',
      quantity: 1,
      reason: 'Carga',
      createdAt: new Date(),
      user,
      userId: user.id,
      seedKey: 'internal-seed-key',
      sessionId: 'private-session',
    });
    const view = movementView(movement);
    expect(Object.keys(view).sort()).toEqual([
      'createdAt',
      'id',
      'productId',
      'quantity',
      'reason',
      'type',
      'user',
    ]);
    expect(view.user).toEqual({ id: user.id, username: 'fixture' });
    expect(JSON.stringify(view)).not.toMatch(/private|seedKey|userId|role/);
  });
});
