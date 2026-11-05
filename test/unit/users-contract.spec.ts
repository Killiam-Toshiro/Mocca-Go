import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { User } from '../../src/users/entities/user.entity';
import { userView } from '../../src/users/user.view';
import {
  ChangeRoleDto,
  CreateUserDto,
  ListUsersDto,
  UpdateUserDto,
} from '../../src/users/users.dto';

describe('Contratos y proyección de usuarios', () => {
  const valid = {
    username: 'new_user',
    password: 'Test-only-password',
    role: 'operador',
  };
  const options = { whitelist: true, forbidNonWhitelisted: true };

  it('la proyección permite solo identidad y fechas, incluso si la entidad contiene secretos', () => {
    const user = Object.assign(new User(), {
      id: randomUUID(),
      username: 'fixture',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: 'hidden-password-hash',
      loginFailures: 3,
      blockedUntil: new Date(),
      internalNote: 'unexpected-sensitive-property',
    });
    const response = userView(user);
    expect(Object.keys(response).sort()).toEqual([
      'createdAt',
      'id',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(JSON.stringify(response)).not.toMatch(
      /hidden|unexpected|Failures|blocked|Note/,
    );
  });

  it.each(['admin', 'operador'])(
    'acepta los dos roles explícitos (%s)',
    (role) => {
      expect(
        validateSync(
          plainToInstance(CreateUserDto, { ...valid, role }),
          options,
        ),
      ).toEqual([]);
      expect(
        validateSync(plainToInstance(ChangeRoleDto, { role }), options),
      ).toEqual([]);
    },
  );

  it.each([
    { role: 'superadmin' },
    { role: null },
    { role: undefined },
    { username: 'UPPERCASE' },
    { username: ' space ' },
    { username: 'ab' },
    { username: 'x'.repeat(65) },
    { password: 'x'.repeat(11) },
    { password: 'x'.repeat(129) },
    { password: 123456789012 },
    { passwordHash: 'injected' },
    { stock: 0 },
  ])('rechaza creación fuera del contrato %j', (changes) => {
    expect(
      validateSync(
        plainToInstance(CreateUserDto, { ...valid, ...changes }),
        options,
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    { username: 'renamed' },
    { username: 'a.b' },
    { username: 'x'.repeat(64) },
    { password: 'x'.repeat(12) },
    { password: 'x'.repeat(128) },
    { username: 'renamed', password: 'Test-only-password' },
    // El body vacío es válido para el DTO; lo rechaza el servicio con 400.
    {},
  ])('acepta edición dentro del contrato %j', (body) => {
    expect(validateSync(plainToInstance(UpdateUserDto, body), options)).toEqual(
      [],
    );
  });

  it.each([
    { username: null },
    { password: null },
    { username: 'UPPERCASE' },
    { username: ' space ' },
    { username: 'ab' },
    { username: 'x'.repeat(65) },
    { username: '.dot' },
    { username: 42 },
    { password: 'x'.repeat(11) },
    { password: 'x'.repeat(129) },
    { password: 123456789012 },
    { role: 'admin' },
    { passwordHash: 'injected' },
    { id: randomUUID() },
    { loginFailures: 0 },
  ])('rechaza edición fuera del contrato %j', (changes) => {
    expect(
      validateSync(
        plainToInstance(UpdateUserDto, { username: 'renamed', ...changes }),
        options,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('paginación conserva strings sin coerción de entradas inválidas', () => {
    for (const query of [
      {},
      { page: '1', limit: '1' },
      { page: '10000', limit: '100' },
    ])
      expect(
        validateSync(plainToInstance(ListUsersDto, query), options),
      ).toEqual([]);
    for (const query of [
      { page: '01' },
      { page: '0' },
      { page: '10001' },
      { page: ['1', '2'] },
      { page: 1 },
      { limit: '101' },
      { limit: '1e2' },
      { limit: '1.0' },
      { limit: ' 1' },
      { limit: '0' },
      { role: 'admin' },
    ])
      expect(
        validateSync(plainToInstance(ListUsersDto, query), options).length,
      ).toBeGreaterThan(0);
  });
});
