/**
 * A6.1 RED → A6.2 GREEN: GetPeriodBalanceUseCase unit spec.
 * EP-01a, EP-01b, EP-01c, EP-01d. carryIn=0 in PR-A.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { GetPeriodBalanceUseCase } from './get-period-balance.use-case';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { NoPolicyForDateError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { AttendanceReaderPort, AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCompletedAttendance(date: string, durationHours: number): AttendanceReaderRecord {
  const checkIn = new Date(`${date}T07:00:00Z`);
  const checkOut = new Date(checkIn.getTime() + durationHours * 3600_000);
  return {
    id: `att-${date}`,
    operarioId: 'O1',
    date,
    checkInCapturedAt: checkIn,
    checkOutCapturedAt: checkOut,
    completedAt: checkOut,
  };
}

function makePolicy(dateStr: string, hours: number): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}`,
    horasDiarias: new Decimal(hours),
    vigenteDesde: new Date(`${dateStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makeReaderPort(attendances: AttendanceReaderRecord[]): jest.Mocked<AttendanceReaderPort> {
  return {
    findCompletedInRange: jest.fn().mockResolvedValue(attendances),
  };
}

function makePolicyRepo(timeline: JornadaPolicyRecord[]): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    create: jest.fn(),
    findTimeline: jest.fn().mockResolvedValue(timeline),
    findLatestBefore: jest.fn(),
  };
}

describe('GetPeriodBalanceUseCase', () => {
  let calcUseCase: CalculatePeriodBalanceUseCase;

  beforeEach(() => {
    calcUseCase = new CalculatePeriodBalanceUseCase();
  });

  // ── EP-01a — Happy path ────────────────────────────────────────────────────

  it('EP-01a — happy path: 2 attendances → correct saldo', async () => {
    const attendances = [
      makeCompletedAttendance('2026-05-01', 7),   // -1h
      makeCompletedAttendance('2026-05-02', 8.5), // +0.5h
    ];
    const policies = [makePolicy('2026-01-01', 8)];

    const reader = makeReaderPort(attendances);
    const policyRepo = makePolicyRepo(policies);

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase);
    const result = await useCase.execute({ operarioId: 'O1', desde: '2026-05-01', hasta: '2026-05-15' });

    expect(result.saldo.toNumber()).toBeCloseTo(-0.5, 2);
    expect(result.creditos.toNumber()).toBeCloseTo(0.5, 2);
    expect(result.debitos.toNumber()).toBeCloseTo(1, 2);
    expect(result.perDay).toHaveLength(2);
  });

  // ── EP-01b — Operario not in scope → OperarioNotInScopeError ─────────────

  it('EP-01b — findCompletedInRange returns empty for out-of-scope operario → throws OperarioNotInScopeError', async () => {
    // When a SUPERVISOR queries an out-of-scope operario, the scoped repo returns [].
    // The use-case then checks: if null is returned from a "scope check" call.
    // Per design: scope-check = findCompletedInRange returning null or zero results
    // for an operario the requester doesn't own → 404 (fail-closed).
    // For PR-A the implementation returns [] (empty range = no scope violation detected
    // purely from range query). The 404 path is triggered via an explicit scope check.
    // We mock the reader to simulate null scope (reader port returns null-signaling absence).
    // Design says: operario out of scope → reader returns null → throw OperarioNotInScopeError.
    const reader: jest.Mocked<AttendanceReaderPort> = {
      findCompletedInRange: jest.fn().mockResolvedValue(null),
    };
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase);

    await expect(
      useCase.execute({ operarioId: 'OUT-OF-SCOPE', desde: '2026-05-01', hasta: '2026-05-15' }),
    ).rejects.toThrow(OperarioNotInScopeError);
  });

  // ── EP-01c — No completed attendances → zeros ─────────────────────────────

  it('EP-01c — no completed attendances in range → zeros', async () => {
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase);
    const result = await useCase.execute({ operarioId: 'O1', desde: '2026-05-01', hasta: '2026-05-15' });

    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
    expect(result.perDay).toHaveLength(0);
  });

  // ── EP-01d — No policy covers range → NoPolicyForDateError ───────────────

  it('EP-01d — attendance exists but no policy covers the date → NoPolicyForDateError', async () => {
    const attendances = [makeCompletedAttendance('2025-12-31', 8)];
    // Policy only starts 2026-01-01 — doesn't cover 2025-12-31
    const policies = [makePolicy('2026-01-01', 8)];

    const reader = makeReaderPort(attendances);
    const policyRepo = makePolicyRepo(policies);

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase);

    await expect(
      useCase.execute({ operarioId: 'O1', desde: '2025-12-31', hasta: '2025-12-31' }),
    ).rejects.toThrow(NoPolicyForDateError);
  });
});
