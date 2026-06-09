import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, authApi, setUnauthorizedHandler } from './client';
import { tokenStore } from '../auth/token-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.['Authorization'];
}

afterEach(() => {
  tokenStore.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  setUnauthorizedHandler(() => {});
});

describe('authApi.login', () => {
  beforeEach(() => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
  });

  it('POSTs credentials with device info and no Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        accessToken: 'a',
        refreshToken: 'r',
        passwordChangeRequired: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await authApi.login({ email: 'u@futuragest.co', password: 'secret' });

    expect(result.accessToken).toBe('a');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/login');
    expect(authHeader(init)).toBeUndefined();
    const sent = JSON.parse(init?.body as string);
    expect(sent).toMatchObject({
      email: 'u@futuragest.co',
      password: 'secret',
      deviceId: 'device-xyz',
    });
    expect(typeof sent.deviceLabel).toBe('string');
  });

  it('throws ApiError with the backend message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Invalid email or password' })));
    await expect(authApi.login({ email: 'x@y.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });
});

describe('refresh single-flight on 401', () => {
  beforeEach(() => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
    tokenStore.setSession({ userId: 'user-1', refreshToken: 'refresh-1' });
    tokenStore.setAccessToken('stale-token');
  });

  it('refreshes exactly once for concurrent 401s and retries with the fresh token', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, { accessToken: 'fresh-token' });
      }
      if (u.includes('/auth/me')) {
        return authHeader(init) === 'Bearer fresh-token'
          ? jsonResponse(200, { id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' })
          : jsonResponse(401, { message: 'jwt expired' });
      }
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([authApi.me(), authApi.me()]);

    expect(refreshCalls).toBe(1);
    expect(a).toMatchObject({ id: 'user-1' });
    expect(b).toMatchObject({ id: 'user-1' });
    expect(tokenStore.getAccessToken()).toBe('fresh-token');
  });

  it('clears the session and calls the unauthorized handler when refresh fails', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) return jsonResponse(401, { message: 'revoked' });
      return jsonResponse(401, { message: 'jwt expired' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledOnce();
    expect(tokenStore.getSession()).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});

describe('cold reload', () => {
  it('mints an access token via refresh when only a session exists', async () => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
    tokenStore.setSession({ userId: 'user-1', refreshToken: 'refresh-1' });
    // no access token in memory (simulates a fresh page load)

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) return jsonResponse(200, { accessToken: 'minted' });
      if (u.includes('/auth/me') && authHeader(init) === 'Bearer minted') {
        return jsonResponse(200, { id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' });
      }
      return jsonResponse(401, { message: 'no token' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await authApi.me();
    expect(me).toMatchObject({ id: 'user-1' });
  });
});
