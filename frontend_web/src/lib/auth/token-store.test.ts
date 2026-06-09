import { afterEach, describe, expect, it } from 'vitest';
import { tokenStore } from './token-store';

afterEach(() => {
  tokenStore.clear();
  localStorage.clear();
});

describe('tokenStore', () => {
  it('keeps the access token in memory only (never in localStorage)', () => {
    tokenStore.setAccessToken('access-123');
    expect(tokenStore.getAccessToken()).toBe('access-123');
    expect(localStorage.getItem('fg.session')).toBeNull();
    // No localStorage key should hold the access token.
    expect(JSON.stringify(localStorage)).not.toContain('access-123');
  });

  it('persists the session (userId + refreshToken) to localStorage', () => {
    tokenStore.setSession({ userId: 'u-1', refreshToken: 'r-1' });
    expect(tokenStore.getSession()).toEqual({ userId: 'u-1', refreshToken: 'r-1' });
  });

  it('returns null for a missing or malformed session', () => {
    expect(tokenStore.getSession()).toBeNull();
    localStorage.setItem('fg.session', '{ broken');
    expect(tokenStore.getSession()).toBeNull();
    localStorage.setItem('fg.session', JSON.stringify({ userId: 1 }));
    expect(tokenStore.getSession()).toBeNull();
  });

  it('clear() wipes both the access token and the persisted session', () => {
    tokenStore.setAccessToken('a');
    tokenStore.setSession({ userId: 'u', refreshToken: 'r' });
    tokenStore.clear();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getSession()).toBeNull();
  });
});
