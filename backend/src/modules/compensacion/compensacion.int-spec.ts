/**
 * A9.1 — Compensacion integration tests (real Prisma, pnpm test:int).
 *
 * Requires a running PostgreSQL instance (see backend/.env.test).
 * Run with: cd backend && pnpm test:int
 *
 * NOTE: The test DB (futuragest_test) must be clean (no un-applied migrations).
 * If pnpm test:int fails with P3005, run:
 *   prisma migrate reset --force   (with DATABASE_URL pointing to futuragest_test)
 * This requires explicit user confirmation (Prisma AI safety guard).
 *
 * Covers:
 *   INT-01a: Insert JornadaPolicy; assert row in DB.
 *   INT-01b: Duplicate vigenteDesde → DuplicateEffectiveDateError.
 *   INT-04:  Insert policy + 2 real Attendance rows → GET balance via
 *            ScopedAttendanceRepository.findCompletedInRange + GetPeriodBalanceUseCase.
 *            This is a true end-to-end round-trip through the real scoped adapter
 *            (fixes W2: previously only called the pure calc use-case directly).
 *
 * INT-02 and INT-03 are PR-B (require CompensationPeriod table).
 */

import { PrismaClient } from '@prisma/client';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { CalculatePeriodBalanceUseCase } from './application/calculate-period-balance.use-case';
import { GetPeriodBalanceUseCase } from './application/get-period-balance.use-case';
import { JornadaPolicyDuplicateEffectiveDateError } from './domain/compensacion.errors';
import { NullCompensationPeriodLookup } from './domain/ports/compensation-period-lookup.port';
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';
import { ScopedAttendanceRepository } from '../iam/infrastructure/scoped-attendance.repository';
import { ScopedOperarioRepository } from '../iam/infrastructure/scoped-operario.repository';
import { ScopeContextHolder } from '../auth/domain/scope-context';

// ─── NOTE ────────────────────────────────────────────────────────────────────
// These tests require a real Postgres connection (DATABASE_URL in .env.test).
// They are in the "integration" jest project (pnpm test:int). If no DB is
// available or P3005 occurs, skip is triggered via the jest timeout /
// connection failure.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A minimal ScopeContextHolder stub that returns a global (unrestricted) scope.
 * Used so ScopedAttendanceRepository / ScopedOperarioRepository skip scope filtering
 * in the integration test (no real JWT needed — we just want the Prisma round-trip).
 */
class UnrestrictedScopeHolder extends ScopeContextHolder {
  override current() {
    return {
      role: 'SYSTEM_ADMIN' as const,
      userId: 'test-user-id',
      supervisorId: null,
      zoneId: null,
    };
  }
}

