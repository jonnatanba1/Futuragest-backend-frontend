/**
 * JornadaPolicy scope-aware integration tests (real Prisma, pnpm test:int).
 *
 * Companion to compensacion.int-spec.ts — focuses on the R1.4/R1.5 scenarios:
 *
 *   INT-SCOPE-1 (scoped duplicate — R1.4):
 *     POST /jornada-policy { zoneId: "zA", vigenteDesde: "2026-08-01" } → 201
 *     POST /jornada-policy { zoneId: "zB", vigenteDesde: "2026-08-01" } → 201
 *       (different zone, same date — NOT a duplicate)
 *     POST /jornada-policy { zoneId: "zA", vigenteDesde: "2026-08-01" } → 409
 *       POLICY_DUPLICATE_DATE with enriched scope message mentioning "zona zA"
 *
 *   INT-SCOPE-2 (GET filter E2E — R1.5):
 *     Seed: global policy + per-zone zA policy + per-zone zB policy.
 *     GET ?zoneId=zA            → only the zA row
 *     GET ?zoneId= (empty/null) → only the global row
 *     GET (no params)           → all three rows
 *
 * Requires a running PostgreSQL instance (DATABASE_URL in backend/.env.test).
 * Run with: cd backend && pnpm test:int -- jornada-policy-scope
 *
 * If no DB is reachable, the jest "integration" project globalSetup
 * (src/database/jest-global-setup.ts → prisma migrate deploy) will fail and
 * the suite will not start. In that case this file remains a committed RED test
 * pending a Postgres-backed environment (CI). Per PR-2 batch decision, the
 * int-spec is written but NOT executed locally — see apply-progress notes.
 *
 * HTTP query-string → controller argument translation is covered by the
 * controller unit spec (T5). This int-spec focuses on the real DB round-trip
 * through CompensacionController → GetJornadaPolicyTimelineUseCase →
 * JornadaPolicyRepository.findByScope → Prisma, plus the controller's domain
 * error → HTTP 409 mapping for scoped duplicates.
 */

import { HttpStatus } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../database/prisma-client';
import type { PrismaService } from '../../database/prisma.service';
import { CompensacionController } from './interface/compensacion.controller';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { GetJornadaPolicyTimelineUseCase } from './application/get-jornada-policy-timeline.use-case';
import { JornadaPolicyDuplicateEffectiveDateError } from './domain/compensacion.errors';
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';
import { ScopedCompensationPeriodRepository } from '../iam/infrastructure/scoped-compensation-period.repository';
import { ScopeContextHolder } from '../auth/domain/scope-context';

