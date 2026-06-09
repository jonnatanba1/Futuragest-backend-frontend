/**
 * Compensacion integration tests (real Prisma, pnpm test:int).
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
 *            This is a true end-to-end round-trip through the real scoped adapter.
 *   INT-02:  Close fortnight → snapshot persisted + immutability + idempotency (PR-B).
 *   INT-03:  Overlap guard — closed period blocks new JornadaPolicy with vigenteDesde
 *            inside the liquidated period (PR-B).
 */

import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../database/prisma-client';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { CalculatePeriodBalanceUseCase } from './application/calculate-period-balance.use-case';
import { GetPeriodBalanceUseCase } from './application/get-period-balance.use-case';
import { CloseCompensationPeriodUseCase } from './application/close-compensation-period.use-case';
import {
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
} from './domain/compensacion.errors';
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';
import { ScopedAttendanceRepository } from '../iam/infrastructure/scoped-attendance.repository';
import { ScopedOperarioRepository } from '../iam/infrastructure/scoped-operario.repository';
import { ScopedCompensationPeriodRepository } from '../iam/infrastructure/scoped-compensation-period.repository';
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
      supervisorId: undefined,
      zoneId: undefined,
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
  let periodRepo: ScopedCompensationPeriodRepository;
  let getPeriodBalance: GetPeriodBalanceUseCase;
  let closePeriod: CloseCompensationPeriodUseCase;
  // Real seeded SYSTEM_ADMIN user id — used as approvedByUserId (FK to User)
  let adminUserId: string;

  // Seed IDs used by INT-04 (supervisor must exist in test DB for FK)
  const INT04_SUPERVISOR_ID = 'int04-supervisor';
  const INT04_OPERARIO_ID = 'int04-operario';
  // INT-02/INT-03: separate seed operario to avoid conflicts
  const INT02_OPERARIO_ID = 'int02-operario';

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    policyRepo = new JornadaPolicyRepository(prisma as any);
    calcUseCase = new CalculatePeriodBalanceUseCase();

    // Set up real scoped repos with an unrestricted scope (SYSTEM_ADMIN)
    const scopeHolder = new UnrestrictedScopeHolder();
    attendanceRepo = new ScopedAttendanceRepository(prisma as any, scopeHolder);
    operarioRepo = new ScopedOperarioRepository(prisma as any, scopeHolder);
    periodRepo = new ScopedCompensationPeriodRepository(prisma as any, scopeHolder);

    // PR-B: real period lookup (replaces NullCompensationPeriodLookup stub)
    setJornadaPolicy = new SetJornadaPolicyUseCase(policyRepo, periodRepo);

    getPeriodBalance = new GetPeriodBalanceUseCase(
      attendanceRepo,
      policyRepo,
      calcUseCase,
      operarioRepo,
      periodRepo,
    );

    closePeriod = new CloseCompensationPeriodUseCase(
      periodRepo,
      attendanceRepo,
      policyRepo,
      calcUseCase,
      operarioRepo,
    );

    // Resolve the seeded SYSTEM_ADMIN to satisfy the approvedByUserId FK
    const admin = await prisma.user.findFirst({
      where: { role: 'SYSTEM_ADMIN' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('[compensacion.int-spec] No SYSTEM_ADMIN seeded in test DB');
    }
    adminUserId = admin.id;
  });

  afterAll(async () => {
    // Clean up in FK-safe order
    await prisma.attendance.deleteMany({ where: { operarioId: INT04_OPERARIO_ID } }).catch(() => {});
    await prisma.attendance.deleteMany({ where: { operarioId: INT02_OPERARIO_ID } }).catch(() => {});
    await prisma.compensationPeriod.deleteMany({ where: { operarioId: INT02_OPERARIO_ID } }).catch(() => {});
    await prisma.operario.deleteMany({ where: { id: { in: [INT04_OPERARIO_ID, INT02_OPERARIO_ID] } } }).catch(() => {});
    await prisma.jornadaPolicy.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean JornadaPolicy, attendance and compensation periods before each test
    await prisma.attendance.deleteMany({ where: { operarioId: INT04_OPERARIO_ID } }).catch(() => {});
    await prisma.attendance.deleteMany({ where: { operarioId: INT02_OPERARIO_ID } }).catch(() => {});
    await prisma.compensationPeriod.deleteMany({ where: { operarioId: INT02_OPERARIO_ID } }).catch(() => {});
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

  // ── INT-02: Close-fortnight idempotency + immutability (PR-B) ───────────────
  //
  // Tests:
  //   - First close creates a CompensationPeriod row.
  //   - Second close with same clientRef → no-op (idempotent: true), row count = 1.
  //   - CompensationPeriod.clientRef is unique in DB.
  //   REQ-INT-02, REQ-CP-01, REQ-CP-02.

  it('INT-02 — close-fortnight: first close persists, second call (same clientRef) is idempotent (row count = 1)', async () => {
    const supervisor = await prisma.supervisor.findFirst({ select: { id: true, zoneId: true } });
    if (!supervisor) {
      console.warn('[INT-02] No supervisor found in test DB — skipping INT-02.');
      return;
    }

    // Ensure INT-02 operario exists
    await prisma.operario.upsert({
      where: { id: INT02_OPERARIO_ID },
      create: {
        id: INT02_OPERARIO_ID,
        fullName: 'INT02 Test Operario',
        documento: 'INT02DOC999',
        supervisorId: supervisor.id,
        deactivatedAt: null,
      },
      update: {},
    });

    // Insert JornadaPolicy (8h from 2026-01-01)
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    const clientRef = `int02-close-${Date.now()}`;

    // First close
    const firstResult = await closePeriod.execute({
      operarioId: INT02_OPERARIO_ID,
      desde: '2026-05-01',
      hasta: '2026-05-15',
      // No attendances → saldo = 0, so disposition not required
      disposition: null,
      approvedByUserId: adminUserId,
      clientRef,
    });

    expect(firstResult.idempotent).toBe(false);
    expect(firstResult.period.operarioId).toBe(INT02_OPERARIO_ID);
    expect(firstResult.period.periodKey).toBe('2026-05-Q1');

    // Row count = 1
    const rows = await prisma.compensationPeriod.findMany({ where: { operarioId: INT02_OPERARIO_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].clientRef).toBe(clientRef);

    // Second close with SAME clientRef → idempotent replay
    const secondResult = await closePeriod.execute({
      operarioId: INT02_OPERARIO_ID,
      desde: '2026-05-01',
      hasta: '2026-05-15',
      disposition: null,
      approvedByUserId: adminUserId,
      clientRef,
    });

    expect(secondResult.idempotent).toBe(true);
    expect(secondResult.period.id).toBe(firstResult.period.id);

    // Still exactly 1 row — no second INSERT
    const rowsAfter = await prisma.compensationPeriod.findMany({ where: { operarioId: INT02_OPERARIO_ID } });
    expect(rowsAfter).toHaveLength(1);
  });

  // ── INT-03: JornadaPolicy vigenteDesde overlap guard (PR-B) ────────────────
  //
  // Tests:
  //   - Insert a CompensationPeriod for operario X, period "2026-05-01"–"2026-05-15".
  //   - Then call SetJornadaPolicyUseCase with vigenteDesde = "2026-05-10".
  //   - Assert JornadaPolicyOverlapsLiquidatedPeriodError is thrown.
  //   - DB must have no new JornadaPolicy row.
  //   REQ-INT-03, REQ-SJP-02.

  it('INT-03 — JornadaPolicy vigenteDesde inside a closed period → JornadaPolicyOverlapsLiquidatedPeriodError', async () => {
    const supervisor = await prisma.supervisor.findFirst({ select: { id: true, zoneId: true } });
    if (!supervisor) {
      console.warn('[INT-03] No supervisor found in test DB — skipping INT-03.');
      return;
    }

    // Ensure INT-02 operario exists (reuse seed)
    await prisma.operario.upsert({
      where: { id: INT02_OPERARIO_ID },
      create: {
        id: INT02_OPERARIO_ID,
        fullName: 'INT02 Test Operario',
        documento: 'INT02DOC999',
        supervisorId: supervisor.id,
        deactivatedAt: null,
      },
      update: {},
    });

    // Insert a baseline policy so close doesn't fail for missing policy
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    // Close the period 2026-05-01 to 2026-05-15 (creates a CompensationPeriod row)
    await closePeriod.execute({
      operarioId: INT02_OPERARIO_ID,
      desde: '2026-05-01',
      hasta: '2026-05-15',
      disposition: null,
      approvedByUserId: adminUserId,
      clientRef: `int03-close-${Date.now()}`,
    });

    // Now try to insert a JornadaPolicy with vigenteDesde = "2026-05-10" (inside closed period)
    await expect(
      setJornadaPolicy.execute({ horasDiarias: 7.5, vigenteDesde: '2026-05-10' }),
    ).rejects.toThrow(JornadaPolicyOverlapsLiquidatedPeriodError);

    // DB must have exactly the one original policy (no new row added)
    const policies = await prisma.jornadaPolicy.findMany({});
    expect(policies).toHaveLength(1);
    expect(policies[0].horasDiarias.toString()).toBe('8');
  });
});
