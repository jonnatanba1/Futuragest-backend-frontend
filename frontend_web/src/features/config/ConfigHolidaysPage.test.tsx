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
  // HOL-1 — Renders holiday list with color-coded types
  it('renders holiday rows with names and dates', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByText('Año Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Día de los Reyes Magos')).toBeInTheDocument();
    expect(screen.getByText('Jueves Santo')).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
  });

  // HOL-2 — Shows type badges in table rows
  it('shows holiday type badges on each row', () => {
    defaultSetup();
    renderPage();
    // Each holiday has a type badge: 2 FIXED, 1 EMILIANI, 1 EASTER_BASED, 1 MANUAL + legend = 3 FIJOS total
    const fijos = screen.getAllByText('FIJOS');
    expect(fijos.length).toBeGreaterThanOrEqual(2); // at least legend + one row
    const emiliani = screen.getAllByText('EMILIANI');
    expect(emiliani.length).toBeGreaterThanOrEqual(1);
    const pascua = screen.getAllByText('PASCUA');
    expect(pascua.length).toBeGreaterThanOrEqual(1);
    const manual = screen.getAllByText('MANUAL');
    expect(manual.length).toBeGreaterThanOrEqual(1);
  });

  // HOL-3 — Shows year selector
  it('has a year selector dropdown', () => {
    defaultSetup();
    renderPage();
    const yearInputs = screen.getAllByLabelText(/año/i);
    expect(yearInputs.length).toBeGreaterThanOrEqual(1);
  });

  // HOL-4 — Shows "Generar automáticamente" button
  it('shows "Generar automáticamente" button', () => {
    defaultSetup();
    renderPage();
    expect(screen.getByRole('button', { name: /generar automáticamente/i })).toBeInTheDocument();
  });

  // HOL-5 — Hides "Agregar manual" for non-SYSTEM_ADMIN
  it('hides "Agregar manual" button for TALENTO_HUMANO', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPage();
    expect(screen.queryByRole('button', { name: /agregar manual/i })).not.toBeInTheDocument();
  });

  // HOL-6 — Shows "Agregar manual" for SYSTEM_ADMIN
  it('shows "Agregar manual" button for SYSTEM_ADMIN', () => {
    defaultSetup('SYSTEM_ADMIN');
    renderPage();
    expect(screen.getByRole('button', { name: /agregar manual/i })).toBeInTheDocument();
  });

  // HOL-7 — Shows color-coded legend items
  it('renders color legend for all 4 holiday types', () => {
    defaultSetup();
    renderPage();
    // Legend badges appear at least once (possibly also in table rows)
    const fijos = screen.getAllByText('FIJOS');
    const emiliani = screen.getAllByText('EMILIANI');
    const pascua = screen.getAllByText('PASCUA');
    const manual = screen.getAllByText('MANUAL');
    expect(fijos.length).toBeGreaterThanOrEqual(1);
    expect(emiliani.length).toBeGreaterThanOrEqual(1);
    expect(pascua.length).toBeGreaterThanOrEqual(1);
    expect(manual.length).toBeGreaterThanOrEqual(1);
  });
});
