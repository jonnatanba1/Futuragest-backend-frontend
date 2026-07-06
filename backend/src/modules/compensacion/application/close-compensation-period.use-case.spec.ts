/**
 * B6.1 RED — CloseCompensationPeriodUseCase unit spec.
 *
 * EP-04a  — happy path: first close → snapshot written with correct fields.
 * EP-04b  — idempotency: same clientRef → return existing, no second write.
 * EP-04c  — different ref (real double-close) → CompensationPeriodAlreadyClosedError (409).
 * EP-04d  — negative saldo + no disposition → DispositionRequiredError (422).
 * EP-04e  — scoped operario not found → OperarioNotInScopeError (404).
 *
 * Mirrors check-out-attendance pattern (completedAt lock + clientRef replay).
 * CalculatePeriodBalanceUseCase is pure — injected directly with no mocking.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { CloseCompensationPeriodUseCase } from './close-compensation-period.use-case';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import {
  CompensationPeriodAlreadyClosedError,
  DispositionRequiredError,
  NonCanonicalPeriodRangeError,
  NonContiguousCloseError,
  ClientRefConflictError,
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { AttendanceReaderPort, AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type {
  CompensationPeriodRepositoryPort,
  CompensationPeriodRecord,
} from '../domain/ports/compensation-period-repository.port';
import type { SupervisorZoneReaderPort } from '../domain/ports/supervisor-zone-reader.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(dateStr: string, hours: number): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}`,
    operarioId: null,
    zoneId: null,
    horaInicio: '06:00',
    horaFin: '14:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: null,
    almuerzoFin: null,
    desayunoInicio: null,
    desayunoFin: null,
    toleranciaMin: 5,
    horasSemanales: new Decimal(hours * 5),
    horasDiarias: new Decimal(hours),
    vigenteDesde: new Date(`${dateStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makeAttendance(date: string, durationHours: number): AttendanceReaderRecord {
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

function makePeriodRecord(overrides: Partial<CompensationPeriodRecord> = {}): CompensationPeriodRecord {
  return {
    id: 'cp-1',
    operarioId: 'O1',
    zoneId: 'zone-1',
    supervisorId: 'sup-1',
    periodKey: '2026-05-Q1',
    desde: '2026-05-01',
    hasta: '2026-05-15',
    creditos: new Decimal('0.50'),
    debitos: new Decimal('1.00'),
    carryIn: new Decimal('0.00'),
    saldo: new Decimal('-0.50'),
    disposition: 'CARRY_OVER',
    approvedByUserId: 'user-1',
    decidedAt: new Date(),
    closedAt: new Date(),
    clientRef: 'ref-abc',
    paidAt: null,
    payoutRef: null,
    divergedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAttendanceReader(records: AttendanceReaderRecord[]): jest.Mocked<AttendanceReaderPort> {
  return { findCompletedInRange: jest.fn().mockResolvedValue(records) };
}

function makePolicyRepo(policies: JornadaPolicyRecord[]): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    create: jest.fn(),
    findTimeline: jest.fn().mockResolvedValue(policies),
    findLatestBefore: jest.fn(),
    delete: jest.fn(),
    findByScope: jest.fn().mockResolvedValue([]),
    existsByOperarioZoneVigente: jest.fn().mockResolvedValue(false),
  };
}

function makeOperarioReader(operario: { id: string; supervisorId?: string; zoneId?: string } | null): jest.Mocked<OperarioReaderPort> {
  return { findById: jest.fn().mockResolvedValue(operario) };
}

function makePeriodRepo(existingPeriod: CompensationPeriodRecord | null = null): jest.Mocked<CompensationPeriodRepositoryPort> {
  return {
    findByOperarioAndPeriod: jest.fn().mockResolvedValue(existingPeriod),
    findPreviousClosed: jest.fn().mockResolvedValue(null),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findOverlappingClosed: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makePeriodRecord()),
    markPaid: jest.fn().mockResolvedValue(1),
    markDiverged: jest.fn().mockResolvedValue(undefined),
    findClosedContainingDate: jest.fn().mockResolvedValue(null),
  };
}

/** Fix 7: supervisor zone reader mock — returns zone-1 for sup-1, null otherwise. */
const makeSupervisorZoneReader = (zoneId: string = 'zone-1'): jest.Mocked<SupervisorZoneReaderPort> => ({
  findZoneIdBySupervisorId: jest.fn().mockResolvedValue(zoneId),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CloseCompensationPeriodUseCase', () => {
  const calcUseCase = new CalculatePeriodBalanceUseCase();
  const baseOperario = { id: 'O1', supervisorId: 'sup-1' }; // no zoneId — resolved via supervisor query
  const basePolicy = makePolicy('2026-01-01', 8);
  const baseAttendances = [
    makeAttendance('2026-05-01', 7.5), // +0 extra or -0.5 under
    makeAttendance('2026-05-02', 8.5), // +0.5 credit
  ];

  // ── EP-04a — Happy path: first close ────────────────────────────────────────

  it('EP-04a — first close: snapshot written with correct fields', async () => {
    const periodRepo = makePeriodRepo(null); // no existing period
    const operarioReader = makeOperarioReader(baseOperario);
    const attendanceReader = makeAttendanceReader(baseAttendances);
    const policyRepo = makePolicyRepo([basePolicy]);

    const created = makePeriodRecord({
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-user',
      clientRef: 'ref-new',
    });
    periodRepo.create.mockResolvedValue(created);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      attendanceReader,
      policyRepo,
      calcUseCase,
      operarioReader,
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-user',
      clientRef: 'ref-new',
    });

    expect(result.idempotent).toBe(false);
    expect(result.period.disposition).toBe('CARRY_OVER');
    expect(result.period.approvedByUserId).toBe('admin-user');
    expect(periodRepo.create).toHaveBeenCalledTimes(1);

    // Verify create was called with correct structure
    const createArg = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.operarioId).toBe('O1');
    expect(createArg.disposition).toBe('CARRY_OVER');
    expect(createArg.approvedByUserId).toBe('admin-user');
    expect(createArg.clientRef).toBe('ref-new');
  });

  // ── EP-04b — Idempotency: same clientRef → return existing, no write ─────────

  it('EP-04b — idempotent replay: same clientRef → returns existing period, no second create', async () => {
    const existing = makePeriodRecord({ clientRef: 'ref-existing' });
    const periodRepo = makePeriodRepo(existing);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(baseAttendances),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-user',
      clientRef: 'ref-existing', // same as stored → idempotent
    });

    expect(result.idempotent).toBe(true);
    expect(result.period.id).toBe('cp-1');
    // No write should have occurred
    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  // ── EP-04c — Different ref → CompensationPeriodAlreadyClosedError (409) ──────

  it('EP-04c — different clientRef on already-closed period → CompensationPeriodAlreadyClosedError', async () => {
    const existing = makePeriodRecord({ clientRef: 'ref-original' });
    const periodRepo = makePeriodRepo(existing);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(baseAttendances),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        disposition: 'PAYROLL_DEDUCTION',
        approvedByUserId: 'admin-user',
        clientRef: 'ref-different', // different → conflict
      }),
    ).rejects.toThrow(CompensationPeriodAlreadyClosedError);

    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  // ── EP-04c variant — absent clientRef on already-closed period → 409 ─────────

  it('EP-04c-variant — absent clientRef on already-closed period → CompensationPeriodAlreadyClosedError', async () => {
    const existing = makePeriodRecord({ clientRef: 'ref-original' });
    const periodRepo = makePeriodRepo(existing);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(baseAttendances),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        disposition: 'CARRY_OVER',
        approvedByUserId: 'admin-user',
        // no clientRef — cannot replay
      }),
    ).rejects.toThrow(CompensationPeriodAlreadyClosedError);
  });

  // ── EP-04d — Negative saldo, no disposition → DispositionRequiredError (422) ─

  it('EP-04d — negative saldo + no disposition → DispositionRequiredError', async () => {
    // 7h vs 8h policy → saldo = -1h (negative)
    const shortAttendance = [makeAttendance('2026-05-01', 7)];
    const periodRepo = makePeriodRepo(null);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(shortAttendance),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        // no disposition — required when saldo < 0
        approvedByUserId: 'admin-user',
        clientRef: 'ref-neg',
      }),
    ).rejects.toThrow(DispositionRequiredError);

    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  // ── EP-04e — Scoped operario not found → OperarioNotInScopeError (404) ───────

  it('EP-04e — operario not in scope → OperarioNotInScopeError (fail-closed)', async () => {
    const periodRepo = makePeriodRepo(null);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(null), // null = out of scope,
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'OUT-OF-SCOPE',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        disposition: 'CARRY_OVER',
        approvedByUserId: 'admin-user',
        clientRef: 'ref-oos',
      }),
    ).rejects.toThrow(OperarioNotInScopeError);

    // No DB write should occur
    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  // ── Fix 2: canonical fortnight validation ────────────────────────────────────

  it('Fix2-a — hasta beyond Q1 fortnight → NonCanonicalPeriodRangeError (422)', async () => {
    const periodRepo = makePeriodRepo(null);
    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(baseAttendances),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-01',
        hasta: '2026-05-31', // beyond Q1 canonical hasta=15
        disposition: 'CARRY_OVER',
        approvedByUserId: 'admin-user',
      }),
    ).rejects.toThrow(NonCanonicalPeriodRangeError);
    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  it('Fix2-b — desde not on day 1 or 16 → NonCanonicalPeriodRangeError (422)', async () => {
    const periodRepo = makePeriodRepo(null);
    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(baseAttendances),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-05', // not day 1 or 16
        hasta: '2026-05-15',
        disposition: 'CARRY_OVER',
        approvedByUserId: 'admin-user',
      }),
    ).rejects.toThrow(NonCanonicalPeriodRangeError);
  });

  it('Fix2-c — canonical Q1 range passes validation (2026-05-01 to 2026-05-15)', async () => {
    const periodRepo = makePeriodRepo(null);
    const created = makePeriodRecord({ disposition: null, saldo: new Decimal('1.00') });
    periodRepo.create.mockResolvedValue(created);
    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([makeAttendance('2026-05-01', 9)]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      approvedByUserId: 'admin-user',
    });
    expect(result.idempotent).toBe(false);
  });

  it('Fix2-d — canonical Q2 range passes validation (2026-05-16 to 2026-05-31)', async () => {
    const periodRepo = makePeriodRepo(null);
    const created = makePeriodRecord({
      periodKey: '2026-05-Q2',
      desde: '2026-05-16',
      hasta: '2026-05-31',
      disposition: null,
      saldo: new Decimal('1.00'),
    });
    periodRepo.create.mockResolvedValue(created);
    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([makeAttendance('2026-05-16', 9)]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-16',
      hasta: '2026-05-31',
      approvedByUserId: 'admin-user',
    });
    expect(result.idempotent).toBe(false);
  });

  // ── Fix 3: exact-prevKey carryIn ──────────────────────────────────────────────

  it('Fix3-a — Q1 closed CARRY_OVER saldo=-2, closing Q2 → carryIn = -2', async () => {
    const prevQ1 = makePeriodRecord({
      periodKey: '2026-05-Q1',
      disposition: 'CARRY_OVER',
      saldo: new Decimal('-2.00'),
      carryIn: new Decimal('0'),
    });
    const periodRepo = makePeriodRepo(null);
    // findByOperarioAndPeriod: no existing Q2; findPreviousClosed returns Q1
    periodRepo.findPreviousClosed.mockResolvedValue(prevQ1);
    // Also wire exact-key lookup: Fix3 requires exact match on prevKey
    periodRepo.findByOperarioAndPeriod
      .mockImplementation((_oid: string, key: string) =>
        Promise.resolve(key === '2026-05-Q1' ? prevQ1 : null),
      );

    const created = makePeriodRecord({
      periodKey: '2026-05-Q2',
      desde: '2026-05-16',
      hasta: '2026-05-31',
      carryIn: new Decimal('-2.00'),
      saldo: new Decimal('-2.00'),
      disposition: 'CARRY_OVER',
    });
    periodRepo.create.mockResolvedValue(created);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-16',
      hasta: '2026-05-31',
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-user',
    });

    expect(result.idempotent).toBe(false);
    const createArg = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.carryIn.toNumber()).toBe(-2);
  });

  it('Fix3-b — Q1 closed CARRY_OVER saldo=-2, Q2 NOT closed, closing Q3 → NonContiguousCloseError (409)', async () => {
    const prevQ1 = makePeriodRecord({
      periodKey: '2026-05-Q1',
      disposition: 'CARRY_OVER',
      saldo: new Decimal('-2.00'),
    });

    const periodRepo = makePeriodRepo(null);
    // No Q2 period (gap)
    periodRepo.findByOperarioAndPeriod.mockResolvedValue(null);
    // findPreviousClosed (gap-debt check) returns Q1 which has debt and is NOT the immediate predecessor of Q3
    periodRepo.findPreviousClosed.mockResolvedValue(prevQ1);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    // Closing Q2-of-June (Q1 of June's prev = Q2 of May; Q2 of May's prev = Q1 of May)
    // Simulate: closing 2026-06-Q1, prevKey = 2026-05-Q2 (gap), most-recent = Q1 CARRY_OVER
    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-06-01',
        hasta: '2026-06-15',
        disposition: 'CARRY_OVER',
        approvedByUserId: 'admin-user',
      }),
    ).rejects.toThrow(NonContiguousCloseError);
    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  it('Fix3-c — gap period has no debt (saldo >= 0), closing Q3 → no throw, carryIn = 0', async () => {
    const prevQ1NoDept = makePeriodRecord({
      periodKey: '2026-05-Q1',
      disposition: null,
      saldo: new Decimal('1.00'), // positive — no debt
    });

    const periodRepo = makePeriodRepo(null);
    periodRepo.findByOperarioAndPeriod.mockResolvedValue(null);
    periodRepo.findPreviousClosed.mockResolvedValue(prevQ1NoDept);

    const created = makePeriodRecord({
      periodKey: '2026-06-Q1',
      desde: '2026-06-01',
      hasta: '2026-06-15',
      carryIn: new Decimal('0'),
      saldo: new Decimal('1.00'),
      disposition: null,
    });
    periodRepo.create.mockResolvedValue(created);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([makeAttendance('2026-06-01', 9)]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-06-01',
      hasta: '2026-06-15',
      approvedByUserId: 'admin-user',
    });
    expect(result.idempotent).toBe(false);
    const createArg = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.carryIn.toNumber()).toBe(0);
  });

  it('Fix3-d — month-boundary prevKey: June Q1 → May Q2 (exact key lookup)', async () => {
    const mayQ2 = makePeriodRecord({
      periodKey: '2026-05-Q2',
      desde: '2026-05-16',
      hasta: '2026-05-31',
      disposition: 'CARRY_OVER',
      saldo: new Decimal('-1.50'),
      carryIn: new Decimal('0'),
    });

    const periodRepo = makePeriodRepo(null);
    periodRepo.findByOperarioAndPeriod
      .mockImplementation((_oid: string, key: string) =>
        Promise.resolve(key === '2026-05-Q2' ? mayQ2 : null),
      );
    periodRepo.findPreviousClosed.mockResolvedValue(mayQ2);

    const created = makePeriodRecord({
      periodKey: '2026-06-Q1',
      desde: '2026-06-01',
      hasta: '2026-06-15',
      carryIn: new Decimal('-1.50'),
      saldo: new Decimal('-1.50'),
      disposition: 'CARRY_OVER',
    });
    periodRepo.create.mockResolvedValue(created);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-06-01',
      hasta: '2026-06-15',
      disposition: 'CARRY_OVER',
      approvedByUserId: 'admin-user',
    });
    expect(result.idempotent).toBe(false);
    const createArg = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.carryIn.toNumber()).toBe(-1.5);
  });

  // ── Fix 10: P2002 + null existing → ClientRefConflictError ───────────────────

  it('Fix10 — P2002 with no existing period for that operario+key → ClientRefConflictError (409)', async () => {
    const periodRepo = makePeriodRepo(null);
    const p2002 = Object.assign(new Error('Unique constraint failed on clientRef'), { code: 'P2002' });
    periodRepo.create.mockRejectedValue(p2002);
    // findByOperarioAndPeriod returns null even after P2002 (cross-operario collision)
    periodRepo.findByOperarioAndPeriod.mockResolvedValue(null);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader([makeAttendance('2026-05-01', 9)]),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    await expect(
      useCase.execute({
        operarioId: 'O1',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        approvedByUserId: 'admin-user',
        clientRef: 'shared-ref',
      }),
    ).rejects.toThrow(ClientRefConflictError);
  });

  // ── Positive saldo — disposition null is OK (no deduction needed) ──────────

  it('EP-04-positive-saldo — positive saldo with no disposition → allowed (no DispositionRequiredError)', async () => {
    // 9h vs 8h policy → saldo = +1h (positive — no disposition required)
    const overAttendance = [makeAttendance('2026-05-01', 9)];
    const periodRepo = makePeriodRepo(null);
    const created = makePeriodRecord({ saldo: new Decimal('1.00'), disposition: null });
    periodRepo.create.mockResolvedValue(created);

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(overAttendance),
      makePolicyRepo([basePolicy]),
      calcUseCase,
      makeOperarioReader(baseOperario),
      makeSupervisorZoneReader(),
    );

    const result = await useCase.execute({
      operarioId: 'O1',
      desde: '2026-05-01',
      hasta: '2026-05-15',
      // no disposition — allowed when saldo >= 0
      approvedByUserId: 'admin-user',
      clientRef: 'ref-pos',
    });

    expect(result.idempotent).toBe(false);
    expect(periodRepo.create).toHaveBeenCalledTimes(1);
    // disposition passed as null
    const createArg = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.disposition).toBeNull();
  });
});
