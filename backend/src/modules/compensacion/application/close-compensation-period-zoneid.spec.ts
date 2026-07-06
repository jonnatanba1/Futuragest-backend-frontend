/**
 * RED → GREEN tests for Fix 7 — close persists real supervisor zoneId.
 *
 * Current bug: CloseCompensationPeriodUseCase resolves zoneId via
 * `operario['zoneId'] ?? ''` but zoneId is NOT a field on Operario —
 * it lives on the supervisor. Every snapshot persists zoneId='',
 * breaking COORDINADOR scope filtering.
 *
 * Fix: close use-case resolves the supervisor's zoneId via a SEPARATE query
 * (W4 rule: no scoped-relation includes). If supervisor lookup fails → throws
 * (fail loudly — no '' default).
 *
 * Covers:
 *   F7-1  — close persists the supervisor's real zoneId (not '')
 *   F7-2  — supervisor lookup returns null → throws ZoneIdResolutionError (no '' default)
 *   F7-3  — supervisorId is missing on operario → throws ZoneIdResolutionError
 */

import { Decimal } from '@prisma/client/runtime/client';
import { CloseCompensationPeriodUseCase } from './close-compensation-period.use-case';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { ZoneIdResolutionError } from '../domain/compensacion.errors';
import type { CompensationPeriodRepositoryPort } from '../domain/ports/compensation-period-repository.port';
import type { AttendanceReaderPort } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type { SupervisorZoneReaderPort } from '../domain/ports/supervisor-zone-reader.port';

/** Helper: build a minimal Operario-like object (supervisorId field, no zoneId field). */
function makeOperario(supervisorId: string): { id: string; supervisorId: string } {
  return { id: 'op-1', supervisorId };
}

/** Helper: make a minimal CompensationPeriodRepositoryPort stub. */
function makePeriodRepo(
  existing: null | { periodKey: string; clientRef: string | null } = null,
): CompensationPeriodRepositoryPort {
  const createMock = jest.fn().mockImplementation((data) =>
    Promise.resolve({
      id: 'cp-new',
      ...data,
      closedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      decidedAt: data.decidedAt ?? null,
      paidAt: null,
      payoutRef: null,
      divergedAt: null,
    }),
  );
  return {
    findByOperarioAndPeriod: jest.fn().mockResolvedValue(existing),
    findPreviousClosed: jest.fn().mockResolvedValue(null),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findOverlappingClosed: jest.fn().mockResolvedValue(null),
    create: createMock,
    markPaid: jest.fn().mockResolvedValue(1),
    markDiverged: jest.fn().mockResolvedValue(undefined),
    findClosedContainingDate: jest.fn().mockResolvedValue(null),
  };
}

function makeAttendanceReader(): jest.Mocked<AttendanceReaderPort> {
  return { findCompletedInRange: jest.fn().mockResolvedValue([]) };
}

function makePolicyRepo(): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    findTimeline: jest.fn().mockResolvedValue([
      {
        id: 'pol-1',
        horasDiarias: new Decimal('8'),
        vigenteDesde: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date(),
      },
    ]),
    create: jest.fn(),
    findLatestBefore: jest.fn(),
    delete: jest.fn(),
    findByScope: jest.fn().mockResolvedValue([]),
    existsByOperarioZoneVigente: jest.fn().mockResolvedValue(false),
  };
}

function makeCalcUseCase(): Pick<CalculatePeriodBalanceUseCase, 'execute'> {
  return {
    execute: jest.fn().mockResolvedValue({
      creditos: new Decimal('0'),
      debitos: new Decimal('0'),
      carryIn: new Decimal('0'),
      saldo: new Decimal('0'),
      perDay: [],
    }),
  };
}

describe('CloseCompensationPeriodUseCase — zoneId resolution (Fix 7)', () => {
  const DESDE = '2026-06-01';
  const HASTA = '2026-06-15';

  beforeEach(() => jest.clearAllMocks());

  // ── F7-1: real zoneId persisted ────────────────────────────────────────────

  it('F7-1 — persists the supervisor real zoneId (not empty string)', async () => {
    const periodRepo = makePeriodRepo();
    const operarioReader = {
      findById: jest.fn().mockResolvedValue(makeOperario('sup-1')),
    };
    const supervisorZoneReader: SupervisorZoneReaderPort = {
      findZoneIdBySupervisorId: jest.fn().mockResolvedValue('zone-urabá'),
    };

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(),
      makePolicyRepo(),
      makeCalcUseCase() as unknown as CalculatePeriodBalanceUseCase,
      operarioReader as jest.Mocked<OperarioReaderPort>,
      supervisorZoneReader,
    );

    await useCase.execute({
      operarioId: 'op-1',
      desde: DESDE,
      hasta: HASTA,
      disposition: null,
      approvedByUserId: 'hr-user',
      clientRef: null,
    });

    const createCall = (periodRepo.create as jest.Mock).mock.calls[0][0];
    expect(createCall.zoneId).toBe('zone-urabá');
    expect(createCall.zoneId).not.toBe('');
  });

  // ── F7-2: supervisor lookup returns null → throws, no '' fallback ──────────

  it('F7-2 — supervisor zoneId lookup returns null → throws ZoneIdResolutionError', async () => {
    const periodRepo = makePeriodRepo();
    const operarioReader = {
      findById: jest.fn().mockResolvedValue(makeOperario('sup-1')),
    };
    const supervisorZoneReader: SupervisorZoneReaderPort = {
      findZoneIdBySupervisorId: jest.fn().mockResolvedValue(null),
    };

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(),
      makePolicyRepo(),
      makeCalcUseCase() as unknown as CalculatePeriodBalanceUseCase,
      operarioReader as jest.Mocked<OperarioReaderPort>,
      supervisorZoneReader,
    );

    await expect(
      useCase.execute({
        operarioId: 'op-1',
        desde: DESDE,
        hasta: HASTA,
        disposition: null,
        approvedByUserId: 'hr-user',
        clientRef: null,
      }),
    ).rejects.toBeInstanceOf(ZoneIdResolutionError);

    // Verify create was NOT called (abort before write)
    expect(periodRepo.create).not.toHaveBeenCalled();
  });

  // ── F7-3: supervisorId missing on operario → throws ────────────────────────

  it('F7-3 — operario without supervisorId → throws ZoneIdResolutionError', async () => {
    const periodRepo = makePeriodRepo();
    const operarioReader = {
      // operario has no supervisorId field
      findById: jest.fn().mockResolvedValue({ id: 'op-1' }),
    };
    const supervisorZoneReader: SupervisorZoneReaderPort = {
      findZoneIdBySupervisorId: jest.fn(),
    };

    const useCase = new CloseCompensationPeriodUseCase(
      periodRepo,
      makeAttendanceReader(),
      makePolicyRepo(),
      makeCalcUseCase() as unknown as CalculatePeriodBalanceUseCase,
      operarioReader as jest.Mocked<OperarioReaderPort>,
      supervisorZoneReader,
    );

    await expect(
      useCase.execute({
        operarioId: 'op-1',
        desde: DESDE,
        hasta: HASTA,
        disposition: null,
        approvedByUserId: 'hr-user',
        clientRef: null,
      }),
    ).rejects.toBeInstanceOf(ZoneIdResolutionError);

    expect(supervisorZoneReader.findZoneIdBySupervisorId).not.toHaveBeenCalled();
  });
});
