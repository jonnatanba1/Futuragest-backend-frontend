import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';
import { tokenStore } from './token-store';

const { loginMock, meMock } = vi.hoisted(() => ({ loginMock: vi.fn(), meMock: vi.fn() }));

vi.mock('../api/client', () => ({
  authApi: { login: loginMock, me: meMock, changePassword: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

function token(sub: string): string {
  const seg = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${seg({ alg: 'HS256' })}.${seg({ sub })}.sig`;
}

function wrapper({ children }: { children: React.ReactNode }) {
  // Stable QueryClient per mount so StrictMode re-renders don't reset queries.
  const [qc] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  tokenStore.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.setItem('fg.deviceId', 'device-1');
  });

  it('starts unauthenticated when there is no session', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('authenticates after login and exposes the /auth/me user', async () => {
    loginMock.mockResolvedValue({
      accessToken: token('user-1'),
      refreshToken: 'r-1',
      passwordChangeRequired: false,
    });
    meMock.mockResolvedValue({ id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let outcome: { passwordChangeRequired: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.login('u@futuragest.co', 'secret');
    });

    expect(outcome).toEqual({ passwordChangeRequired: false });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toMatchObject({ id: 'user-1', role: 'GERENCIA' });
    expect(tokenStore.getSession()).toEqual({ userId: 'user-1', refreshToken: 'r-1' });
  });

  it('surfaces passwordChangeRequired from the login response', async () => {
    loginMock.mockResolvedValue({
      accessToken: token('user-2'),
      refreshToken: 'r-2',
      passwordChangeRequired: true,
    });
    meMock.mockResolvedValue({ id: 'user-2', email: 'a@b.co', role: 'SUPERVISOR' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let outcome: { passwordChangeRequired: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.login('a@b.co', 'secret');
    });
    expect(outcome?.passwordChangeRequired).toBe(true);
  });

  it('logout clears the session and returns to unauthenticated', async () => {
    loginMock.mockResolvedValue({
      accessToken: token('user-1'),
      refreshToken: 'r-1',
      passwordChangeRequired: false,
    });
    meMock.mockResolvedValue({ id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('u@futuragest.co', 'secret');
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    act(() => result.current.logout());

    expect(result.current.status).toBe('unauthenticated');
    expect(tokenStore.getSession()).toBeNull();
  });
});
