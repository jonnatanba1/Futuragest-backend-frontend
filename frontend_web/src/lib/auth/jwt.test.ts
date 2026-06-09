import { describe, expect, it } from 'vitest';
import { decodeAccessToken, isExpired } from './jwt';

function makeToken(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

describe('decodeAccessToken', () => {
  it('decodes sub, deviceId, role and mustChangePassword from the payload', () => {
    const token = makeToken({
      sub: 'user-1',
      deviceId: 'dev-1',
      role: 'SUPERVISOR',
      mustChangePassword: true,
      exp: 1893456000,
    });
    expect(decodeAccessToken(token)).toEqual({
      sub: 'user-1',
      deviceId: 'dev-1',
      role: 'SUPERVISOR',
      mustChangePassword: true,
      exp: 1893456000,
    });
  });

  it('returns null for malformed tokens', () => {
    expect(decodeAccessToken('not-a-jwt')).toBeNull();
    expect(decodeAccessToken('a.b')).toBeNull();
  });

  it('returns null when the payload has no string sub', () => {
    expect(decodeAccessToken(makeToken({ role: 'GERENCIA' }))).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true once exp has passed (accounting for skew)', () => {
    const claims = { sub: 'u', exp: 1000 };
    expect(isExpired(claims, 1000_000)).toBe(true);
  });

  it('is false while the token is still valid beyond the skew window', () => {
    const nowMs = 1000_000;
    const claims = { sub: 'u', exp: nowMs / 1000 + 120 };
    expect(isExpired(claims, nowMs)).toBe(false);
  });

  it('treats a token without exp as non-expiring', () => {
    expect(isExpired({ sub: 'u' }, Date.now())).toBe(false);
  });
});
