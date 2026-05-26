/**
 * Auth infrastructure — JwtTokenSigner.
 *
 * Implements TokenSignerPort using @nestjs/jwt (jsonwebtoken under the hood).
 *
 * JWT_SECRET strategy (per task constraints):
 * - In production: JWT_SECRET env var MUST be set (ConfigService validation throws if missing).
 * - In development / test: falls back to a fixed dev-only secret.
 * - NEVER use the dev default in production.
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenSignerPort, JwtClaims } from '../domain/token-signer.port';

@Injectable()
export class JwtTokenSigner implements TokenSignerPort {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(claims: JwtClaims): string {
    return this.jwt.sign(claims);
  }

  verifyAccessToken(token: string): JwtClaims | null {
    try {
      return this.jwt.verify<JwtClaims>(token);
    } catch {
      return null;
    }
  }
}
