/**
 * RED → GREEN tests for ConfirmPeriodPayoutUseCase (Fix 4).
 *
 * Covers:
 *   F4-1  — unpaid positive-saldo period → sets paidAt/payoutRef, returns payout numbers
 *   F4-2  — second confirm (paidAt already set) → same payoutRef, NO second markPaid call (idempotent)
 *   F4-3  — saldo <= 0 → NothingToPayError (422)
 *   F4-4  — operario not in scope → OperarioNotInScopeError (404)
 *   F4-5  — period not closed → PeriodNotClosedError (404)
 *   F4-6  — concurrent confirm (markPaid returns count 0) → re-reads and returns existing, idempotent
 */

import { Decimal } from '@prisma/client/runtime/client';
import { ConfirmPeriodPayoutUseCase } from './confirm-period-payout.use-case';
import { NothingToPayError, PeriodNotClosedError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { CompensationPeriodRecord } from '../domain/ports/compensation-period-repository.port';

function makePeriod(saldo: string, paidAt: Date | null = null, payoutRef: string | null = null): CompensationPeriodRecord {
  return {
    id: 'cp-1',
    operarioId: 'op-1',
    zoneId: 'z-1',
    supervisorId: 's-1',
    periodKey: '2026-05-Q1',
    desde: '2026-05-01',
    hasta: '2026-05-15',
    creditos: new Decimal(saldo).greaterThan(0) ? new Decimal(saldo) : new Decimal(0),
    debitos: new Decimal(0),
    carryIn: new Decimal(0),
    saldo: new Decimal(saldo),
    disposition: null,
    approvedByUserId: 'u-1',
    decidedAt: null,
    closedAt: new Date('2026-05-16T00:00:00Z'),
    clientRef: null,
    paidAt,
    payoutRef,
    divergedAt: null,
    createdAt: new Date('2026-05-16T00:00:00Z'),
    updatedAt: new Date('2026-05-16T00:00:00Z'),
  };
}

describe('ConfirmPeriodPayoutUseCase (Fix 4)', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── F4-1: happy path — unpaid positive period ─────────────────────────────

  it('F4-1 — unpaid positive saldo → markPaid called, returns paidAt and payoutRef', async () => {
    const period = makePeriod('8');
    const markPaidMock = jest.fn().mockResolvedValue(1); // count 1 = updated
    const findAfterMock = jest.fn(); // should NOT be called when count=1

    const periodRepo = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(period),
      markPaid: markPaidMock,
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    const result = await useCase.execute({
      operarioId: 'op-1',
      periodKey: '2026-05-Q1',
      confirmedByUserId: 'hr-user',
    });

    // markPaid must be called with the period id
    expect(markPaidMock).toHaveBeenCalledWith(
      'cp-1',
      expect.any(Date),
      expect.any(String), // payoutRef UUID
    );

    // paidAt and payoutRef are in the result
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(typeof result.payoutRef).toBe('string');
    expect(result.payoutRef).toMatch(/^[0-9a-f-]{36}$/i); // UUID format

    // Payout numbers present
    expect(result.horasPagables.toString()).toBe('10');
    expect(result.saldoHoras.toString()).toBe('8');

    expect(findAfterMock).not.toHaveBeenCalled();
  });

  // ── F4-2: idempotent second confirm ──────────────────────────────────────

  it('F4-2 — paidAt already set → same payoutRef returned, markPaid NOT called', async () => {
    const existingPaidAt = new Date('2026-05-17T10:00:00Z');
    const existingRef = 'existing-ref-uuid-1234';
    const paidPeriod = makePeriod('8', existingPaidAt, existingRef);

    const markPaidMock = jest.fn();
    const periodRepo = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(paidPeriod),
      markPaid: markPaidMock,
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    const result = await useCase.execute({
      operarioId: 'op-1',
      periodKey: '2026-05-Q1',
      confirmedByUserId: 'hr-user',
    });

    // Must NOT mutate again
    expect(markPaidMock).not.toHaveBeenCalled();

    // Returns existing paidAt/payoutRef
    expect(result.paidAt).toEqual(existingPaidAt);
    expect(result.payoutRef).toBe(existingRef);
    expect(result.horasPagables.toString()).toBe('10');
  });

  // ── F4-3: nothing to pay ──────────────────────────────────────────────────

  it('F4-3 — saldo = 0 → throws NothingToPayError (422)', async () => {
    const period = makePeriod('0');
    const periodRepo = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(period),
      markPaid: jest.fn(),
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    await expect(
      useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1', confirmedByUserId: 'hr-user' }),
    ).rejects.toBeInstanceOf(NothingToPayError);

    expect(periodRepo.markPaid).not.toHaveBeenCalled();
  });

  it('F4-3b — saldo negative → throws NothingToPayError (422)', async () => {
    const period = makePeriod('-3');
    const periodRepo = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(period),
      markPaid: jest.fn(),
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    await expect(
      useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1', confirmedByUserId: 'hr-user' }),
    ).rejects.toBeInstanceOf(NothingToPayError);
  });

  // ── F4-4: operario not in scope ────────────────────────────────────────────

  it('F4-4 — operario not in scope → OperarioNotInScopeError before touching period repo', async () => {
    const findByOperarioAndPeriod = jest.fn();
    const periodRepo = { findByOperarioAndPeriod, markPaid: jest.fn() };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue(null) },
    );

    await expect(
      useCase.execute({ operarioId: 'ghost', periodKey: '2026-05-Q1', confirmedByUserId: 'hr-user' }),
    ).rejects.toBeInstanceOf(OperarioNotInScopeError);

    expect(findByOperarioAndPeriod).not.toHaveBeenCalled();
  });

  // ── F4-5: period not closed ────────────────────────────────────────────────

  it('F4-5 — period not closed → PeriodNotClosedError (404)', async () => {
    const periodRepo = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(null),
      markPaid: jest.fn(),
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    await expect(
      useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1', confirmedByUserId: 'hr-user' }),
    ).rejects.toBeInstanceOf(PeriodNotClosedError);

    expect(periodRepo.markPaid).not.toHaveBeenCalled();
  });

  // ── F4-6: concurrent confirm race ─────────────────────────────────────────

  it('F4-6 — concurrent confirm (markPaid returns 0) → re-reads and returns idempotent', async () => {
    const period = makePeriod('8');
    const existingPaidAt = new Date('2026-05-17T10:00:00Z');
    const existingRef = 'concurrent-ref-uuid';
    const afterRacePeriod = makePeriod('8', existingPaidAt, existingRef);

    const markPaidMock = jest.fn().mockResolvedValue(0); // 0 = concurrent winner already updated
    const findAfterMock = jest.fn()
      .mockResolvedValueOnce(period)        // first call: unpaid
      .mockResolvedValueOnce(afterRacePeriod); // second call: already paid by concurrent

    const periodRepo = {
      findByOperarioAndPeriod: findAfterMock,
      markPaid: markPaidMock,
    };

    const useCase = new ConfirmPeriodPayoutUseCase(
      periodRepo,
      { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) },
    );

    const result = await useCase.execute({
      operarioId: 'op-1',
      periodKey: '2026-05-Q1',
      confirmedByUserId: 'hr-user',
    });

    // markPaid was attempted
    expect(markPaidMock).toHaveBeenCalledTimes(1);
    // findByOperarioAndPeriod called twice (initial + re-read after race)
    expect(findAfterMock).toHaveBeenCalledTimes(2);

    // Returns the already-confirmed state
    expect(result.paidAt).toEqual(existingPaidAt);
    expect(result.payoutRef).toBe(existingRef);
  });
});
