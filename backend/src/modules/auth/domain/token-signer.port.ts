/**
 * Auth domain — TokenSignerPort interface.
 *
 * Abstracts JWT signing and verification so domain/application
 * layers have zero dependency on jsonwebtoken/@nestjs/jwt.
 */

export interface JwtClaims {
  sub: string; // userId
  role: string;
  zoneId?: string;
  supervisorId?: string;
  deviceId?: string;
  mustChangePassword?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string; // opaque plaintext — client stores, server hashes before persist
}

export interface TokenSignerPort {
  /** Sign a JWT access token with the given claims. */
  signAccessToken(claims: JwtClaims): string;

  /** Verify a JWT access token and return decoded claims, or null if invalid/expired. */
  verifyAccessToken(token: string): JwtClaims | null;
}

export const TOKEN_SIGNER_PORT = Symbol('TokenSignerPort');
