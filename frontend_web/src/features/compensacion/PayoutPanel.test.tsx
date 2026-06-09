import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PeriodPayoutDto } from '@futuragest/contracts';
import { ApiError } from '../../lib/api/client';
import { PayoutPanel } from './PayoutPanel';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { usePayoutQueryMock } = vi.hoisted(() => ({
  usePayoutQueryMock: vi.fn(),
}));
vi.mock('./compensacion-queries', () => ({
  usePayoutQuery: usePayoutQueryMock,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAYOUT: PeriodPayoutDto = {
  operarioId: 'op-1',
  periodKey: '2026-05-Q1',
  saldoHoras: '2.50',
  horasBase: '8.00',
  factorRecargo: '1.25',
  horasPagables: '10.00',
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
});
