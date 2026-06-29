/**
 * A6.1 RED → GREEN (patched): GetPeriodBalanceUseCase unit spec.
 * EP-01a, EP-01b (real path via OperarioReaderPort), EP-01c, EP-01d. carryIn=0 in PR-A.
 *
 * PATCH: EP-01b now tests the REAL out-of-scope path:
 *   - OperarioReaderPort.findById returns null → OperarioNotInScopeError (404, fail-closed).
 *   - This mirrors how CheckInAttendanceUseCase validates operario scope.
 *   - The old vacuous test (mocking AttendanceReaderPort to return null, an impossible
 *     production path) is replaced by this real-path test.
 *
 * B7.1 PR-B addition: EP-04e — carryIn from previous CARRY_OVER period fed into balance.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { GetPeriodBalanceUseCase } from './get-period-balance.use-case';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { NoPolicyForDateError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { AttendanceReaderPort, AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type {
  CompensationPeriodRepositoryPort,
  CompensationPeriodRecord,
} from '../domain/ports/compensation-period-repository.port';

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

function makeOperarioReader(exists: boolean): jest.Mocked<OperarioReaderPort> {
  return {
    findById: jest.fn().mockResolvedValue(exists ? { id: 'O1' } : null),
  };
}

function makePeriodRepo(prevPeriod: CompensationPeriodRecord | null): jest.Mocked<CompensationPeriodRepositoryPort> {
  return {
    findByOperarioAndPeriod: jest.fn().mockResolvedValue(null),
    findPreviousClosed: jest.fn().mockResolvedValue(prevPeriod),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findOverlappingClosed: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    markPaid: jest.fn().mockResolvedValue(1),
    markDiverged: jest.fn().mockResolvedValue(undefined),
    findClosedContainingDate: jest.fn().mockResolvedValue(null),
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
    const operarioReader = makeOperarioReader(true);

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader);
    const result = await useCase.execute({ operarioId: 'O1', desde: '2026-05-01', hasta: '2026-05-15' });

    expect(result.saldo.toNumber()).toBeCloseTo(-0.5, 2);
    expect(result.creditos.toNumber()).toBeCloseTo(0.5, 2);
    expect(result.debitos.toNumber()).toBeCloseTo(1, 2);
    expect(result.perDay).toHaveLength(2);
    // Operario existence was checked
    expect(operarioReader.findById).toHaveBeenCalledWith('O1');
  });

  // ── EP-01b — Operario not in scope → OperarioNotInScopeError (real path) ─

  it('EP-01b — operarioReader.findById returns null (out-of-scope) → throws OperarioNotInScopeError', async () => {
    // Real production path: ScopedOperarioRepository.findById returns null when
    // the operario is not visible to the requesting principal (SUPERVISOR scope
    // filters by supervisorId predicate; non-owned operario → empty result → null).
    // GetPeriodBalanceUseCase must throw OperarioNotInScopeError BEFORE reading
    // attendances (fail-closed, spec REQ-RBAC-04 / REQ-EP-01b).
    const reader = makeReaderPort([]); // should never be called
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(false); // null → out of scope

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader);

    await expect(
      useCase.execute({ operarioId: 'OUT-OF-SCOPE', desde: '2026-05-01', hasta: '2026-05-15' }),
    ).rejects.toThrow(OperarioNotInScopeError);

    // Attendance reader must NOT be called — scope check is fail-fast
    expect(reader.findCompletedInRange).not.toHaveBeenCalled();
  });

  // ── EP-01c — Operario in scope but no completed attendances → zeros ────────

  it('EP-01c — operario in scope, no completed attendances in range → zeros', async () => {
    // Distinct from EP-01b: operario IS in scope (findById returns the record),
    // but has zero completed attendances in the period → valid 200 with zero balance.
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true); // exists and in scope

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader);
    const result = await useCase.execute({ operarioId: 'O1', desde: '2026-05-01', hasta: '2026-05-15' });

    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
    expect(result.perDay).toHaveLength(0);
    // Scope was checked before attendance read
    expect(operarioReader.findById).toHaveBeenCalledWith('O1');
    expect(reader.findCompletedInRange).toHaveBeenCalled();
  });

  // ── EP-01d — No policy covers range → NoPolicyForDateError ───────────────

  it('EP-01d — operario in scope, attendance exists but no policy covers the date → NoPolicyForDateError', async () => {
    const attendances = [makeCompletedAttendance('2025-12-31', 8)];
    // Policy only starts 2026-01-01 — doesn't cover 2025-12-31
    const policies = [makePolicy('2026-01-01', 8)];

    const reader = makeReaderPort(attendances);
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true); // in scope

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader);

    await expect(
      useCase.execute({ operarioId: 'O1', desde: '2025-12-31', hasta: '2025-12-31' }),
    ).rejects.toThrow(NoPolicyForDateError);
  });

  // ── B7.1 EP-04e — carryIn from previous CARRY_OVER period ─────────────────
  // PR-B: GetPeriodBalanceUseCase injects CompensationPeriodRepositoryPort and
  // reads carryIn from the previous CARRY_OVER period when it exists + saldo < 0.

  it('EP-04e — previous CARRY_OVER period with negative saldo feeds carryIn into current balance', async () => {
    // Current period: zero attendances → live saldo before carryIn = 0
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true);

    // Previous Q1 period: saldo = -0.25, disposition = CARRY_OVER
    const prevPeriod: CompensationPeriodRecord = {
      id: 'cp-prev',
      operarioId: 'O1',
      zoneId: 'zone-1',
      supervisorId: 'sup-1',
      periodKey: '2026-05-Q1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      creditos: new Decimal('0.00'),
      debitos: new Decimal('0.25'),
      carryIn: new Decimal('0.00'),
      saldo: new Decimal('-0.25'),
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-1',
      decidedAt: new Date(),
      closedAt: new Date(),
      clientRef: 'ref-prev',
      paidAt: null,
      payoutRef: null,
      divergedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Fix 3: implementation now uses findByOperarioAndPeriod with the EXACT prevKey
    const periodRepo = makePeriodRepo(null);
    // Q2 prevKey = Q1; findByOperarioAndPeriod('O1', '2026-05-Q1') → prevPeriod
    periodRepo.findByOperarioAndPeriod.mockImplementation((_oid: string, key: string) =>
      Promise.resolve(key === '2026-05-Q1' ? prevPeriod : null),
    );

    // Use the overloaded constructor that accepts CompensationPeriodRepositoryPort
    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader, periodRepo);

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-16', // Q2 — previous was Q1
      hasta: '2026-05-31',
    });

    // carryIn = -0.25 from prev; current live credits = 0, debits = 0
    // saldo = -0.25 + 0 - 0 = -0.25
    expect(result.carryIn.toNumber()).toBeCloseTo(-0.25, 2);
    expect(result.saldo.toNumber()).toBeCloseTo(-0.25, 2);
    // Fix 3: exact prevKey lookup via findByOperarioAndPeriod
    expect(periodRepo.findByOperarioAndPeriod).toHaveBeenCalledWith('O1', '2026-05-Q1');
  });

  // ── Fix 3: exact prevKey carryIn (live balance) ───────────────────────────────

  it('Fix3-live-a — Q1 closed CARRY_OVER saldo=-2, exact prev Q1 → carryIn = -2 for Q2', async () => {
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true);

    const prevQ1: CompensationPeriodRecord = {
      id: 'cp-q1',
      operarioId: 'O1',
      zoneId: 'zone-1',
      supervisorId: 'sup-1',
      periodKey: '2026-05-Q1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      creditos: new Decimal('0.00'),
      debitos: new Decimal('2.00'),
      carryIn: new Decimal('0.00'),
      saldo: new Decimal('-2.00'),
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-1',
      decidedAt: new Date(),
      closedAt: new Date(),
      clientRef: 'ref-q1',
      paidAt: null,
      payoutRef: null,
      divergedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // periodRepo mock: findByOperarioAndPeriod returns Q1 when asked for '2026-05-Q1'
    const periodRepo: jest.Mocked<CompensationPeriodRepositoryPort> = {
      findByOperarioAndPeriod: jest.fn().mockImplementation((_oid: string, key: string) =>
        Promise.resolve(key === '2026-05-Q1' ? prevQ1 : null),
      ),
      findPreviousClosed: jest.fn().mockResolvedValue(prevQ1),
      findByClientRef: jest.fn().mockResolvedValue(null),
      findOverlappingClosed: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      markPaid: jest.fn().mockResolvedValue(1),
      markDiverged: jest.fn().mockResolvedValue(undefined),
      findClosedContainingDate: jest.fn().mockResolvedValue(null),
    };

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader, periodRepo);

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-16', // Q2 — exact prev is Q1
      hasta: '2026-05-31',
    });

    expect(result.carryIn.toNumber()).toBe(-2);
    expect(result.saldo.toNumber()).toBe(-2);
  });

  it('Fix3-live-b — gap: Q1 closed CARRY_OVER, Q2 missing, live balance for Q3 → carryIn = 0 (no throw)', async () => {
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true);

    // prevKey for Q3 (2026-06-Q1) = 2026-05-Q2 — does NOT exist
    const periodRepo: jest.Mocked<CompensationPeriodRepositoryPort> = {
      findByOperarioAndPeriod: jest.fn().mockResolvedValue(null), // Q2 not found
      findPreviousClosed: jest.fn().mockResolvedValue(null),
      findByClientRef: jest.fn().mockResolvedValue(null),
      findOverlappingClosed: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      markPaid: jest.fn().mockResolvedValue(1),
      markDiverged: jest.fn().mockResolvedValue(undefined),
      findClosedContainingDate: jest.fn().mockResolvedValue(null),
    };

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader, periodRepo);

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-06-01',
      hasta: '2026-06-15',
    });

    // Live balance: no throw, carryIn = 0
    expect(result.carryIn.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
  });

  it('EP-04e-no-carryover — previous PAYROLL_DEDUCTION period → carryIn = 0', async () => {
    const reader = makeReaderPort([]);
    const policies = [makePolicy('2026-01-01', 8)];
    const policyRepo = makePolicyRepo(policies);
    const operarioReader = makeOperarioReader(true);

    // Previous period settled via PAYROLL_DEDUCTION → does NOT carry forward
    const prevPeriod: CompensationPeriodRecord = {
      id: 'cp-prev-settled',
      operarioId: 'O1',
      zoneId: 'zone-1',
      supervisorId: 'sup-1',
      periodKey: '2026-05-Q1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      creditos: new Decimal('0.00'),
      debitos: new Decimal('0.50'),
      carryIn: new Decimal('0.00'),
      saldo: new Decimal('-0.50'),
      disposition: 'PAYROLL_DEDUCTION', // debt settled — no carryIn
      approvedByUserId: 'admin-1',
      decidedAt: new Date(),
      closedAt: new Date(),
      clientRef: 'ref-settled',
      paidAt: null,
      payoutRef: null,
      divergedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Fix 3: use findByOperarioAndPeriod mock to return the PAYROLL_DEDUCTION period
    const periodRepo = makePeriodRepo(null);
    periodRepo.findByOperarioAndPeriod.mockImplementation((_oid: string, key: string) =>
      Promise.resolve(key === '2026-05-Q1' ? prevPeriod : null),
    );

    const useCase = new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioReader, periodRepo);

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-16',
      hasta: '2026-05-31',
    });

    // PAYROLL_DEDUCTION: carryIn must be 0 (debt was settled, not carried)
    expect(result.carryIn.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
  });
});
