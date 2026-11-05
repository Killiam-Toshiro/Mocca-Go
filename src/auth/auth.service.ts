import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { ACCESS_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from './auth.config';
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
  ) {}

  private rejected(): UnauthorizedException {
    return new UnauthorizedException('Credenciales inválidas.');
  }

  private lockUser(
    manager: EntityManager,
    username: string,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.loginFailures',
        'user.blockedUntil',
      ])
      .where({ username })
      .setLock('pessimistic_write')
      .getOne();
  }

  /**
   * Valida usuario y contraseña bajo bloqueo de la fila del usuario, para que
   * los intentos fallidos se cuenten de forma atómica, y en la misma
   * transacción crea la sesión y firma el JWT. Los fallos se confirman (no se
   * lanza excepción dentro de la transacción) para que el contador persista.
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresIn: number }> {
    const result = await this.source.transaction(async (manager) => {
      const user = await this.lockUser(manager, username);
      const validPassword = await verifyPassword(password, user?.passwordHash);
      if (!user) return null;
      const now = Date.now();
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
        expiresAt: new Date(now + ACCESS_SECONDS * 1000),
      });
      const accessToken = await this.jwt.signAsync({
        sub: user.id,
        sid: session.id,
        typ: 'access',
      });
      return {
        accessToken,
        tokenType: 'Bearer' as const,
        expiresIn: ACCESS_SECONDS,
      };
    });
    if (!result) throw this.rejected();
    return result;
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

  async logout(identity: Identity): Promise<void> {
    await this.source
      .getRepository(Session)
      .update(
        { id: identity.sessionId, userId: identity.id },
        { revokedAt: new Date() },
      );
  }
}
