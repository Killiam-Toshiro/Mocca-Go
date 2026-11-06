import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThan,
  Not,
  QueryFailedError,
} from 'typeorm';
import { Identity } from '../auth/auth.service';
import { Session } from '../auth/entities/session.entity';
import {
  isConstraintViolation,
  MOVEMENT_USER_FK,
  ORDER_CUSTOMER_FK,
  ORDER_EVENT_USER_FK,
  ROUND_COURIER_FK,
} from '../common/database-errors';
import { Customer } from '../customers/entities/customer.entity';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { hashPassword } from '../seed/password';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './users.dto';
import { UserView, userView } from './user.view';

export const USER_NOT_FOUND = 'Usuario no encontrado.';
export const CLIENT_ROLE = 'Un cliente no cambia de rol.';
const USERNAME_TAKEN = 'El username ya existe.';
const USER_HAS_MOVEMENTS =
  'El usuario tiene movimientos; no se puede eliminar.';
const COURIER_CONTACT =
  'Un repartidor necesita teléfono y nombre de contacto (phone y fullName).';
const CUSTOMER_CONTACT =
  'Los datos de contacto de un cliente los edita él mismo en /customers/me.';

function isDuplicateUsername(error: unknown): boolean {
  return isConstraintViolation(error, '23505', 'users_username_key');
}

@Injectable()
export class UsersService {
  constructor(private readonly source: DataSource) {}

