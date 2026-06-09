import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@futuragest/contracts';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../api/client';
import { decodeAccessToken } from './jwt';
import { tokenStore } from './token-store';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: MeResponse | null;
  /** Authenticate; returns whether the backend requires a password change. */
  login: (email: string, password: string) => Promise<{ passwordChangeRequired: boolean }>;
  logout: () => void;
  /** Re-fetch /auth/me (e.g. after a password change re-login). */
  refetchUser: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  // We "have credentials" when a persisted session exists. On a cold reload the
  // client mints an access token via refresh, so a session alone is enough.
  const [hasCredentials, setHasCredentials] = useState(() => tokenStore.getSession() !== null);

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: authApi.me,
    enabled: hasCredentials,
    retry: false,
    staleTime: Infinity,
  });

  const reset = useCallback(() => {
    tokenStore.clear();
    setHasCredentials(false);
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  // When a refresh fails deep in the client, drop to unauthenticated.
  // We intentionally do NOT reset the handler to a no-op on cleanup: under
  // StrictMode's mount→unmount→mount cycle that would leave a refresh in flight
  // calling a dead handler. `reset` is stable, so re-registering is harmless.
  useEffect(() => {
    setUnauthorizedHandler(reset);
  }, [reset]);

  // A failed /auth/me (e.g. user deleted) also means we are not authenticated.
  useEffect(() => {
    if (hasCredentials && meQuery.isError) reset();
  }, [hasCredentials, meQuery.isError, reset]);

  const login = useCallback<AuthContextValue['login']>(
    async (email, password) => {
      const res = await authApi.login({ email, password });
      const claims = decodeAccessToken(res.accessToken);
      if (!claims) throw new Error('Login succeeded but the access token was unreadable');
      tokenStore.setAccessToken(res.accessToken);
      tokenStore.setSession({ userId: claims.sub, refreshToken: res.refreshToken });
      setHasCredentials(true);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      return { passwordChangeRequired: res.passwordChangeRequired };
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    reset();
  }, [reset]);

  const refetchUser = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    [queryClient],
  );

  const status: AuthStatus = !hasCredentials
    ? 'unauthenticated'
    : meQuery.isSuccess
      ? 'authenticated'
      : meQuery.isError
        ? 'unauthenticated'
        : 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({ status, user: meQuery.data ?? null, login, logout, refetchUser }),
    [status, meQuery.data, login, logout, refetchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
