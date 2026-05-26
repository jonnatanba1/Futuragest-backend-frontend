/**
 * Auth interface — AuthGuard (T3.10).
 *
 * Validates JWT access token on every request.
 * Builds ScopeContext from verified claims and populates ScopeContextHolder.
 * Verifies the device session is non-revoked for device-bound routes.
 *
 * SECURITY:
 * - Rejects with 401 on any failure (expired, invalid signature, revoked device).
 * - Populates ScopeContextHolder for PR4 repositories to consume.
 * - MustChangePasswordGuard runs AFTER this guard.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { TokenSignerPort } from '../domain/token-signer.port';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import { TOKEN_SIGNER_PORT } from '../domain/token-signer.port';
import { AUTH_REPOSITORY_PORT } from '../domain/auth-repository.port';
import { ScopeContextHolder, type ScopeContext, type Role } from '../domain/scope-context';

/** Metadata key to mark routes as public (no auth required). */
export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SIGNER_PORT) private readonly signer: TokenSignerPort,
    @Inject(AUTH_REPOSITORY_PORT) private readonly repo: AuthRepositoryPort,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow @Public() decorated routes through
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { scopeContext?: ScopeContextHolder }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const claims = this.signer.verifyAccessToken(token);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Verify device session is non-revoked (device binding gate)
    if (claims.deviceId) {
      const session = await this.repo.findActiveDeviceSession(claims.sub, claims.deviceId);
      if (!session) {
        throw new UnauthorizedException('Device session revoked or not registered');
      }
    }

    // Build and attach ScopeContext to the request
    const scopeContext: ScopeContext = {
      userId: claims.sub,
      role: claims.role as Role,
      zoneId: claims.zoneId,
      supervisorId: claims.supervisorId,
      deviceId: claims.deviceId,
    };

    const holder = new ScopeContextHolder();
    holder.set(scopeContext);
    // Attach to request so downstream providers can inject it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)['scopeContextHolder'] = holder;
    // Attach the full JWT claims so MustChangePasswordGuard can read mustChangePassword
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)['user'] = { ...scopeContext, mustChangePassword: claims.mustChangePassword };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers?.['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
