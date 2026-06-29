import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { CloseFortnightModal } from './CloseFortnightModal';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { closeMutateAsyncMock } = vi.hoisted(() => ({
  closeMutateAsyncMock: vi.fn(),
}));

vi.mock('./compensacion-queries', () => ({
  useClosePeriodMutation: () => ({
    mutateAsync: closeMutateAsyncMock,
    isPending: false,
  }),
}));

// Mock Mantine notifications
const { notificationsShowMock } = vi.hoisted(() => ({
  notificationsShowMock: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({
  notifications: { show: notificationsShowMock },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  opened: true,
  onClose: vi.fn(),
  operarioId: 'op-1',
  desde: '2026-05-01',
  hasta: '2026-05-15',
  periodKey: '2026-05-Q1',
  saldoHoras: '2.50',
};

function renderModal(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(
    <MantineProvider>
      <CloseFortnightModal {...props} />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CloseFortnightModal', () => {
  // CLO-4: Disposition NOT shown when saldo >= 0
  it('does not show disposition select when saldoHoras is zero or positive', () => {
    renderModal({ saldoHoras: '0.00' });
    expect(screen.queryByLabelText(/disposición|disposition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trasladar|deducir/i)).not.toBeInTheDocument();
  });

  it('does not show disposition select when saldoHoras is positive', () => {
    renderModal({ saldoHoras: '2.50' });
    expect(screen.queryByLabelText(/disposición|disposition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trasladar|deducir/i)).not.toBeInTheDocument();
  });

  // CLO-3: Disposition shown when saldo < 0
  it('shows disposition select when saldoHoras is negative', () => {
    renderModal({ saldoHoras: '-2.50' });
    // The Select renders a label "Disposición del saldo"
    expect(screen.getByText(/disposición del saldo/i)).toBeInTheDocument();
  });

  it('requires disposition when saldo is negative and prevents submit without it', async () => {
    const user = userEvent.setup();
    renderModal({ saldoHoras: '-1.00' });

    // Try to submit without selecting disposition
    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    // Validation should prevent the mutation from being called
    expect(closeMutateAsyncMock).not.toHaveBeenCalled();
  });

  // Display of saldo and period info
  it('displays the saldoHoras verbatim', () => {
    renderModal({ saldoHoras: '3.75' });
    expect(screen.getByText('3.75')).toBeInTheDocument();
  });

  it('displays the period range', () => {
    renderModal();
    expect(screen.getByText(/2026-05-01/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-15/)).toBeInTheDocument();
  });

  // Successful close
  it('calls closeMutation with correct payload when saldo >= 0', async () => {
    const user = userEvent.setup();
    closeMutateAsyncMock.mockResolvedValue({ id: 'period-1' });
    renderModal({ saldoHoras: '1.00' });

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(closeMutateAsyncMock).toHaveBeenCalledTimes(1));
    const call = closeMutateAsyncMock.mock.calls[0][0];
    expect(call.operarioId).toBe('op-1');
    expect(call.body.desde).toBe('2026-05-01');
    expect(call.body.hasta).toBe('2026-05-15');
    expect(call.body.disposition).toBeNull();
    expect(typeof call.body.clientRef).toBe('string');
    expect(call.body.clientRef.length).toBeGreaterThan(0);
  });

  it('calls closeMutation with disposition when saldo is negative', async () => {
    const user = userEvent.setup();
    closeMutateAsyncMock.mockResolvedValue({ id: 'period-1' });
    renderModal({ saldoHoras: '-2.00' });

    // Select disposition — click by placeholder text then pick option
    await user.click(screen.getByPlaceholderText(/seleccione una opción/i));
    await user.click(screen.getByText(/trasladar saldo/i));

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(closeMutateAsyncMock).toHaveBeenCalledTimes(1));
    const call = closeMutateAsyncMock.mock.calls[0][0];
    expect(call.body.disposition).toBe('CARRY_OVER');
  });

  it('calls onClose after successful close', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    closeMutateAsyncMock.mockResolvedValue({ id: 'period-1' });
    renderModal({ saldoHoras: '0.00', onClose });

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // CLO-6: 409 shows notification, modal stays open
  it('shows error notification and keeps modal open on 409 conflict', async () => {
    const user = userEvent.setup();
    closeMutateAsyncMock.mockRejectedValue(new ApiError(409, 'Period already closed'));
    renderModal({ saldoHoras: '0.00' });

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    const call = notificationsShowMock.mock.calls[0][0];
    expect(call.color).toBe('red');
    // Modal should still be rendered (onClose not called)
    expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
  });

  // CLO-7: 409 NonContiguous shows the backend message verbatim (not a hardcoded one)
  it('shows the backend message for 409 NonContiguousCloseError', async () => {
    const user = userEvent.setup();
    const backendMessage = 'La quincena anterior tiene saldo pendiente y no ha sido cerrada.';
    closeMutateAsyncMock.mockRejectedValue(new ApiError(409, backendMessage));
    renderModal({ saldoHoras: '0.00' });

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    const call = notificationsShowMock.mock.calls[0][0];
    expect(call.color).toBe('red');
    expect(call.message).toBe(backendMessage);
  });

  // CLO-8: 422 NonCanonicalPeriodRangeError shows the backend message
  it('shows the backend message for 422 NonCanonicalPeriodRangeError', async () => {
    const user = userEvent.setup();
    const backendMessage = 'El rango de fechas no corresponde a una quincena canónica.';
    closeMutateAsyncMock.mockRejectedValue(new ApiError(422, backendMessage));
    renderModal({ saldoHoras: '0.00' });

    await user.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    const call = notificationsShowMock.mock.calls[0][0];
    expect(call.color).toBe('red');
    expect(call.message).toBe(backendMessage);
  });
});
