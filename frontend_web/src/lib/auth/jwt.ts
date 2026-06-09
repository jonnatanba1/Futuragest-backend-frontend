import type { RoleName } from '@futuragest/contracts';

/**
 * Claims carried by the backend access token (see login.use-case.ts JwtClaims).
 * Only the fields the web client reads are typed here.
 */
export interface AccessTokenClaims {
  /** User id (JWT `sub`). */
  sub: string;
  /** Device id this token is bound to. */
  deviceId?: string;
  role?: RoleName;
  /** Expiry, seconds since epoch. */
  exp?: number;
  /** Present and true while the user must change their password. */
  mustChangePassword?: boolean;
}

/** Decode a base64url segment to a UTF-8 string. */
function decodeSegment(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  // Preserve multi-byte UTF-8 characters that may appear in claims.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decode (does NOT verify) a JWT's payload. The backend verifies the
 * signature; the client only needs the claims to drive the refresh flow.
 * Returns null for malformed tokens.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(decodeSegment(parts[1])) as AccessTokenClaims;
    if (typeof claims?.sub !== 'string') return null;
    return claims;
  } catch {
    return null;
  }
}

/** True when the token is expired (or expires within `skewSeconds`). */
export function isExpired(claims: AccessTokenClaims, nowMs: number, skewSeconds = 30): boolean {
  if (typeof claims.exp !== 'number') return false;
  return claims.exp * 1000 <= nowMs + skewSeconds * 1000;
}
