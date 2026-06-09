/**
 * A9.1 — Compensacion integration tests (real Prisma, pnpm test:int).
 *
 * Requires a running PostgreSQL instance (see backend/.env.test).
 * Run with: cd backend && pnpm test:int
 *
 * Covers:
 *   INT-01: Insert JornadaPolicy; assert row in DB; duplicate vigenteDesde → DuplicateEffectiveDateError.
 *   INT-04: Insert policy + 2 attendances (7h, 9h, vs 8h policy) → GET balance saldo = 0.
 *
 * INT-02 and INT-03 are PR-B (require CompensationPeriod table).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { CalculatePeriodBalanceUseCase } from './application/calculate-period-balance.use-case';
import { JornadaPolicyDuplicateEffectiveDateError } from './domain/compensacion.errors';
import { NullCompensationPeriodLookup } from './domain/ports/compensation-period-lookup.port';
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';
import type { AttendanceReaderRecord } from './domain/ports/attendance-reader.port';
import { Decimal } from '@prisma/client/runtime/client';

// ─── NOTE ────────────────────────────────────────────────────────────────────
// These tests require a real Postgres connection (DATABASE_URL in .env.test).
// They are in the "int" jest project (pnpm test:int). If no DB is available,
// skip will be triggered via the jest timeout / connection failure.
// ─────────────────────────────────────────────────────────────────────────────

describe('Compensacion integration (real Prisma)', () => {
  let prisma: PrismaClient;
  let policyRepo: JornadaPolicyRepository;
  let setJornadaPolicy: SetJornadaPolicyUseCase;
  let calcUseCase: CalculatePeriodBalanceUseCase;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    policyRepo = new JornadaPolicyRepository(prisma as any);
    const periodLookup = new NullCompensationPeriodLookup();
    setJornadaPolicy = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    calcUseCase = new CalculatePeriodBalanceUseCase();
  });

  afterAll(async () => {
    await prisma.jornadaPolicy.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean JornadaPolicy table before each test
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

  // ── INT-04: Full balance round-trip (pure use-case, policy from DB) ─────────

  it('INT-04 — 7h + 9h vs 8h policy → saldo = 0', async () => {
    // Insert a JornadaPolicy in the DB
    await setJornadaPolicy.execute({ horasDiarias: 8, vigenteDesde: '2026-01-01' });

    // Fetch the timeline from the DB
    const timeline = await policyRepo.findTimeline();

    // Build mock attendance records (7h and 9h shifts)
    const attendances: AttendanceReaderRecord[] = [
      {
        id: 'att-1',
        operarioId: 'O1',
        date: '2026-05-01',
        checkInCapturedAt: new Date('2026-05-01T07:00:00Z'),
        checkOutCapturedAt: new Date('2026-05-01T14:00:00Z'), // 7h
        completedAt: new Date('2026-05-01T14:00:00Z'),
      },
      {
        id: 'att-2',
        operarioId: 'O1',
        date: '2026-05-02',
        checkInCapturedAt: new Date('2026-05-02T07:00:00Z'),
        checkOutCapturedAt: new Date('2026-05-02T16:00:00Z'), // 9h
        completedAt: new Date('2026-05-02T16:00:00Z'),
      },
    ];

    const balance = calcUseCase.execute({ attendances, policyTimeline: timeline });

    expect(balance.saldo.toNumber()).toBe(0); // -1 + 1 = 0
    expect(balance.creditos.toNumber()).toBe(1);
    expect(balance.debitos.toNumber()).toBe(1);
  });
});
