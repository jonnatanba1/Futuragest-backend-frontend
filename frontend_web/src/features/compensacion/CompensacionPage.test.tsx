import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompensacionPage } from './CompensacionPage';

// Auth mock — hoisted so vi.mock factory can reference it
const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

function setRole(role: string) {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
}

function renderPage() {
  return render(
    <MantineProvider>
      <CompensacionPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('CompensacionPage', () => {
  it('renders the "Balance y cierre" tab label', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByRole('tab', { name: /balance y cierre/i })).toBeInTheDocument();
  });

  it('renders the "Política de jornada" tab label', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByRole('tab', { name: /política de jornada/i })).toBeInTheDocument();
  });

  it('renders the page title', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    expect(screen.getByRole('heading', { name: /compensación de horas/i })).toBeInTheDocument();
  });

  it('shows the balance tab panel by default', () => {
    setRole('TALENTO_HUMANO');
    renderPage();
    // The first tab panel content should be visible on initial render
    expect(screen.getByTestId('balance-tab-panel')).toBeInTheDocument();
  });

  it('is visible to read-only office roles (COORDINADOR)', () => {
    setRole('COORDINADOR');
    renderPage();
    expect(screen.getByRole('tab', { name: /balance y cierre/i })).toBeInTheDocument();
  });

  it('is visible to GERENCIA', () => {
    setRole('GERENCIA');
    renderPage();
    expect(screen.getByRole('tab', { name: /balance y cierre/i })).toBeInTheDocument();
  });
});
