import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from './project-access.service';

export type RequestWithUser = Request & { user: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('JWT manquant');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email?: string; role: AuthUser['role'] }>(token, {
        secret: process.env.JWT_SECRET ?? 'change_this_secret',
      });
      if (!payload.sub || !payload.role) throw new Error('Invalid payload');
      request.user = { userId: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('JWT invalide');
    }
  }
}
