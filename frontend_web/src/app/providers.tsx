import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { AuthProvider } from '../lib/auth/auth-context';
import { theme } from './theme';

/**
 * Global app providers: Mantine (theme + color scheme), TanStack Query,
 * notifications, and auth. AuthProvider sits inside QueryClientProvider
 * because it drives the /auth/me query.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <ConnectionBanner />
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
