import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JornadaPolicyDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { JornadaPolicyPanel } from './JornadaPolicyPanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../lib/auth/auth-context', () => ({ useAuth: useAuthMock }));

const { useJornadaPoliciesQueryMock, useCreateJornadaPolicyMutationMock } = vi.hoisted(() => ({
  useJornadaPoliciesQueryMock: vi.fn(),
  useCreateJornadaPolicyMutationMock: vi.fn(),
}));
vi.mock('./compensacion-queries', () => ({
  useJornadaPoliciesQuery: useJornadaPoliciesQueryMock,
  useCreateJornadaPolicyMutation: useCreateJornadaPolicyMutationMock,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_POLICY = {
  operarioId: null as string | null,
  zoneId: null as string | null,
  horaInicio: '06:00',
  horaFin: '14:00',
  diasLaborales: [1, 2, 3, 4, 5],
  almuerzoInicio: '09:45',
  almuerzoFin: '10:15',
  desayunoInicio: null as string | null,
  desayunoFin: null as string | null,
  toleranciaMin: 5,
  horasSemanales: '44.00',
};

const POLICIES: JornadaPolicyDto[] = [
  { id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '2026-01-01T10:00:00.000Z', ...BASE_POLICY },
  { id: 'pol-2', horasDiarias: '7.50', vigenteDesde: '2026-06-01', createdAt: '2026-06-01T08:00:00.000Z', ...BASE_POLICY },
];

const mutateMock = vi.fn();

function defaultSetup(role = 'TALENTO_HUMANO') {
  useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role } });
  useJornadaPoliciesQueryMock.mockReturnValue({
    data: POLICIES,
    isLoading: false,
    isError: false,
    error: null,
  });
  useCreateJornadaPolicyMutationMock.mockReturnValue({
    mutateAsync: mutateMock,
    isPending: false,
  });
}

function renderPanel() {
  return render(
    <MantineProvider>
      <JornadaPolicyPanel />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JornadaPolicyPanel', () => {
  // POL-1 — Timeline renders policy rows with string horasDiarias verbatim
  it('renders policy rows with horasDiarias as string', () => {
    defaultSetup();
    renderPanel();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.getByText('7.50')).toBeInTheDocument();
  });

  it('renders vigenteDesde dates in timeline', () => {
    defaultSetup();
    renderPanel();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });

  // POL-1 variant — GERENCIA sees timeline but no add form
  it('hides add-policy form for read-only role (GERENCIA)', () => {
    defaultSetup('GERENCIA');
    renderPanel();
    // Timeline should still be visible
    expect(screen.getByText('8.00')).toBeInTheDocument();
    // No add-policy form
    expect(screen.queryByRole('button', { name: /agregar política/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/horas diarias/i)).not.toBeInTheDocument();
  });

  it('hides add-policy form for read-only role (COORDINADOR)', () => {
    defaultSetup('COORDINADOR');
    renderPanel();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar política/i })).not.toBeInTheDocument();
  });

  // POL-2 — TALENTO_HUMANO sees add form
  it('shows add-policy form for write role (TALENTO_HUMANO)', () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  it('shows add-policy form for SYSTEM_ADMIN', () => {
    defaultSetup('SYSTEM_ADMIN');
    renderPanel();
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  // Submit payload shape — {horasDiarias: number, vigenteDesde: string, ...defaults}
  it('submits correct payload shape on form submit', async () => {
    defaultSetup('TALENTO_HUMANO');
    mutateMock.mockResolvedValue({ id: 'new-pol', ...BASE_POLICY, horasDiarias: '9.00', vigenteDesde: '2026-07-01', createdAt: '' });
    renderPanel();

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/horas diarias/i), '9');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          horasDiarias: 9,
          vigenteDesde: '2026-07-01',
        }),
      );
    });
  });

  // Validation — blocks empty/invalid fields
  it('blocks submission when horasDiarias is empty', async () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();

    const user = userEvent.setup();
    // Only fill vigenteDesde, leave horasDiarias empty
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-07-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  it('blocks submission when vigenteDesde is empty', async () => {
    defaultSetup('TALENTO_HUMANO');
    renderPanel();

    const user = userEvent.setup();
    // Only fill horasDiarias, leave vigenteDesde empty
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  // POL-3 — 409 conflict shows notification, form stays open
  it('surfaces 409 server error as notification', async () => {
    const { notifications } = await import('@mantine/notifications');
    defaultSetup('TALENTO_HUMANO');
    mutateMock.mockRejectedValue(new ApiError(409, 'Ya existe una política vigente para esa fecha.'));
    renderPanel();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/horas diarias/i), '8');
    await user.type(screen.getByLabelText(/vigente desde/i), '2026-01-01');
    await user.click(screen.getByRole('button', { name: /agregar política/i }));

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red' }),
      );
    });
    // Form stays visible (not closed after error)
    expect(screen.getByRole('button', { name: /agregar política/i })).toBeInTheDocument();
  });

  // Loading state
  it('shows loading skeleton while query is loading', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPanel();
    // TableSkeleton renders a Stack with aria-label="Cargando" — must be present
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
    // Policy data must not be visible during load
    expect(screen.queryByText('8.00')).not.toBeInTheDocument();
  });

  // Empty state
  it('shows empty state when no policies exist', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u', email: 'a@b.co', role: 'TALENTO_HUMANO' } });
    useJornadaPoliciesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    useCreateJornadaPolicyMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPanel();
    expect(screen.getByText(/no hay políticas/i)).toBeInTheDocument();
  });
});
