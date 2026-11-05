import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/entities/user.entity';
import { AuthRequest } from './auth.guard';

export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata('inventory:roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      'inventory:roles',
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;
    const identity = context.switchToHttp().getRequest<AuthRequest>().identity;
    if (!identity || !roles.includes(identity.role))
      throw new ForbiddenException('Permisos insuficientes.');
    return true;
  }
}
