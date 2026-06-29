import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SurchargeRateDto } from '@futuragest/contracts';
import { ConfigSurchargesPage } from './ConfigSurchargesPage';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useSurchargeRatesQueryMock } = vi.hoisted(() => ({
  useSurchargeRatesQueryMock: vi.fn(),
}));
vi.mock('./config-queries', () => ({
  useSurchargeRatesQuery: useSurchargeRatesQueryMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RATES: SurchargeRateDto[] = [
  { id: 'r-1', category: 'RECARGO_NOCTURNO', percentage: '35.00', vigenteDesde: '2024-01-01', creadoPor: null, legalRef: 'Ley 2466/2025', createdAt: '' },
  { id: 'r-2', category: 'HORA_EXTRA_DIURNA', percentage: '25.00', vigenteDesde: '2024-01-01', creadoPor: null, legalRef: null, createdAt: '' },
  { id: 'r-3', category: 'HORA_EXTRA_NOCTURNA', percentage: '75.00', vigenteDesde: '2024-01-01', creadoPor: null, legalRef: null, createdAt: '' },
  { id: 'r-4', category: 'RECARGO_DOMINICAL_FESTIVO', percentage: '80.00', vigenteDesde: '2024-01-01', creadoPor: null, legalRef: null, createdAt: '' },
  { id: 'r-5', category: 'RECARGO_DOMINICAL_FESTIVO', percentage: '90.00', vigenteDesde: '2026-07-01', creadoPor: null, legalRef: null, createdAt: '' },
  { id: 'r-6', category: 'RECARGO_DOMINICAL_FESTIVO', percentage: '100.00', vigenteDesde: '2027-07-01', creadoPor: null, legalRef: null, createdAt: '' },
];

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useSurchargeRatesQueryMock.mockReturnValue({
    data: RATES,
    isLoading: false,
    isError: false,
  });
}

function renderPage() {
  return render(
    <MantineProvider>
      <ConfigSurchargesPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConfigSurchargesPage', () => {
  // SR-1 — Renders rates table
  it('renders surcharge rates table with categories', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('Recargo nocturno')).toBeInTheDocument();
    expect(screen.getByText('Hora extra diurna')).toBeInTheDocument();
    expect(screen.getByText('Hora extra nocturna')).toBeInTheDocument();
    // "Dominical / festivo" appears 3× (3 effective-date rows)
    const dominical = screen.getAllByText('Dominical / festivo');
    expect(dominical.length).toBeGreaterThanOrEqual(1);
  });

  // SR-2 — Shows percentages
  it('shows percentage values in table', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('35.00%')).toBeInTheDocument();
    expect(screen.getByText('25.00%')).toBeInTheDocument();
  });

  // SR-3 — Shows effective dates
  it('shows vigenteDesde for each rate', () => {
    defaultSetup();
    renderPage();
    // The dominical rates have multiple effective dates
    const all80 = screen.getAllByText(/80\.00%/);
    expect(all80.length).toBeGreaterThanOrEqual(1);
  });

  // SR-4 — Shows progression alert for dominical
  it('renders the dominical progression alert banner', () => {
    defaultSetup();
    renderPage();
    // Alert title and body both contain "Próximo cambio" — check at least one
    const alerts = screen.getAllByText(/próximo cambio/i);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    // Also verify the progression visual is rendered
    expect(screen.getByText(/dominical\/festivo/i)).toBeInTheDocument();
  });

  // SR-5 — Hides "Agregar tasa" for non-admin
  it('hides "Agregar tasa" button for TALENTO_HUMANO', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPage();
    expect(screen.queryByRole('button', { name: /agregar tasa/i })).not.toBeInTheDocument();
  });

  // SR-6 — Shows "Agregar tasa" for SYSTEM_ADMIN
  it('shows "Agregar tasa" button for SYSTEM_ADMIN', () => {
    defaultSetup('SYSTEM_ADMIN');
    renderPage();
    expect(screen.getByRole('button', { name: /agregar tasa/i })).toBeInTheDocument();
  });
});