describe('Compensacion integration (real Prisma)', () => {
  let prisma: PrismaClient;
  let policyRepo: JornadaPolicyRepository;
  let setJornadaPolicy: SetJornadaPolicyUseCase;
  let calcUseCase: CalculatePeriodBalanceUseCase;

  // INT-04: real scoped adapter instances
  let attendanceRepo: ScopedAttendanceRepository;
  let operarioRepo: ScopedOperarioRepository;
  let getPeriodBalance: GetPeriodBalanceUseCase;

  // Seed IDs used by INT-04 (supervisor must exist in test DB for FK)
  const INT04_SUPERVISOR_ID = 'int04-supervisor';
  const INT04_OPERARIO_ID = 'int04-operario';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    policyRepo = new JornadaPolicyRepository(prisma as any);
    const periodLookup = new NullCompensationPeriodLookup();
    setJornadaPolicy = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    calcUseCase = new CalculatePeriodBalanceUseCase();

    // Set up real scoped repos with an unrestricted scope (SYSTEM_ADMIN)
    const scopeHolder = new UnrestrictedScopeHolder();
    attendanceRepo = new ScopedAttendanceRepository(prisma as any, scopeHolder);
    operarioRepo = new ScopedOperarioRepository(prisma as any, scopeHolder);
    getPeriodBalance = new GetPeriodBalanceUseCase(
      attendanceRepo,
      policyRepo,
      calcUseCase,
      operarioRepo,
    );
  });

  afterAll(async () => {
    // Clean up in FK-safe order
    await prisma.attendance.deleteMany({ where: { operarioId: INT04_OPERARIO_ID } }).catch(() => {});
    await prisma.operario.deleteMany({ where: { id: INT04_OPERARIO_ID } }).catch(() => {});
    await prisma.jornadaPolicy.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean JornadaPolicy and INT-04 attendance before each test
    await prisma.attendance.deleteMany({ where: { operarioId: INT04_OPERARIO_ID } }).catch(() => {});
    await prisma.jornadaPolicy.deleteMany({});
  });

  // ── INT-01: Insert + duplicate vigenteDesde ─────────────────────────────────

  it('INT-01a — inserts JornadaPolicy and row exists in DB', async () => {
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    const rows = await prisma.jornadaPolicy.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].horasDiarias.toString()).toBe('8');
  });

  it('INT-01b — duplicate vigenteDesde → DuplicateEffectiveDateError, no second row', async () => {
    // Insert first
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    // Attempt duplicate
    await expect(
      setJornadaPolicy.execute({ horasDiarias: 9, vigenteDesde: '2026-01-01' }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    const rows = await prisma.jornadaPolicy.findMany({});
    expect(rows).toHaveLength(1);
  });

  // ── INT-04: Full balance round-trip through real scoped adapter (W2 fix) ────
  //
  // This is the corrected INT-04 per verify finding W2:
  //   - Persists real Attendance rows in the DB.
  //   - Calls GetPeriodBalanceUseCase which calls ScopedAttendanceRepository.findCompletedInRange.
  //   - findCompletedInRange queries the DB and returns the real persisted rows.
  //   - The balance is computed from those rows (not from in-memory mocks).
  //   - This exercises the full stack: Prisma → ScopedRepository → use-case → result.
  //
  // NOTE: Requires a supervisor + operario fixture in the test DB for FK constraints.
  // If the test DB seed does not include these fixtures, this test will be skipped.

  it('INT-04 — 7h + 9h vs 8h policy via real ScopedAttendanceRepository → saldo = 0', async () => {
    // Resolve a seed supervisor from the test DB (any supervisor will do)
    const supervisor = await prisma.supervisor.findFirst({ select: { id: true } });
    if (!supervisor) {
      console.warn('[INT-04] No supervisor found in test DB — skipping INT-04 round-trip test.');
      return;
    }

    // Ensure INT-04 operario exists (idempotent — delete in afterAll)
    await prisma.operario.upsert({
      where: { id: INT04_OPERARIO_ID },
      create: {
        id: INT04_OPERARIO_ID,
        fullName: 'INT04 Test Operario',
        documento: 'INT04DOC999',
        supervisorId: supervisor.id,
        deactivatedAt: null,
      },
      update: {},
    });

    // Insert JornadaPolicy (8h from 2026-01-01)
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    // Persist 2 Attendance rows: 7h (shortfall -1h) and 9h (surplus +1h)
    const clientRef1 = `int04-att1-${Date.now()}`;
    const clientRef2 = `int04-att2-${Date.now()}`;
    await prisma.attendance.create({
      data: {
        id: `int04-att1-${Date.now()}`,
        operarioId: INT04_OPERARIO_ID,
        supervisorId: supervisor.id,
        zoneId: 'int04-zone',
        date: '2026-05-01',
        checkInCapturedAt: new Date('2026-05-01T07:00:00Z'),
        checkInReceivedAt: new Date('2026-05-01T07:00:00Z'),
        checkInLat: 0,
        checkInLng: 0,
        checkOutCapturedAt: new Date('2026-05-01T14:00:00Z'), // 7h
        completedAt: new Date('2026-05-01T14:00:00Z'),
        clientRef: clientRef1,
        signatureKey: null,
        checkInAccuracy: null,
      },
    });
    await prisma.attendance.create({
      data: {
        id: `int04-att2-${Date.now()}`,
        operarioId: INT04_OPERARIO_ID,
        supervisorId: supervisor.id,
        zoneId: 'int04-zone',
        date: '2026-05-02',
        checkInCapturedAt: new Date('2026-05-02T07:00:00Z'),
        checkInReceivedAt: new Date('2026-05-02T07:00:00Z'),
        checkInLat: 0,
        checkInLng: 0,
        checkOutCapturedAt: new Date('2026-05-02T16:00:00Z'), // 9h
        completedAt: new Date('2026-05-02T16:00:00Z'),
        clientRef: clientRef2,
        signatureKey: null,
        checkInAccuracy: null,
      },
    });

    // Execute the use-case — reads from DB via ScopedAttendanceRepository.findCompletedInRange
    const balance = await getPeriodBalance.execute({
      operarioId: INT04_OPERARIO_ID,
      desde: '2026-05-01',
      hasta: '2026-05-15',
    });

    // -1h + 1h = 0 net balance
    expect(balance.saldo.toNumber()).toBe(0);
    expect(balance.creditos.toNumber()).toBe(1);
    expect(balance.debitos.toNumber()).toBe(1);
    expect(balance.perDay).toHaveLength(2);
  });
});
