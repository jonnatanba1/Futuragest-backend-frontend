/**
 * GetJornadaPolicyTimelineUseCase unit spec.
 *
 * Coverage:
 *   GJP-01: two policies returned sorted ascending by vigenteDesde (backward-compat).
 *   T4 (R1.5 GET filter): execute(opts) dispatch:
 *     (a) execute() / opts absent / zoneId undefined  → findTimeline() (no filter)
 *     (b) execute({ zoneId: "z1" })                   → findByScope({ zoneId: "z1" })
 *     (c) execute({ zoneId: null })                   → findByScope({ zoneId: null }) (global-only)
 *     (d) execute({ operarioId: "o1" })               → findByScope({ operarioId: "o1" })
 */

import { Decimal } from '@prisma/client/runtime/client';
import { GetJornadaPolicyTimelineUseCase } from './get-jornada-policy-timeline.use-case';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';

function makePolicy(dateStr: string, hours: number, scope: { operarioId?: string | null; zoneId?: string | null } = {}): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}-${scope.zoneId ?? 'global'}-${scope.operarioId ?? 'global'}`,
    operarioId: scope.operarioId ?? null,
    zoneId: scope.zoneId ?? null,
    horaInicio: '06:00',
    horaFin: '14:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: null,
    almuerzoFin: null,
    desayunoInicio: null,
    desayunoFin: null,
    toleranciaMin: 5,
    horasDiarias: new Decimal(hours),
    horasSemanales: new Decimal(hours * 5),
    vigenteDesde: new Date(`${dateStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makeMockRepo(): jest.Mocked<JornadaPolicyRepositoryPort> {
  return {
    create: jest.fn(),
    findTimeline: jest.fn(),
    findLatestBefore: jest.fn(),
    delete: jest.fn(),
    findByScope: jest.fn(),
    existsByOperarioZoneVigente: jest.fn(),
  };
}

describe('GetJornadaPolicyTimelineUseCase', () => {
  // ── GJP-01 — backward-compat: no opts → findTimeline ─────────────────────────

  it('GJP-01 — returns two policies sorted ascending by vigenteDesde', async () => {
    const p1 = makePolicy('2025-01-01', 8);
    const p2 = makePolicy('2026-01-01', 7.5);
    const mockRepo = makeMockRepo();
    mockRepo.findTimeline.mockResolvedValue([p1, p2]);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].vigenteDesde.getTime()).toBeLessThan(result[1].vigenteDesde.getTime());
    expect(result[0].horasDiarias.toNumber()).toBe(8);
    expect(result[1].horasDiarias.toNumber()).toBe(7.5);
    expect(mockRepo.findTimeline).toHaveBeenCalledTimes(1);
    expect(mockRepo.findByScope).not.toHaveBeenCalled();
  });

  it('returns empty array when no policies exist (no opts)', async () => {
    const mockRepo = makeMockRepo();
    mockRepo.findTimeline.mockResolvedValue([]);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toHaveLength(0);
    expect(mockRepo.findTimeline).toHaveBeenCalledTimes(1);
    expect(mockRepo.findByScope).not.toHaveBeenCalled();
  });

  // ── T4 — execute(opts) dispatch (R1.5) ──────────────────────────────────────

  it('T4(b) — execute({ zoneId: "z1" }) dispatches findByScope({ zoneId: "z1" })', async () => {
    const scoped = [makePolicy('2026-01-01', 8, { zoneId: 'z1' })];
    const mockRepo = makeMockRepo();
    mockRepo.findByScope.mockResolvedValue(scoped);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute({ zoneId: 'z1' });

    expect(result).toBe(scoped);
    expect(result[0].zoneId).toBe('z1');
    expect(mockRepo.findByScope).toHaveBeenCalledTimes(1);
    expect(mockRepo.findByScope).toHaveBeenCalledWith({ zoneId: 'z1' });
    expect(mockRepo.findTimeline).not.toHaveBeenCalled();
  });

  it('T4(c) — execute({ zoneId: null }) dispatches findByScope({ zoneId: null }) (global-only)', async () => {
    const globalOnly = [makePolicy('2026-01-01', 8, { zoneId: null })];
    const mockRepo = makeMockRepo();
    mockRepo.findByScope.mockResolvedValue(globalOnly);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute({ zoneId: null });

    expect(result).toBe(globalOnly);
    expect(result[0].zoneId).toBeNull();
    expect(mockRepo.findByScope).toHaveBeenCalledWith({ zoneId: null });
    expect(mockRepo.findTimeline).not.toHaveBeenCalled();
  });

  it('T4(d) — execute({ operarioId: "o1" }) dispatches findByScope({ operarioId: "o1" })', async () => {
    const operarioScoped = [makePolicy('2026-01-01', 8, { operarioId: 'o1' })];
    const mockRepo = makeMockRepo();
    mockRepo.findByScope.mockResolvedValue(operarioScoped);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute({ operarioId: 'o1' });

    expect(result).toBe(operarioScoped);
    expect(result[0].operarioId).toBe('o1');
    expect(mockRepo.findByScope).toHaveBeenCalledWith({ operarioId: 'o1' });
    expect(mockRepo.findTimeline).not.toHaveBeenCalled();
  });

  it('T4 — explicit { zoneId: undefined } treated as no filter → findTimeline (backward-compat contract)', async () => {
    // When opts is passed but zoneId is explicitly undefined, the use case must NOT
    // dispatch findByScope — undefined means "no filter on this field", so falling
    // back to findTimeline keeps the contract: empty opts object ⇒ no filter at all.
    const mockRepo = makeMockRepo();
    mockRepo.findTimeline.mockResolvedValue([makePolicy('2026-01-01', 8)]);

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute({ zoneId: undefined });

    expect(result).toHaveLength(1);
    expect(mockRepo.findTimeline).toHaveBeenCalledTimes(1);
    expect(mockRepo.findByScope).not.toHaveBeenCalled();
  });
});
