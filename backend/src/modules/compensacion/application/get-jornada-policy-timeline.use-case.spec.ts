/**
 * A5.1 RED → A5.2 GREEN: GetJornadaPolicyTimelineUseCase unit spec.
 * GJP-01: two policies returned sorted ascending by vigenteDesde.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { GetJornadaPolicyTimelineUseCase } from './get-jornada-policy-timeline.use-case';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';

function makePolicy(dateStr: string, hours: number): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}`,
    horasDiarias: new Decimal(hours),
    vigenteDesde: new Date(`${dateStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

describe('GetJornadaPolicyTimelineUseCase', () => {
  it('GJP-01 — returns two policies sorted ascending by vigenteDesde', async () => {
    const p1 = makePolicy('2025-01-01', 8);
    const p2 = makePolicy('2026-01-01', 7.5);

    const mockRepo: jest.Mocked<JornadaPolicyRepositoryPort> = {
      create: jest.fn(),
      findTimeline: jest.fn().mockResolvedValue([p1, p2]),
      findLatestBefore: jest.fn(),
    };

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].vigenteDesde.getTime()).toBeLessThan(result[1].vigenteDesde.getTime());
    expect(result[0].horasDiarias.toNumber()).toBe(8);
    expect(result[1].horasDiarias.toNumber()).toBe(7.5);
  });

  it('returns empty array when no policies exist', async () => {
    const mockRepo: jest.Mocked<JornadaPolicyRepositoryPort> = {
      create: jest.fn(),
      findTimeline: jest.fn().mockResolvedValue([]),
      findLatestBefore: jest.fn(),
    };

    const useCase = new GetJornadaPolicyTimelineUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });
});
