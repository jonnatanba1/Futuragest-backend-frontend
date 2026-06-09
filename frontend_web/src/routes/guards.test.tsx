import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../lib/auth/auth-context';
import { RequireAuth, RequireGuest } from './guards';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

function setAuth(partial: Partial<AuthContextValue>) {
  useAuthMock.mockReturnValue({
    status: 'unauthenticated',
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    refetchUser: vi.fn(),
    ...partial,
  });
}

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/change-password" element={<div>change page</div>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>protected content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('RequireAuth', () => {
  it('shows a loader while auth is resolving', () => {
    setAuth({ status: 'loading' });
    renderAt('/');
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    setAuth({ status: 'unauthenticated' });
    renderAt('/');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders protected content for an authenticated user', () => {
    setAuth({ status: 'authenticated', user: { id: '1', email: 'a@b.co', role: 'GERENCIA' } as never });
    renderAt('/');
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('forces the password-change flow when required', () => {
    setAuth({
      status: 'authenticated',
      user: { id: '1', email: 'a@b.co', role: 'GERENCIA', mustChangePassword: true } as never,
    });
    renderAt('/');
    expect(screen.getByText('change page')).toBeInTheDocument();
  });
});

describe('RequireGuest', () => {
  it('bounces an authenticated user away from /login', () => {
    setAuth({ status: 'authenticated', user: { id: '1', email: 'a@b.co', role: 'GERENCIA' } as never });
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <RequireGuest>
                  <div>login page</div>
                </RequireGuest>
              }
            />
            <Route path="/" element={<div>home</div>} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
