import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompensatoryRestDto, OperarioDto } from '@futuragest/contracts';
import { CompensatoriosPanel } from './CompensatoriosPanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useCompensatoryRestQueryMock, useScheduleCompensatoryMutationMock } = vi.hoisted(() => ({
  useCompensatoryRestQueryMock: vi.fn(),
  useScheduleCompensatoryMutationMock: vi.fn(),
}));
vi.mock('../config/config-queries', () => ({
  useCompensatoryRestQuery: useCompensatoryRestQueryMock,
  useScheduleCompensatoryMutation: useScheduleCompensatoryMutationMock,
}));

const { useOperariosMock } = vi.hoisted(() => ({ useOperariosMock: vi.fn() }));
vi.mock('../operarios/operario-queries', () => ({
  useOperarios: useOperariosMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RESTS: CompensatoryRestDto[] = [
  { id: 'cr-1', operarioId: 'op-1', attendanceId: 'att-1', month: '2026-06', type: 'OCCASIONAL', status: 'PENDING', scheduledDate: null, takenDate: null, resolvedAt: null, resolvedByUserId: null, notes: null, createdAt: '' },
  { id: 'cr-2', operarioId: 'op-1', attendanceId: 'att-2', month: '2026-06', type: 'HABITUAL', status: 'SCHEDULED', scheduledDate: '2026-07-15', takenDate: null, resolvedAt: null, resolvedByUserId: null, notes: null, createdAt: '' },
  { id: 'cr-3', operarioId: 'op-2', attendanceId: 'att-3', month: '2026-05', type: 'OCCASIONAL', status: 'TAKEN', scheduledDate: '2026-06-01', takenDate: '2026-06-01', resolvedAt: '2026-06-01T00:00:00Z', resolvedByUserId: 'user-1', notes: null, createdAt: '' },
];

const OPERARIOS: OperarioDto[] = [
  { id: 'op-1', fullName: 'Carlos Gómez', documento: '123', supervisorId: 'sup-1', cargo: 'Barrido', active: true, deactivatedAt: null, areaId: null, areaName: null, createdAt: '', updatedAt: '' },
  { id: 'op-2', fullName: 'María López', documento: '456', supervisorId: 'sup-1', cargo: 'Recolección', active: true, deactivatedAt: null, areaId: null, areaName: null, createdAt: '', updatedAt: '' },
];

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useCompensatoryRestQueryMock.mockReturnValue({
    data: RESTS,
    isLoading: false,
    isError: false,
  });
  useScheduleCompensatoryMutationMock.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
  useOperariosMock.mockReturnValue({
    data: OPERARIOS,
    isLoading: false,
    isError: false,
  });
}

function renderPanel() {
  return render(
    <MantineProvider>
      <CompensatoriosPanel />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompensatoriosPanel', () => {
  // CR-1 — Renders compensatorio rows with operario names
  it('renders compensatorio rows with operario names joined', () => {
    defaultSetup();
    renderPanel();
    // Names appear in table rows + filter dropdown options — use getAllByText
    const carlos = screen.getAllByText('Carlos Gómez');
    const maria = screen.getAllByText('María López');
    expect(carlos.length).toBeGreaterThanOrEqual(1);
    expect(maria.length).toBeGreaterThanOrEqual(1);
  });

  // CR-2 — Shows type (OCCASIONAL/HABITUAL)
  it('shows type badges: OCCASIONAL and HABITUAL', () => {
    defaultSetup();
    renderPanel();
    const occasional = screen.getAllByText('OCCASIONAL');
    const habitual = screen.getAllByText('HABITUAL');
    expect(occasional.length).toBeGreaterThanOrEqual(1);
    expect(habitual.length).toBeGreaterThanOrEqual(1);
  });

  // CR-3 — Shows status (PENDING/SCHEDULED/TAKEN)
  it('shows status badges', () => {
    defaultSetup();
    renderPanel();
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument();
    expect(screen.getByText('PROGRAMADO')).toBeInTheDocument();
    expect(screen.getByText('TOMADO')).toBeInTheDocument();
  });

  // CR-4 — Shows month column
  it('shows month column', () => {
    defaultSetup();
    renderPanel();
    const june = screen.getAllByText('2026-06');
    const may = screen.getAllByText('2026-05');
    expect(june.length).toBeGreaterThanOrEqual(1);
    expect(may.length).toBeGreaterThanOrEqual(1);
  });

  // CR-5 — Shows "Programar" button for PENDING compensatories (TALENTO_HUMANO)
  it('shows "Programar" button for PENDING records', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();
    // The PENDING row should have a Programar button
    const buttons = screen.getAllByRole('button', { name: /programar/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  // CR-6 — Hides "Programar" for non-auth roles
  it('hides action buttons for GERENCIA', () => {
    defaultSetup('GERENCIA');
    renderPanel();
    expect(screen.queryByRole('button', { name: /programar/i })).not.toBeInTheDocument();
  });

  // CR-7 — Loading state
  it('shows loading skeleton while query is loading', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useCompensatoryRestQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    useScheduleCompensatoryMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useOperariosMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });
});
