import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { DashboardPage } from './DashboardPage';

const { operariosMock, attendancesMock, novedadesMock } = vi.hoisted(() => ({
  operariosMock: vi.fn(),
  attendancesMock: vi.fn(),
  novedadesMock: vi.fn(),
}));

vi.mock('../../lib/auth/auth-context', () => ({
  useAuth: () => ({ user: { email: 'admin@futuragest.co', role: 'SYSTEM_ADMIN' } }),
}));
vi.mock('../operarios/operario-queries', () => ({ useOperarios: operariosMock }));
vi.mock('../asistencia/attendance-queries', () => ({ useAttendances: attendancesMock }));
vi.mock('../novedades/novedad-queries', () => ({ useNovedades: novedadesMock }));

function ok<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null };
}

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('DashboardPage', () => {
  it('shows the computed metric values', () => {
    operariosMock.mockReturnValue(ok([{ id: 'a' }, { id: 'b' }, { id: 'c' }])); // 3 active
    attendancesMock.mockReturnValue(
      ok([
        { date: '2026-06-03', completedAt: null },
        { date: '2026-06-03', completedAt: null },
        { date: '2026-06-04', completedAt: '2026-06-04T00:00:00Z' },
      ]), // 2 open
    );
    novedadesMock.mockReturnValue(ok([{ status: 'PENDING' }, { status: 'APPROVED' }])); // 1 pending

    renderPage();

    expect(screen.getByText('Operarios activos')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('filters the attendance-on-date metric by the date picker', () => {
    operariosMock.mockReturnValue(ok([]));
    attendancesMock.mockReturnValue(
      ok([
        { date: '2026-06-03', completedAt: null },
        { date: '2026-06-03', completedAt: null },
        { date: '2026-06-04', completedAt: null },
      ]),
    );
    novedadesMock.mockReturnValue(ok([]));

    renderPage();
    fireEvent.change(screen.getByLabelText('Fecha del tablero'), { target: { value: '2026-06-03' } });

    // The "Asistencia por fecha" card should now read 2.
    const cardLabel = screen.getByText('Asistencia por fecha');
    const card = cardLabel.closest('div');
    expect(card && within(card).getByText('2')).toBeTruthy();
  });

  it('shows a no-access state when a metric query is forbidden', () => {
    operariosMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, 'Forbidden'),
    });
    attendancesMock.mockReturnValue(ok([]));
    novedadesMock.mockReturnValue(ok([]));

    renderPage();

    expect(screen.getByText('Sin acceso para su rol')).toBeInTheDocument();
  });
});
