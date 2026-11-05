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
} from '../common/database-errors';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { hashPassword } from '../seed/password';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './users.dto';
import { UserView, userView } from './user.view';

export const USER_NOT_FOUND = 'Usuario no encontrado.';
const USERNAME_TAKEN = 'El username ya existe.';
const USER_HAS_MOVEMENTS =
  'El usuario tiene movimientos; no se puede eliminar.';

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

  private async isLastAdmin(manager: EntityManager): Promise<boolean> {
    return (await manager.getRepository(User).countBy({ role: 'admin' })) <= 1;
  }

  async create(actor: Identity, input: CreateUserDto): Promise<UserView> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.adminTransaction(actor, 'write', async (manager) => {
        const user = await manager
          .getRepository(User)
          .save({ username: input.username, role: input.role, passwordHash });
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
          createdAt: true,
          updatedAt: true,
        },
        order: { username: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      return {
        data: users.map(userView),
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
      return userView(user);
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
    if (input.username === undefined && input.password === undefined)
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
            'username' | 'passwordHash' | 'loginFailures' | 'blockedUntil'
          >
        > = {};
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
        if (Object.keys(changes).length === 0) return userView(user);
        await repository.update({ id }, changes);
        return userView(await repository.findOneByOrFail({ id }));
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
      if (isConstraintViolation(error, '23503', MOVEMENT_USER_FK))
        throw new ConflictException(USER_HAS_MOVEMENTS);
      throw error;
    }
  }

  changeRole(actor: Identity, id: string, role: UserRole): Promise<UserView> {
    return this.adminTransaction(actor, 'write', async (manager) => {
      const repository = manager.getRepository(User);
      const user = await this.lockUser(manager, id);
      if (!user) throw new NotFoundException(USER_NOT_FOUND);
      if (user.role === role) return userView(user);
      if (user.role === 'admin' && (await this.isLastAdmin(manager)))
        throw new ConflictException(
          'No se puede degradar al último administrador.',
        );
      await repository.update({ id }, { role });
      return userView(await repository.findOneByOrFail({ id }));
    });
  }
}
