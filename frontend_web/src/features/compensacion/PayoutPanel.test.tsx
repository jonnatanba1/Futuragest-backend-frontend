import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PeriodPayoutDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { PayoutPanel } from './PayoutPanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { usePayoutQueryMock, confirmPayoutMutateAsyncMock } = vi.hoisted(() => ({
  usePayoutQueryMock: vi.fn(),
  confirmPayoutMutateAsyncMock: vi.fn(),
}));
vi.mock('./compensacion-queries', () => ({
  usePayoutQuery: usePayoutQueryMock,
  useConfirmPayoutMutation: () => ({
    mutateAsync: confirmPayoutMutateAsyncMock,
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAYOUT: PeriodPayoutDto = {
  operarioId: 'op-1',
  periodKey: '2026-05-Q1',
  saldoHoras: '2.50',
  horasBase: '8.00',
  factorRecargo: '1.25',
  horasPagables: '10.00',
  paidAt: null,
  payoutRef: null,
};

const PAID_PAYOUT: PeriodPayoutDto = {
  ...PAYOUT,
  paidAt: '2026-06-10T12:34:56.000Z',
  payoutRef: 'ref-uuid-001',
};

const ZERO_PAYOUT: PeriodPayoutDto = {
  ...PAYOUT,
  horasPagables: '0.00',
  horasBase: '0.00',
  saldoHoras: '-1.00',
};

const DEFAULT_PROPS = {
  operarioId: 'op-1',
  periodKey: '2026-05-Q1',
  closed: true,
  canWrite: true,
};

function renderPanel(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(
    <MantineProvider>
      <PayoutPanel {...props} />
    </MantineProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PayoutPanel', () => {
  // PAY-1: Payout hidden for read-only roles (canWrite=false)
  it('renders nothing when canWrite is false', () => {
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel({ canWrite: false });
    // No payout content should appear
    expect(screen.queryByText(/liquidación/i)).not.toBeInTheDocument();
    expect(screen.queryByText('10.00')).not.toBeInTheDocument();
    expect(screen.queryByText('1.25')).not.toBeInTheDocument();
  });

  // PAY-2: Renders payable strings correctly
  it('renders horasBase, factorRecargo, horasPagables as verbatim strings', () => {
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();
    expect(screen.getByText('8.00')).toBeInTheDocument();
    expect(screen.getByText('1.25')).toBeInTheDocument();
    expect(screen.getByText('10.00')).toBeInTheDocument();
  });

  // PAY-3: PERIOD_NOT_CLOSED (404) shows informational state, not error
  it('shows informational message when 404 PERIOD_NOT_CLOSED, not an error alert', () => {
    const err = new ApiError(404, 'PERIOD_NOT_CLOSED');
    usePayoutQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: err });
    renderPanel();
    expect(screen.getByText(/liquidación disponible al cerrar/i)).toBeInTheDocument();
    // Should NOT render a red error alert
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // PAY-4: Query disabled when closed=false
  it('calls usePayoutQuery with enabled=false when closed is false', () => {
    usePayoutQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null });
    renderPanel({ closed: false });
    const calls = usePayoutQueryMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Third arg is enabled — should be false
    expect(calls[0][2]).toBe(false);
  });

  // Loading state
  it('shows a loading indicator while payout is loading', () => {
    usePayoutQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    renderPanel();
    expect(screen.getByLabelText(/cargando/i)).toBeInTheDocument();
  });

  // PAY-5: Paid state — badge shown, no confirm button
  it('shows Liquidado badge and date when paidAt is set, no confirm button', () => {
    usePayoutQueryMock.mockReturnValue({ data: PAID_PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();
    expect(screen.getByText(/liquidado/i)).toBeInTheDocument();
    // Date slice(0,10) from paidAt
    expect(screen.getByText('2026-06-10')).toBeInTheDocument();
    // payoutRef shown
    expect(screen.getByText('ref-uuid-001')).toBeInTheDocument();
    // No confirm button
    expect(screen.queryByTestId('confirm-payout-btn')).not.toBeInTheDocument();
  });

  // PAY-6: Unpaid + payable + canWrite → confirm button present
  it('shows confirm button when paidAt is null, horasPagables > 0, and canWrite', () => {
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();
    expect(screen.getByTestId('confirm-payout-btn')).toBeInTheDocument();
  });

  // PAY-7: Click confirm button → mutation called with right args
  it('calls confirmPayout mutation with operarioId and periodKey on click', async () => {
    const user = userEvent.setup();
    confirmPayoutMutateAsyncMock.mockResolvedValue({ ...PAYOUT, paidAt: '2026-06-10T00:00:00.000Z', payoutRef: 'ref-new' });
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();

    await user.click(screen.getByTestId('confirm-payout-btn'));

    await waitFor(() => expect(confirmPayoutMutateAsyncMock).toHaveBeenCalledTimes(1));
    const call = confirmPayoutMutateAsyncMock.mock.calls[0][0];
    expect(call.operarioId).toBe('op-1');
    expect(call.body.periodKey).toBe('2026-05-Q1');
  });

  // PAY-8: Successful confirm → teal notification
  it('shows teal notification on successful confirmation', async () => {
    const user = userEvent.setup();
    confirmPayoutMutateAsyncMock.mockResolvedValue({ ...PAYOUT, paidAt: '2026-06-10T00:00:00.000Z', payoutRef: 'ref-new' });
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();

    await user.click(screen.getByTestId('confirm-payout-btn'));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    expect(notificationsShowMock.mock.calls[0][0].color).toBe('teal');
  });

  // PAY-9: 422 error → yellow notification with backend message
  it('shows yellow notification with backend message on 422 error', async () => {
    const user = userEvent.setup();
    confirmPayoutMutateAsyncMock.mockRejectedValue(new ApiError(422, 'No hay horas a liquidar'));
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();

    await user.click(screen.getByTestId('confirm-payout-btn'));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    const call = notificationsShowMock.mock.calls[0][0];
    expect(call.color).toBe('yellow');
    expect(call.message).toContain('No hay horas a liquidar');
  });

  // PAY-10: Other errors → red notification
  it('shows red notification on unexpected errors', async () => {
    const user = userEvent.setup();
    confirmPayoutMutateAsyncMock.mockRejectedValue(new ApiError(500, 'Internal server error'));
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();

    await user.click(screen.getByTestId('confirm-payout-btn'));

    await waitFor(() => expect(notificationsShowMock).toHaveBeenCalledTimes(1));
    expect(notificationsShowMock.mock.calls[0][0].color).toBe('red');
  });

  // PAY-11: Zero payable → no confirm button
  it('shows no confirm button when horasPagables is 0', () => {
    usePayoutQueryMock.mockReturnValue({ data: ZERO_PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel();
    expect(screen.queryByTestId('confirm-payout-btn')).not.toBeInTheDocument();
  });

  // PAY-12: canWrite=false → no confirm button even if payable
  it('shows no confirm button when canWrite is false regardless of horasPagables', () => {
    usePayoutQueryMock.mockReturnValue({ data: PAYOUT, isLoading: false, isError: false, error: null });
    renderPanel({ canWrite: false });
    expect(screen.queryByTestId('confirm-payout-btn')).not.toBeInTheDocument();
  });
});
