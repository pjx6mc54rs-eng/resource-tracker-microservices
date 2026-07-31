import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest<{ user?: { role?: UserRole; roles?: UserRole[] } }>();
    const userRoles = Array.isArray(request.user?.roles) && request.user.roles.length > 0
      ? request.user.roles
      : (request.user?.role ? [request.user.role] : []);
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
