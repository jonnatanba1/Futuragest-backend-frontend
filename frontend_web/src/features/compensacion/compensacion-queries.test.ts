/**
 * Tests for compensacion-queries hook shapes and enabled gates.
 * Uses renderHook with a real QueryClient (no network — compensacionApi is mocked).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useBalanceQuery,
  useClosePeriodMutation,
  useConfirmPayoutMutation,
  useCreateJornadaPolicyMutation,
  useJornadaPoliciesQuery,
  usePayoutQuery,
} from './compensacion-queries';

// ─── Module-level mock ────────────────────────────────────────────────────────

const { getBalanceMock, getPayoutMock, getJornadaPoliciesMock, closePeriodMock, createJornadaPolicyMock, confirmPayoutMock } =
  vi.hoisted(() => ({
    getBalanceMock: vi.fn(),
    getPayoutMock: vi.fn(),
    getJornadaPoliciesMock: vi.fn(),
    closePeriodMock: vi.fn(),
    createJornadaPolicyMock: vi.fn(),
    confirmPayoutMock: vi.fn(),
  }));

vi.mock('../../lib/api/client', () => ({
  compensacionApi: {
    getBalance: getBalanceMock,
    getPayout: getPayoutMock,
    getJornadaPolicies: getJornadaPoliciesMock,
    closePeriod: closePeriodMock,
    createJornadaPolicy: createJornadaPolicyMock,
    confirmPayout: confirmPayoutMock,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ─── useBalanceQuery ──────────────────────────────────────────────────────────

describe('useBalanceQuery', () => {
  it('fires the query when operarioId, desde, and hasta are all provided', async () => {
    getBalanceMock.mockResolvedValueOnce({
      operarioId: 'op-1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      creditosHoras: '3.50',
      debitosHoras: '1.00',
      carryIn: '0.00',
      saldoHoras: '2.50',
      breakdown: [],
    });

    const { result } = renderHook(
      () => useBalanceQuery('op-1', '2026-05-01', '2026-05-15'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.saldoHoras).toBe('2.50');
    expect(getBalanceMock).toHaveBeenCalledWith('op-1', '2026-05-01', '2026-05-15');
  });

  it('does NOT fire when operarioId is null', async () => {
    const { result } = renderHook(
      () => useBalanceQuery(null, '2026-05-01', '2026-05-15'),
      { wrapper: makeWrapper() },
    );

    // fetchStatus is 'idle' when enabled=false
    expect(result.current.fetchStatus).toBe('idle');
    expect(getBalanceMock).not.toHaveBeenCalled();
  });
});

// ─── usePayoutQuery ───────────────────────────────────────────────────────────

describe('usePayoutQuery', () => {
  it('fires when enabled=true and operarioId + periodKey are provided', async () => {
    getPayoutMock.mockResolvedValueOnce({
      operarioId: 'op-1',
      periodKey: '2026-05-Q1',
      saldoHoras: '2.50',
      horasBase: '2.50',
      factorRecargo: '1.25',
      horasPagables: '3.13',
    });

    const { result } = renderHook(
      () => usePayoutQuery('op-1', '2026-05-Q1', true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.factorRecargo).toBe('1.25');
  });

  it('does NOT fire when enabled=false', async () => {
    const { result } = renderHook(
      () => usePayoutQuery('op-1', '2026-05-Q1', false),
      { wrapper: makeWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPayoutMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when operarioId is null even if enabled=true', async () => {
    const { result } = renderHook(
      () => usePayoutQuery(null, '2026-05-Q1', true),
      { wrapper: makeWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ─── useJornadaPoliciesQuery ──────────────────────────────────────────────────

describe('useJornadaPoliciesQuery', () => {
  it('returns the policies list', async () => {
    getJornadaPoliciesMock.mockResolvedValueOnce([
      { id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '' },
    ]);

    const { result } = renderHook(() => useJornadaPoliciesQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].horasDiarias).toBe('8.00');
  });
});

// ─── useClosePeriodMutation ───────────────────────────────────────────────────

describe('useClosePeriodMutation', () => {
  it('calls closePeriod with operarioId and body', async () => {
    closePeriodMock.mockResolvedValueOnce({ id: 'period-1', periodKey: '2026-05-Q1' });

    const { result } = renderHook(() => useClosePeriodMutation(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({
      operarioId: 'op-1',
      body: { desde: '2026-05-01', hasta: '2026-05-15' },
    });

    expect(closePeriodMock).toHaveBeenCalledWith('op-1', {
      desde: '2026-05-01',
      hasta: '2026-05-15',
    });
  });
});

// ─── useConfirmPayoutMutation ─────────────────────────────────────────────────

describe('useConfirmPayoutMutation', () => {
  it('calls confirmPayout with operarioId and body', async () => {
    confirmPayoutMock.mockResolvedValueOnce({
      operarioId: 'op-1',
      periodKey: '2026-05-Q1',
      saldoHoras: '2.50',
      horasBase: '2.50',
      factorRecargo: '1.25',
      horasPagables: '3.13',
      paidAt: '2026-06-10T12:00:00.000Z',
      payoutRef: 'ref-uuid-001',
    });

    const { result } = renderHook(() => useConfirmPayoutMutation(), { wrapper: makeWrapper() });

    const confirmed = await result.current.mutateAsync({
      operarioId: 'op-1',
      body: { periodKey: '2026-05-Q1' },
    });

    expect(confirmPayoutMock).toHaveBeenCalledWith('op-1', { periodKey: '2026-05-Q1' });
    expect(confirmed.paidAt).toBe('2026-06-10T12:00:00.000Z');
    expect(confirmed.payoutRef).toBe('ref-uuid-001');
  });
});

// ─── useCreateJornadaPolicyMutation ──────────────────────────────────────────

describe('useCreateJornadaPolicyMutation', () => {
  it('calls createJornadaPolicy with the body', async () => {
    createJornadaPolicyMock.mockResolvedValueOnce({
      id: 'pol-2',
      horasDiarias: '7.00',
      vigenteDesde: '2026-07-01',
      createdAt: '',
    });

    const { result } = renderHook(
      () => useCreateJornadaPolicyMutation(),
      { wrapper: makeWrapper() },
    );

    const created = await result.current.mutateAsync({
      horasDiarias: 7,
      vigenteDesde: '2026-07-01',
    });

    expect(created.horasDiarias).toBe('7.00');
    expect(createJornadaPolicyMock).toHaveBeenCalledWith({
      horasDiarias: 7,
      vigenteDesde: '2026-07-01',
    });
  });
});
