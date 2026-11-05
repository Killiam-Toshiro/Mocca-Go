import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, Identity } from './auth.service';

export interface AuthRequest {
  headers: { authorization?: string };
  identity?: Identity;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Credenciales inválidas.');
    request.identity = await this.auth.authenticate(match[1]);
    return true;
  }
}