  private adminTransaction<T>(
    actor: Identity,
    mode: 'read' | 'write',
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.source.transaction(async (manager) => {
      const lock =
        mode === 'read'
          ? 'pg_advisory_xact_lock_shared'
          : 'pg_advisory_xact_lock';
      await manager.query(`SELECT ${lock}($1, $2)`, [721005, 1]);
      const session = await manager.getRepository(Session).findOne({
        where: {
          id: actor.sessionId,
          userId: actor.id,
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        relations: { user: true },
      });
      if (!session) throw new UnauthorizedException('Credenciales inválidas.');
      if (session.user.role !== 'admin')
        throw new ForbiddenException('Permisos insuficientes.');
      return operation(manager);
    });
  }

  private lockUser(manager: EntityManager, id: string): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  /** Vista de un usuario con los datos de contacto si es cliente. */
  private async viewOf(manager: EntityManager, user: User): Promise<UserView> {
    const customer =
      user.role === 'cliente'
        ? await manager.getRepository(Customer).findOneBy({ userId: user.id })
        : null;
    return userView(user, customer);
  }

  private async isLastAdmin(manager: EntityManager): Promise<boolean> {
    return (await manager.getRepository(User).countBy({ role: 'admin' })) <= 1;
  }

  async create(actor: Identity, input: CreateUserDto): Promise<UserView> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.adminTransaction(actor, 'write', async (manager) => {
        const user = await manager.getRepository(User).save({
          username: input.username,
          role: input.role,
          passwordHash,
          phone: input.phone ?? null,
          fullName: input.fullName ?? null,
        });
        return userView(user);
      });
    } catch (error) {
      if (isDuplicateUsername(error))
        throw new ConflictException(USERNAME_TAKEN);
      if (error instanceof QueryFailedError)
        throw new InternalServerErrorException('No se pudo crear el usuario.');
      throw error;
    }
  }

  list(
    actor: Identity,
    input: ListUsersDto,
  ): Promise<{
    data: UserView[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const page = Number(input.page ?? '1');
    const limit = Number(input.limit ?? '20');
    return this.adminTransaction(actor, 'read', async (manager) => {
      const [users, total] = await manager.getRepository(User).findAndCount({
        select: {
          id: true,
          username: true,
          role: true,
          phone: true,
          fullName: true,
          createdAt: true,
          updatedAt: true,
        },
        order: { username: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      const customers = new Map(
        (
          await manager.getRepository(Customer).findBy({
            userId: In(
              users.filter((u) => u.role === 'cliente').map((u) => u.id),
            ),
          })
        ).map((customer) => [customer.userId, customer]),
      );
      return {
        data: users.map((user) => userView(user, customers.get(user.id))),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  findOne(actor: Identity, id: string): Promise<UserView> {
    return this.adminTransaction(actor, 'read', async (manager) => {
      const user = await manager.getRepository(User).findOneBy({ id });
      if (!user) throw new NotFoundException(USER_NOT_FOUND);
      return this.viewOf(manager, user);
    });
  }

  /**
   * Edita username y/o contraseña (RN-09). Solo escribe lo que cambia, así que
   * repetir el mismo username no modifica `updatedAt`. Una contraseña nueva
   * revoca las demás sesiones del usuario editado y reinicia su bloqueo.
   */
  async update(
    actor: Identity,
    id: string,
    input: UpdateUserDto,
  ): Promise<UserView> {
    if (
      input.username === undefined &&
      input.password === undefined &&
      input.phone === undefined &&
      input.fullName === undefined
    )
      throw new BadRequestException('Indica al menos un campo para editar.');
    const passwordHash =
      input.password === undefined
        ? undefined
        : await hashPassword(input.password);
    try {
      return await this.adminTransaction(actor, 'write', async (manager) => {
        const repository = manager.getRepository(User);
        const user = await this.lockUser(manager, id);
        if (!user) throw new NotFoundException(USER_NOT_FOUND);
        const changes: Partial<
          Pick<
            User,
            | 'username'
            | 'passwordHash'
            | 'loginFailures'
            | 'blockedUntil'
            | 'phone'
            | 'fullName'
          >
        > = {};
        if (input.phone !== undefined || input.fullName !== undefined) {
          if (user.role === 'cliente')
            throw new BadRequestException(CUSTOMER_CONTACT);
          if (input.phone !== undefined && input.phone !== user.phone)
            changes.phone = input.phone;
          if (input.fullName !== undefined && input.fullName !== user.fullName)
            changes.fullName = input.fullName;
        }
        if (input.username !== undefined && input.username !== user.username)
          changes.username = input.username;
        if (passwordHash !== undefined) {
          changes.passwordHash = passwordHash;
          changes.loginFailures = 0;
          changes.blockedUntil = null;
          await manager
            .getRepository(Session)
            .update(
              { userId: id, revokedAt: IsNull(), id: Not(actor.sessionId) },
              { revokedAt: new Date() },
            );
        }
        if (Object.keys(changes).length === 0)
          return this.viewOf(manager, user);
        await repository.update({ id }, changes);
        return this.viewOf(manager, await repository.findOneByOrFail({ id }));
      });
    } catch (error) {
      if (isDuplicateUsername(error))
        throw new ConflictException(USERNAME_TAKEN);
      throw error;
    }
  }

  /**
   * Elimina un usuario sin movimientos (RN-10). Se evalúa primero «último
   * admin» y después «auto-eliminación»: el actor siempre es admin, así que el
   * único admin solo puede ser él mismo. Las sesiones caen por ON DELETE
   * CASCADE; la FK RESTRICT del historial es la red de seguridad.
   */
  async remove(actor: Identity, id: string): Promise<void> {
    try {
      await this.adminTransaction(actor, 'write', async (manager) => {
        const user = await this.lockUser(manager, id);
        if (!user) throw new NotFoundException(USER_NOT_FOUND);
        if (user.role === 'admin' && (await this.isLastAdmin(manager)))
          throw new ConflictException(
            'No se puede eliminar al último administrador.',
          );
        if (user.id === actor.id)
          throw new ConflictException('No puedes eliminar tu propio usuario.');
        if (await manager.getRepository(StockMovement).existsBy({ userId: id }))
          throw new ConflictException(USER_HAS_MOVEMENTS);
        await manager.getRepository(User).delete({ id });
      });
    } catch (error) {
      if (
        isConstraintViolation(error, '23503', MOVEMENT_USER_FK) ||
        isConstraintViolation(error, '23503', ORDER_CUSTOMER_FK) ||
        isConstraintViolation(error, '23503', ORDER_EVENT_USER_FK) ||
        isConstraintViolation(error, '23503', ROUND_COURIER_FK)
      )
        throw new ConflictException(USER_HAS_MOVEMENTS);
      throw error;
    }
  }

  changeRole(actor: Identity, id: string, role: UserRole): Promise<UserView> {
    return this.adminTransaction(actor, 'write', async (manager) => {
      const repository = manager.getRepository(User);
      const user = await this.lockUser(manager, id);
      if (!user) throw new NotFoundException(USER_NOT_FOUND);
      if (user.role === 'cliente') throw new ConflictException(CLIENT_ROLE);
      if (user.role === role) return userView(user);
      if (role === 'repartidor' && (!user.phone || !user.fullName))
        throw new BadRequestException(COURIER_CONTACT);
      if (user.role === 'admin' && (await this.isLastAdmin(manager)))
        throw new ConflictException(
          'No se puede degradar al último administrador.',
        );
      await repository.update({ id }, { role });
      return userView(await repository.findOneByOrFail({ id }));
    });
  }
}