/**
 * Minimal unrestricted scope (SYSTEM_ADMIN) — same approach as
 * compensacion.int-spec.ts. Let's the scoped CompensationPeriod repository
 * skip zone filtering in the integration test.
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

const SCOPE_DATE = '2026-08-01';
const ZONE_A = 'd1cd3413-9f15-4489-9ed1-fec7916ea02c';
const ZONE_B = '1daa13bd-7002-45a8-a207-4fee6c8ac933';

describe('JornadaPolicy scope-aware integration (real Prisma)', () => {
  let prisma: PrismaClient;
  let controller: CompensacionController;
  let policyRepo: JornadaPolicyRepository;
  let setJornadaPolicy: SetJornadaPolicyUseCase;
  let getTimeline: GetJornadaPolicyTimelineUseCase;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();

    policyRepo = new JornadaPolicyRepository(prisma as unknown as PrismaService);

    // Real CompensationPeriod lookup so SetJornadaPolicyUseCase's overlap guard
    // talks to the DB (matches compensacion.int-spec wiring). Unrestricted scope.
    const scopeHolder = new UnrestrictedScopeHolder();
    const periodRepo = new ScopedCompensationPeriodRepository(
      prisma as unknown as PrismaService,
      scopeHolder,
    );

    setJornadaPolicy = new SetJornadaPolicyUseCase(policyRepo, periodRepo);
    getTimeline = new GetJornadaPolicyTimelineUseCase(policyRepo);

    // Controller wiring: real use-cases for the paths under test (setJornadaPolicy
    // and getJornadaPolicyTimeline), real policyRepo (DELETE/insert), and stubs
    // for the unrelated use-cases (balance / close / payout). The stubs are never
    // exercised by INT-SCOPE-1/2 and throw if reached — surface for mis-wiring.
    const notUsed = { execute: (() => { throw new Error('not used by jornada-policy-scope int-spec'); }) } as never;
    controller = new CompensacionController(
      notUsed,                 // getBalanceUseCase
      setJornadaPolicy as never,   // setJornadaPolicyUseCase (real)
      getTimeline as never,        // getTimelineUseCase (real)
      policyRepo as never,         // policyRepo (real — used by DELETE if exercised)
      notUsed,                 // closeUseCase
      notUsed,                 // payoutUseCase
      notUsed,                 // confirmPayoutUseCase
    );
  });

  afterAll(async () => {
    // Only JornadaPolicy rows are written by this suite — clean them up.
    await prisma.jornadaPolicy.deleteMany({
      where: { zoneId: { in: [ZONE_A, ZONE_B] } },
    }).catch(() => {});
    // Also remove rows whose zoneId is the int-scope sentinel for "global seed".
    await prisma.jornadaPolicy.deleteMany({
      where: { operarioId: null, zoneId: null, vigenteDesde: new Date(`${SCOPE_DATE}T00:00:00Z`) },
    }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Start each test from a clean JornadaPolicy table for the scope sentinels.
    await prisma.jornadaPolicy.deleteMany({
      where: { zoneId: { in: [ZONE_A, ZONE_B] } },
    }).catch(() => {});
    await prisma.jornadaPolicy.deleteMany({
      where: { operarioId: null, zoneId: null, vigenteDesde: new Date(`${SCOPE_DATE}T00:00:00Z`) },
    }).catch(() => {});
  });

  // ── INT-SCOPE-1: per-zone duplicate detection (R1.4) ──────────────────────────

  it('INT-SCOPE-1 — per-zone duplicate on same date for same zone → 409 POLICY_DUPLICATE_DATE with enriched scope', async () => {
    const baseBody = {
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: 8,
      horasSemanales: 40,
      vigenteDesde: SCOPE_DATE,
    };

    const res = { status: jest.fn().mockReturnThis() } as never;

    // 1) zone A on date X → 201 (created)
    await controller.setJornadaPolicy({ ...baseBody, zoneId: ZONE_A }, res);

    // 2) zone B on date X → 201 (different zone, NOT a duplicate)
    await controller.setJornadaPolicy({ ...baseBody, zoneId: ZONE_B }, res);

    // 3) zone A on date X again → 409 with enriched message mentioning "zona zA"
    await expect(
      controller.setJornadaPolicy({ ...baseBody, zoneId: ZONE_A }, res),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    // Verify the error code + enriched message via the underlying domain error
    // (the controller wraps it as ConflictException with the same message).
    // Drive a fresh call through the use case to assert the domain error shape.
    await expect(
      setJornadaPolicy.execute({ ...baseBody, zoneId: ZONE_A }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    // DB must hold exactly 2 rows (zoneA + zoneB), NOT 3 (the duplicate was rejected)
    const rows = await prisma.jornadaPolicy.findMany({
      where: { vigenteDesde: new Date(`${SCOPE_DATE}T00:00:00Z`) },
    });
    expect(rows).toHaveLength(2);
    const zones = rows.map((r) => r.zoneId).sort();
    expect(zones).toEqual([ZONE_A, ZONE_B].sort());

    // Enriched-scope assertion: the duplicate error message mentions the zone.
    // We re-throw to capture the message (the use case throws the domain error
    // BEFORE the controller wraps it; controller wrapper reuses the same string).
    let capturedMessage = '';
    try {
      await setJornadaPolicy.execute({ ...baseBody, zoneId: ZONE_A });
    } catch (e) {
      capturedMessage = (e as JornadaPolicyDuplicateEffectiveDateError).message;
    }
    expect(capturedMessage).toContain(`zona ${ZONE_A}`);
    expect(capturedMessage.toLowerCase()).toContain('existe');
  });

  // ── INT-SCOPE-2: GET filter end-to-end (R1.5) ────────────────────────────────

  it('INT-SCOPE-2 — GET ?zoneId filter returns scoped rows; empty zoneId returns global; no params returns all', async () => {
    // Seed: one global + one zA + one zB, all on the same date for predictability.
    const baseBody = {
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: 8,
      horasSemanales: 40,
      vigenteDesde: SCOPE_DATE,
    };
    const res = { status: jest.fn().mockReturnThis() } as never;

    await controller.setJornadaPolicy({ ...baseBody, zoneId: null }, res); // global
    await controller.setJornadaPolicy({ ...baseBody, zoneId: ZONE_A }, res);
    await controller.setJornadaPolicy({ ...baseBody, zoneId: ZONE_B }, res);

    // (a) ?zoneId=zA → only the zA row
    const zoneAResult = await controller.getJornadaPolicyTimeline(ZONE_A, undefined);
    expect(zoneAResult).toHaveLength(1);
    expect(zoneAResult[0].zoneId).toBe(ZONE_A);

    // (b) ?zoneId= (empty string, controller normalizes to null) → global-only
    const globalResult = await controller.getJornadaPolicyTimeline('', undefined);
    expect(globalResult).toHaveLength(1);
    expect(globalResult[0].zoneId).toBeNull();
    expect(globalResult[0].operarioId).toBeNull();

    // (c) no params → all three rows
    const allResult = await controller.getJornadaPolicyTimeline(undefined, undefined);
    expect(allResult).toHaveLength(3);
    const allZones = allResult.map((r) => r.zoneId).sort();
    expect(allZones).toEqual([null, ZONE_A, ZONE_B].sort());

    // (d) ?zoneId=zB → only the zB row (triangulation — a DIFFERENT zone)
    const zoneBResult = await controller.getJornadaPolicyTimeline(ZONE_B, undefined);
    expect(zoneBResult).toHaveLength(1);
    expect(zoneBResult[0].zoneId).toBe(ZONE_B);
  });
});