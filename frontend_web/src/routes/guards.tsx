import { Center, Loader } from '@mantine/core';
import type { RoleName } from '@futuragest/contracts';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth/auth-context';

function FullPageLoader() {
  return (
    <Center h="100vh">
      <Loader aria-label="Cargando" />
    </Center>
  );
}

/**
 * Gate for authenticated app routes. Redirects unauthenticated users to /login,
 * forces the password-change flow when required, and optionally restricts by role.
 */
export function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactElement;
  roles?: RoleName[];
}) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/** Gate for the change-password page: requires auth but never self-redirects. */
export function RequireAuthAllowChange({ children }: { children: React.ReactElement }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** Gate for public pages (login): bounces authenticated users into the app. */
export function RequireGuest({ children }: { children: React.ReactElement }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated') {
    return <Navigate to={user?.mustChangePassword ? '/change-password' : '/'} replace />;
  }
  return children;
}
