/**
 * A4.1 RED → A4.2 GREEN: SetJornadaPolicyUseCase unit spec.
 *
 * SJP-01a, SJP-01b, SJP-02a/b/c, SJP-03, SJP-04a/b/c.
 * Mock CompensationPeriodRepositoryPort returns null (no liquidated periods) in PR-A.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { SetJornadaPolicyUseCase } from './set-jornada-policy.use-case';
import {
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyInvalidHorasError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
} from '../domain/compensacion.errors';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { CompensationPeriodLookupPort } from '../domain/ports/compensation-period-lookup.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(vigenteDesdeStr: string, horasDiarias = 8): JornadaPolicyRecord {
  return {
    id: `pol-${vigenteDesdeStr}`,
    horasDiarias: new Decimal(horasDiarias),
    vigenteDesde: new Date(`${vigenteDesdeStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makePolicyRepo(
  timeline: JornadaPolicyRecord[] = [],
): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    create: jest.fn().mockResolvedValue(makePolicy('2026-07-01')),
    findTimeline: jest.fn().mockResolvedValue(timeline),
    findLatestBefore: jest.fn().mockResolvedValue(null),
  };
}

/** Stub CompensationPeriodLookupPort — returns null (no liquidated periods) for PR-A. */
function makePeriodLookupPort(
  overlapping: { desde: Date; hasta: Date } | null = null,
): jest.Mocked<CompensationPeriodLookupPort> {
  return {
    findOverlappingClosed: jest.fn().mockResolvedValue(overlapping),
  };
}

describe('SetJornadaPolicyUseCase', () => {
  // ── SJP-01 — Happy path ────────────────────────────────────────────────────

  it('SJP-01a — inserts a new policy (no existing timeline)', async () => {
    const created = makePolicy('2026-07-01', 8);
    const policyRepo = makePolicyRepo([]);
    policyRepo.create.mockResolvedValue(created);
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    const result = await useCase.execute({ horasDiarias: 8, vigenteDesde: '2026-07-01' });

    expect(policyRepo.create).toHaveBeenCalledTimes(1);
    expect(result.horasDiarias.toNumber()).toBe(8);
    expect(result.id).toBeDefined();
  });

  it('SJP-01b — second policy inserts alongside first', async () => {
    const existing = makePolicy('2025-01-01', 8);
    const created = makePolicy('2026-01-01', 7.5);
    const policyRepo = makePolicyRepo([existing]);
    policyRepo.create.mockResolvedValue(created);
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    const result = await useCase.execute({ horasDiarias: 7.5, vigenteDesde: '2026-01-01' });

    expect(policyRepo.create).toHaveBeenCalledTimes(1);
    expect(result.horasDiarias.toNumber()).toBe(7.5);
  });

  // ── SJP-02 — Overlaps liquidated period ───────────────────────────────────

  it('SJP-02a — vigenteDesde equals desde of liquidated period → overlap error', async () => {
    const overlapping = { desde: new Date('2026-05-01T00:00:00Z'), hasta: new Date('2026-05-15T00:00:00Z') };
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(overlapping);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 8, vigenteDesde: '2026-05-01' }),
    ).rejects.toThrow(JornadaPolicyOverlapsLiquidatedPeriodError);

    expect(policyRepo.create).not.toHaveBeenCalled();
  });

  it('SJP-02b — vigenteDesde equals hasta of liquidated period → overlap error', async () => {
    const overlapping = { desde: new Date('2026-05-01T00:00:00Z'), hasta: new Date('2026-05-15T00:00:00Z') };
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(overlapping);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 8, vigenteDesde: '2026-05-15' }),
    ).rejects.toThrow(JornadaPolicyOverlapsLiquidatedPeriodError);
  });

  it('SJP-02c — vigenteDesde strictly after all liquidated periods → success', async () => {
    const created = makePolicy('2026-05-16', 8);
    const policyRepo = makePolicyRepo([]);
    policyRepo.create.mockResolvedValue(created);
    // Port returns null when vigenteDesde doesn't overlap any liquidated period
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    const result = await useCase.execute({ horasDiarias: 8, vigenteDesde: '2026-05-16' });

    expect(policyRepo.create).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  // ── SJP-03 — Duplicate vigenteDesde ──────────────────────────────────────

  it('SJP-03 — duplicate vigenteDesde → DuplicateEffectiveDateError before hitting DB', async () => {
    const existing = makePolicy('2026-07-01', 8);
    const policyRepo = makePolicyRepo([existing]);
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 9, vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    expect(policyRepo.create).not.toHaveBeenCalled();
  });

  // ── SJP-04 — horasDiarias range validation ───────────────────────────────

  it('SJP-04a — horasDiarias = 0 → InvalidHorasError', async () => {
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 0, vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyInvalidHorasError);
  });

  it('SJP-04b — horasDiarias = 24.01 → InvalidHorasError', async () => {
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 24.01, vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyInvalidHorasError);
  });

  it('SJP-04c — horasDiarias = 7.5 → succeeds', async () => {
    const created = makePolicy('2026-07-01', 7.5);
    const policyRepo = makePolicyRepo([]);
    policyRepo.create.mockResolvedValue(created);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    const result = await useCase.execute({ horasDiarias: 7.5, vigenteDesde: '2026-07-01' });

    expect(result.horasDiarias.toNumber()).toBe(7.5);
  });
});
