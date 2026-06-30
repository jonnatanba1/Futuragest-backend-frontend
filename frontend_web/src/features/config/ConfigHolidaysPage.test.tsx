import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HolidayDto } from '@futuragest/contracts';
import { ConfigHolidaysPage } from './ConfigHolidaysPage';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useHolidaysQueryMock, useGenerateHolidaysMutationMock } = vi.hoisted(() => ({
  useHolidaysQueryMock: vi.fn(),
  useGenerateHolidaysMutationMock: vi.fn(),
}));
vi.mock('./config-queries', () => ({
  useHolidaysQuery: useHolidaysQueryMock,
  useGenerateHolidaysMutation: useGenerateHolidaysMutationMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOLIDAYS: HolidayDto[] = [
  { id: 'h-1', date: '2026-01-01', name: 'Año Nuevo', type: 'FIXED', year: 2026, isManual: false, createdAt: '' },
  { id: 'h-2', date: '2026-01-12', name: 'Día de los Reyes Magos', type: 'EMILIANI', year: 2026, isManual: false, createdAt: '' },
  { id: 'h-3', date: '2026-04-02', name: 'Jueves Santo', type: 'EASTER_BASED', year: 2026, isManual: false, createdAt: '' },
  { id: 'h-4', date: '2026-12-25', name: 'Navidad', type: 'FIXED', year: 2026, isManual: false, createdAt: '' },
  { id: 'h-5', date: '2026-06-15', name: 'Día especial (manual)', type: 'MANUAL', year: 2026, isManual: true, createdAt: '' },
];

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useHolidaysQueryMock.mockReturnValue({
    data: HOLIDAYS,
    isLoading: false,
    isError: false,
  });
  useGenerateHolidaysMutationMock.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
}

function renderPage() {
  return render(
    <MantineProvider>
      <ConfigHolidaysPage />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConfigHolidaysPage', () => {
  // CAL-1 — Calendar renders all 12 month cards
  it('renders all 12 month names', () => {
    defaultSetup();
    renderPage();
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    for (const name of monthNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  // CAL-2 — Holiday days appear on the calendar (as day numbers)
  it('renders holiday day numbers in the calendar grid', () => {
    defaultSetup();
    renderPage();
    // Day "1" (Enero 1) and "25" (Diciembre 25) appear as text in cells
    // Need to be specific enough to avoid false matches
    const allCells = screen.getAllByText(/^\d{1,2}$/);
    const dayTexts = allCells.map((el) => el.textContent);
    expect(dayTexts).toContain('1');   // Jan 1
    expect(dayTexts).toContain('12');  // Jan 12
    expect(dayTexts).toContain('25');  // Dec 25
  });

  // CAL-3 — Legend shows all 4 holiday type badges
  it('renders color legend for all 4 holiday types', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('FIJOS')).toBeInTheDocument();
    expect(screen.getByText('EMILIANI')).toBeInTheDocument();
    expect(screen.getByText('PASCUA')).toBeInTheDocument();
    expect(screen.getByText('MANUAL')).toBeInTheDocument();
  });

  // CAL-4 — Year selector dropdown
  it('has a year selector dropdown', () => {
    defaultSetup();
    renderPage();
    const yearInputs = screen.getAllByLabelText(/año/i);
    expect(yearInputs.length).toBeGreaterThanOrEqual(1);
  });

  // CAL-5 — "Generar automáticamente" button
  it('shows "Generar automáticamente" button', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByRole('button', { name: /generar automáticamente/i })).toBeInTheDocument();
  });

  // CAL-6 — Hides "Agregar manual" for non-SYSTEM_ADMIN
  it('hides "Agregar manual" button for TALENTO_HUMANO', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPage();
    expect(screen.queryByRole('button', { name: /agregar manual/i })).not.toBeInTheDocument();
  });

  // CAL-7 — Shows "Agregar manual" for SYSTEM_ADMIN
  it('shows "Agregar manual" button for SYSTEM_ADMIN', () => {
    defaultSetup('SYSTEM_ADMIN');
    renderPage();
    expect(screen.getByRole('button', { name: /agregar manual/i })).toBeInTheDocument();
  });

  // CAL-8 — Empty state when no holidays exist
  it('shows empty message when no holidays exist', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useHolidaysQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    useGenerateHolidaysMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    renderPage();
    expect(screen.getByText(/no hay festivos/i)).toBeInTheDocument();
  });

  // CAL-9 — Error state
  it('shows error alert when query fails', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useHolidaysQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    useGenerateHolidaysMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    renderPage();
    expect(screen.getByText(/no se pudo cargar los festivos/i)).toBeInTheDocument();
  });
});
