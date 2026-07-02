import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { TokenSignerPort } from '../../auth/domain/token-signer.port';
import { TOKEN_SIGNER_PORT } from '../../auth/domain/token-signer.port';
import type { Role } from '../../auth/domain/scope-context';

@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SIGNER_PORT) private readonly signer: TokenSignerPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de autorización no proporcionado');
    }

    const claims = this.signer.verifyAccessToken(token);
    if (!claims) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const scopeContext = {
      userId: claims.sub,
      role: claims.role as Role,
      zoneId: claims.zoneId,
      supervisorId: claims.supervisorId,
      deviceId: claims.deviceId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).user = { ...scopeContext, mustChangePassword: claims.mustChangePassword };

    return true;
  }

  private extractToken(request: Request): string | null {
    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    const authHeader = request.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }
}
