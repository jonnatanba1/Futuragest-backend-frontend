/**
 * Tests for compensacion-queries hook shapes and enabled gates.
 * Uses renderHook with a real QueryClient (no network — compensacionApi is mocked).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useArchiveJornadaPolicyMutation,
  useBalanceQuery,
  useClosePeriodMutation,
  useConfirmPayoutMutation,
  useCreateJornadaPolicyMutation,
  useJornadaPoliciesQuery,
  usePayoutQuery,
} from './compensacion-queries';

// ─── Module-level mock ────────────────────────────────────────────────────────

const {
  getBalanceMock,
  getPayoutMock,
  getJornadaPoliciesMock,
  closePeriodMock,
  createJornadaPolicyMock,
  confirmPayoutMock,
  archiveJornadaPolicyMock,
} = vi.hoisted(() => ({
  getBalanceMock: vi.fn(),
  getPayoutMock: vi.fn(),
  getJornadaPoliciesMock: vi.fn(),
  closePeriodMock: vi.fn(),
  createJornadaPolicyMock: vi.fn(),
  confirmPayoutMock: vi.fn(),
  archiveJornadaPolicyMock: vi.fn(),
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
  jornadaPolicyApi: {
    archive: archiveJornadaPolicyMock,
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

// ─── useJornadaPoliciesQuery (T10: zoneId filter) ─────────────────────────────

describe('useJornadaPoliciesQuery', () => {
  beforeEach(() => {
    getJornadaPoliciesMock.mockResolvedValue([
      { id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '' },
    ]);
  });

  it('returns the policies list when called with no zoneId', async () => {
    const { result } = renderHook(() => useJornadaPoliciesQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].horasDiarias).toBe('8.00');
    expect(getJornadaPoliciesMock).toHaveBeenCalledWith(undefined);
  });

  it('with zoneId="zA" calls getJornadaPolicies({ zoneId:"zA" })', async () => {
    const { result } = renderHook(() => useJornadaPoliciesQuery('zA'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getJornadaPoliciesMock).toHaveBeenCalledWith({ zoneId: 'zA' });
  });

  it('with no zoneId calls getJornadaPolicies with undefined', async () => {
    const { result } = renderHook(() => useJornadaPoliciesQuery(undefined), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getJornadaPoliciesMock).toHaveBeenCalledWith(undefined);
  });

  it('with zoneId="" calls getJornadaPolicies({ zoneId:"" }) (global filter)', async () => {
    const { result } = renderHook(() => useJornadaPoliciesQuery(''), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getJornadaPoliciesMock).toHaveBeenCalledWith({ zoneId: '' });
  });

  it('with zoneId=null calls getJornadaPolicies({ zoneId:"" }) (same as empty string)', async () => {
    const { result } = renderHook(() => useJornadaPoliciesQuery(null), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getJornadaPoliciesMock).toHaveBeenCalledWith({ zoneId: '' });
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
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: 7,
      horasSemanales: 44,
      vigenteDesde: '2026-07-01',
    });

    expect(created.horasDiarias).toBe('7.00');
    expect(createJornadaPolicyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        horasDiarias: 7,
        vigenteDesde: '2026-07-01',
      }),
    );
  });

  it('on success invalidates the [compensacion,policies] prefix with exact:false', async () => {
    createJornadaPolicyMock.mockResolvedValueOnce({
      id: 'pol-2',
      horasDiarias: '7.00',
      vigenteDesde: '2026-07-01',
      createdAt: '',
    });
    const invalidateSpy = vi
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockResolvedValueOnce({} as never);

    const { result } = renderHook(() => useCreateJornadaPolicyMutation(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: 7,
      horasSemanales: 44,
      vigenteDesde: '2026-07-01',
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['compensacion', 'policies'],
        exact: false,
      }),
    );
    invalidateSpy.mockRestore();
  });
});

// ─── useArchiveJornadaPolicyMutation (T10: delete wire) ──────────────────────

describe('useArchiveJornadaPolicyMutation', () => {
  it('exists and calls jornadaPolicyApi.archive with the id', async () => {
    archiveJornadaPolicyMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useArchiveJornadaPolicyMutation(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync('pol-1');

    expect(archiveJornadaPolicyMock).toHaveBeenCalledWith('pol-1');
  });

  it('on success invalidates the [compensacion,policies] prefix with exact:false', async () => {
    archiveJornadaPolicyMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockResolvedValueOnce({} as never);

    const { result } = renderHook(() => useArchiveJornadaPolicyMutation(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync('pol-1');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['compensacion', 'policies'],
        exact: false,
      }),
    );
    invalidateSpy.mockRestore();
  });
});
