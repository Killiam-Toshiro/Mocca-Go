import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  Not,
} from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { hashPassword } from '../seed/password';
import { User, UserRole } from '../users/entities/user.entity';
import { RuntimeEnvironment } from '../config/runtime-environment';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.config';
import { verifyPassword } from './crypto';
import { Session } from './entities/session.entity';

export interface Identity {
  id: string;
  username: string;
  role: UserRole;
  sessionId: string;
}
interface AccessClaims {
  sub: string;
  sid: string;
  typ: string;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly source: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<RuntimeEnvironment, true>,
  ) {}

  private get accessSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
  }

  private rejected(): UnauthorizedException {
    return new UnauthorizedException('Credenciales inválidas.');
  }

  private lockUser(
    manager: EntityManager,
    where: FindOptionsWhere<User>,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.loginFailures',
        'user.blockedUntil',
      ])
      .where(where)
      .setLock('pessimistic_write')
      .getOne();
  }

  /** Localiza la cuenta por username (personal) o por correo (clientes). */
  private async findAccount(
    manager: EntityManager,
    account: { username: string } | { email: string },
  ): Promise<User | null> {
    if ('username' in account) return this.lockUser(manager, account);
    const customer = await manager.getRepository(Customer).findOne({
      where: { email: account.email },
      select: { userId: true },
    });
    return customer ? this.lockUser(manager, { id: customer.userId }) : null;
  }

  /**
   * Valida usuario y contraseña bajo bloqueo de la fila del usuario, para que
   * los intentos fallidos se cuenten de forma atómica, y en la misma
   * transacción crea la sesión y firma el JWT. Los fallos se confirman (no se
   * lanza excepción dentro de la transacción) para que el contador persista.
   */
  async login(
    account: { username: string } | { email: string },
    password: string,
  ): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresIn: number }> {
    const result = await this.source.transaction(async (manager) => {
      const user = await this.findAccount(manager, account);
      const validPassword = await verifyPassword(password, user?.passwordHash);
      if (!user) return null;
      const now = Date.now();
      const accessSeconds = this.accessSeconds;
      if (user.blockedUntil && user.blockedUntil.getTime() > now) return null;
      if (user.blockedUntil) {
        user.loginFailures = 0;
        user.blockedUntil = null;
      }
      if (!validPassword) {
        user.loginFailures++;
        if (user.loginFailures >= 5)
          user.blockedUntil = new Date(now + 900_000);
        await manager.save(user);
        return null;
      }
      user.loginFailures = 0;
      user.blockedUntil = null;
      await manager.save(user);
      const session = await manager.save(Session, {
        userId: user.id,
        expiresAt: new Date(now + accessSeconds * 1000),
      });
      const accessToken = await this.jwt.signAsync({
        sub: user.id,
        sid: session.id,
        typ: 'access',
      });
      return {
        accessToken,
        tokenType: 'Bearer' as const,
        expiresIn: accessSeconds,
      };
    });
    if (!result) throw this.rejected();
    return result;
  }

  /**
   * Cambia la contraseña propia (RN-26). La actual se verifica con el mismo
   * contador y bloqueo del login, bajo bloqueo de la fila; los fallos se
   * confirman (no se lanza dentro de la transacción) para que el contador
   * persista. Un cambio correcto revoca las demás sesiones.
   */
  async changePassword(
    identity: Identity,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const newHash = await hashPassword(newPassword);
    const outcome = await this.source.transaction(async (manager) => {
      const user = await this.lockUser(manager, { id: identity.id });
      if (!user) return 'unauthorized' as const;
      const validPassword = await verifyPassword(
        currentPassword,
        user.passwordHash,
      );
      const now = Date.now();
      if (user.blockedUntil && user.blockedUntil.getTime() > now)
        return 'rejected' as const;
      if (user.blockedUntil) {
        user.loginFailures = 0;
        user.blockedUntil = null;
      }
      if (!validPassword) {
        user.loginFailures++;
        if (user.loginFailures >= 5)
          user.blockedUntil = new Date(now + 900_000);
        await manager.save(user);
        return 'rejected' as const;
      }
      if (await verifyPassword(newPassword, user.passwordHash)) {
        await manager.save(user);
        return 'same' as const;
      }
      user.passwordHash = newHash;
      user.loginFailures = 0;
      user.blockedUntil = null;
      await manager.save(user);
      await manager
        .getRepository(Session)
        .update(
          { userId: user.id, revokedAt: IsNull(), id: Not(identity.sessionId) },
          { revokedAt: new Date() },
        );
      return 'changed' as const;
    });
    if (outcome === 'unauthorized') throw this.rejected();
    if (outcome === 'rejected')
      throw new ForbiddenException('La contraseña actual no es correcta.');
    if (outcome === 'same')
      throw new BadRequestException(
        'La contraseña nueva debe ser distinta de la actual.',
      );
  }

  async authenticate(token: string): Promise<Identity> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (
        claims.typ !== 'access' ||
        !isUUID(claims.sub, '4') ||
        !isUUID(claims.sid, '4') ||
        !Number.isSafeInteger(claims.exp)
      )
        throw this.rejected();
    } catch {
      throw this.rejected();
    }
    const session = await this.source.getRepository(Session).findOne({
      where: { id: claims.sid, userId: claims.sub },
      relations: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw this.rejected();
    return {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
      sessionId: session.id,
    };
  }

  /** Indica si la sesión de una identidad ya autenticada sigue vigente. */
  async isSessionActive(identity: Identity): Promise<boolean> {
    const session = await this.source.getRepository(Session).findOne({
      where: { id: identity.sessionId, userId: identity.id },
      select: { id: true, revokedAt: true, expiresAt: true },
    });
    return (
      session !== null &&
      !session.revokedAt &&
      session.expiresAt.getTime() > Date.now()
    );
  }

  async logout(identity: Identity): Promise<void> {
    await this.source
      .getRepository(Session)
      .update(
        { id: identity.sessionId, userId: identity.id },
        { revokedAt: new Date() },
      );
  }
}
