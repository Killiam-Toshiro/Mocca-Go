import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Customer } from '../../src/customers/entities/customer.entity';
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

  it('la proyección permite solo identidad, contacto y fechas, incluso si la entidad contiene secretos', () => {
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
      'email',
      'fullName',
      'id',
      'phone',
      'role',
      'updatedAt',
      'username',
    ]);
    expect(JSON.stringify(response)).not.toMatch(
      /hidden|unexpected|Failures|blocked|Note/,
    );
  });

  it('la proyección añade correo, nombre y teléfono solo cuando hay perfil de cliente', () => {
    const user = Object.assign(new User(), {
      id: randomUUID(),
      username: 'c0123456789abcdef',
      role: 'cliente',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const customer = Object.assign(new Customer(), {
      userId: user.id,
      email: 'ana@u.icesi.edu.co',
      fullName: 'Ana Pérez',
      phone: '+573001234567',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(userView(user, customer)).toMatchObject({
      email: 'ana@u.icesi.edu.co',
      fullName: 'Ana Pérez',
      phone: '+573001234567',
    });
    expect(userView(user)).toMatchObject({
      email: null,
      fullName: null,
      phone: null,
    });
    expect(userView(user, null).email).toBeNull();
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
