/**
 * T4.9 — RolesGuard (coarse role-membership gate).
 *
 * Enforces which roles may call a given route. This is a SEPARATE concern from
 * applyScopeFilter — RolesGuard is about "may this role call this endpoint at all";
 * the scope filter is about "which rows may they see".
 *
 * Both layers are required:
 *   AuthGuard     → valid JWT + device session (request admission)
 *   RolesGuard    → coarse: role allowed at this route (endpoint/role)
 *   applyScopeFilter → fine-grained: row-level zone/supervisor visibility
 *
 * If no @Roles() decorator is present on a handler, any authenticated role is allowed
 * (AuthGuard has already verified the JWT).
 *
 * Wire as a global guard in AppModule AFTER AuthGuard so ScopeContext is available.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ScopeContext } from '../../auth/domain/scope-context';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from '../../auth/interface/auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public routes bypass role check
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Retrieve required roles from metadata
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() annotation → any authenticated user may proceed
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: ScopeContext }>();
    const user = request.user;

    if (!user?.role) {
      // AuthGuard should have already rejected unauthenticated requests
      throw new ForbiddenException('Insufficient privileges');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException('Insufficient privileges');
    }

    return true;
  }
}
