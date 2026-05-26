/**
 * Auth interface — MustChangePasswordGuard (T3.11).
 *
 * Intercepts all authenticated requests where the JWT contains
 * `mustChangePassword: true`. Blocks with HTTP 403 + code PASSWORD_CHANGE_REQUIRED
 * except for:
 * - POST /auth/change-password
 * - POST /auth/login
 *
 * Runs after AuthGuard (which populates `request.user`).
 *
 * SECURITY:
 * - Fail-open only on the two explicit exempted routes.
 * - Any other route with mustChangePassword=true is blocked.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ScopeContext } from '../domain/scope-context';

/** Metadata key to bypass the mustChangePassword check (used on change-password route). */
export const SKIP_MCP_CHECK_KEY = 'skipMustChangePasswordCheck';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_MCP_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: ScopeContext }>();
    const user = request['user'] as { mustChangePassword?: boolean } | undefined;

    // No user = not authenticated; AuthGuard handles this — let it through here
    if (!user) return true;

    // Check the JWT claim forwarded by AuthGuard via request.user
    const mustChange = (user as unknown as { mustChangePassword?: boolean })['mustChangePassword'];
    if (mustChange) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before accessing this resource',
      });
    }

    return true;
  }
}
