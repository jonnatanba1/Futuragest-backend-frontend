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
    horasSemanales: new Decimal(horasDiarias * 5),
    horasDiarias: new Decimal(horasDiarias),
    vigenteDesde: new Date(`${vigenteDesdeStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makePolicyRepo(
  timeline: JornadaPolicyRecord[] = [],
  exists = false,
): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    create: jest.fn().mockResolvedValue(makePolicy('2026-07-01')),
    findTimeline: jest.fn().mockResolvedValue(timeline),
    findLatestBefore: jest.fn().mockResolvedValue(null),
    delete: jest.fn(),
    findByScope: jest.fn().mockResolvedValue([]),
    existsByOperarioZoneVigente: jest.fn().mockResolvedValue(exists),
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
    const result = await useCase.execute({ horasDiarias: 8, horasSemanales: 8 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01' });

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
    const result = await useCase.execute({ horasDiarias: 7.5, horasSemanales: 7.5 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-01-01' });

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
      useCase.execute({ horasDiarias: 8, horasSemanales: 8 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-05-01' }),
    ).rejects.toThrow(JornadaPolicyOverlapsLiquidatedPeriodError);

    expect(policyRepo.create).not.toHaveBeenCalled();
  });

  it('SJP-02b — vigenteDesde equals hasta of liquidated period → overlap error', async () => {
    const overlapping = { desde: new Date('2026-05-01T00:00:00Z'), hasta: new Date('2026-05-15T00:00:00Z') };
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(overlapping);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 8, horasSemanales: 8 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-05-15' }),
    ).rejects.toThrow(JornadaPolicyOverlapsLiquidatedPeriodError);
  });

  it('SJP-02c — vigenteDesde strictly after all liquidated periods → success', async () => {
    const created = makePolicy('2026-05-16', 8);
    const policyRepo = makePolicyRepo([]);
    policyRepo.create.mockResolvedValue(created);
    // Port returns null when vigenteDesde doesn't overlap any liquidated period
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);
    const result = await useCase.execute({ horasDiarias: 8, horasSemanales: 8 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-05-16' });

    expect(policyRepo.create).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  // ── SJP-03 — Duplicate vigenteDesde (scope-aware) ──────────────────────

  it('SJP-03 — duplicate vigenteDesde (GLOBAL) → DuplicateEffectiveDateError before hitting DB; uses existsByOperarioZoneVigente', async () => {
    const policyRepo = makePolicyRepo([], /* exists */ true);
    const periodLookup = makePeriodLookupPort(null);

    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 9, horasSemanales: 9 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    // The new scope-aware check must be used (replaces findTimeline + .find)
    expect(policyRepo.existsByOperarioZoneVigente).toHaveBeenCalledTimes(1);
    const [op, zone, date] = policyRepo.existsByOperarioZoneVigente.mock.calls[0];
    expect(op).toBeNull();
    expect(zone).toBeNull();
    expect(date.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    // The legacy findTimeline path must NOT be used for duplicate detection
    expect(policyRepo.findTimeline).not.toHaveBeenCalled();
    expect(policyRepo.create).not.toHaveBeenCalled();
  });

  // ── T3 — scope-aware duplicate matrix (R1.4) ──────────────────────────

  it('T3-1 — two per-zone policies same date, DIFFERENT zones → both succeed', async () => {
    // First zone insert
    const policyRepo1 = makePolicyRepo([], false);
    policyRepo1.create.mockResolvedValue(makePolicy('2026-07-01'));
    const useCase1 = new SetJornadaPolicyUseCase(policyRepo1, makePeriodLookupPort(null));
    await useCase1.execute({
      horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
      diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01', zoneId: 'zona-norte',
    });
    expect(policyRepo1.create).toHaveBeenCalledTimes(1);
    expect(policyRepo1.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, 'zona-norte', expect.any(Date));

    // Second zone insert — same date, different zone, also succeeds
    const policyRepo2 = makePolicyRepo([], false);
    policyRepo2.create.mockResolvedValue(makePolicy('2026-07-01'));
    const useCase2 = new SetJornadaPolicyUseCase(policyRepo2, makePeriodLookupPort(null));
    await useCase2.execute({
      horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
      diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01', zoneId: 'zona-sur',
    });
    expect(policyRepo2.create).toHaveBeenCalledTimes(1);
    expect(policyRepo2.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, 'zona-sur', expect.any(Date));
  });

  it('T3-2 — same zone, same date → second throws JornadaPolicyDuplicateEffectiveDateError with per-zone message', async () => {
    const policyRepo = makePolicyRepo([], /* exists */ true);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, makePeriodLookupPort(null));

    await expect(
      useCase.execute({
        horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
        diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01', zoneId: 'zona-norte',
      }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    expect(policyRepo.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, 'zona-norte', expect.any(Date));
    expect(policyRepo.create).not.toHaveBeenCalled();
  });

  it('T3-3 — two GLOBAL policies same date → second throws', async () => {
    const policyRepo = makePolicyRepo([], /* exists */ true);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, makePeriodLookupPort(null));

    await expect(
      useCase.execute({
        horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
        diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01',
      }),
    ).rejects.toThrow(JornadaPolicyDuplicateEffectiveDateError);

    expect(policyRepo.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, null, expect.any(Date));
  });

  it('T3-4 — per-zone same date as existing global → both succeed (different scopes)', async () => {
    // global insert passes (no existing global)
    const globalRepo = makePolicyRepo([], false);
    globalRepo.create.mockResolvedValue(makePolicy('2026-07-01'));
    const globalUse = new SetJornadaPolicyUseCase(globalRepo, makePeriodLookupPort(null));
    await globalUse.execute({
      horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
      diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01',
    });
    expect(globalRepo.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, null, expect.any(Date));

    // per-zone insert same date — duplicate check is scope-aware, still resolves to no dup
    const zoneRepo = makePolicyRepo([], false);
    zoneRepo.create.mockResolvedValue(makePolicy('2026-07-01'));
    const zoneUse = new SetJornadaPolicyUseCase(zoneRepo, makePeriodLookupPort(null));
    await zoneUse.execute({
      horasDiarias: 8, horasSemanales: 40, horaInicio: "06:00", horaFin: "14:00",
      diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01', zoneId: 'zona-norte',
    });
    expect(zoneRepo.existsByOperarioZoneVigente).toHaveBeenCalledWith(null, 'zona-norte', expect.any(Date));
    expect(zoneRepo.create).toHaveBeenCalledTimes(1);
  });

  // ── SJP-04 — horasDiarias range validation ───────────────────────────────

  it('SJP-04a — horasDiarias = 0 → InvalidHorasError', async () => {
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 0, horasSemanales: 0 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyInvalidHorasError);
  });

  it('SJP-04b — horasDiarias = 24.01 → InvalidHorasError', async () => {
    const policyRepo = makePolicyRepo([]);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    await expect(
      useCase.execute({ horasDiarias: 24.01, horasSemanales: 24.01 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01' }),
    ).rejects.toThrow(JornadaPolicyInvalidHorasError);
  });

  it('SJP-04c — horasDiarias = 7.5 → succeeds', async () => {
    const created = makePolicy('2026-07-01', 7.5);
    const policyRepo = makePolicyRepo([]);
    policyRepo.create.mockResolvedValue(created);
    const periodLookup = makePeriodLookupPort(null);
    const useCase = new SetJornadaPolicyUseCase(policyRepo, periodLookup);

    const result = await useCase.execute({ horasDiarias: 7.5, horasSemanales: 7.5 * 5, horaInicio: "06:00", horaFin: "14:00", diasLaborales: [1, 2, 3, 4, 5], vigenteDesde: '2026-07-01' });

    expect(result.horasDiarias.toNumber()).toBe(7.5);
  });
});
