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
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { AttendanceReaderPort, AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type {
  CompensationPeriodRepositoryPort,
  CompensationPeriodRecord,
} from '../domain/ports/compensation-period-repository.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(dateStr: string, hours: number): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}`,
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
    findOverlappingLiquidated: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makePeriodRecord()),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CloseCompensationPeriodUseCase', () => {
  const calcUseCase = new CalculatePeriodBalanceUseCase();
  const baseOperario = { id: 'O1', supervisorId: 'sup-1', zoneId: 'zone-1' };
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
      makeOperarioReader(null), // null = out of scope
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
