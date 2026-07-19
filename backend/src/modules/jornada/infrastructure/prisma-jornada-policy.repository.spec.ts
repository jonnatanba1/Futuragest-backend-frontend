/**
 * TDD: RED phase — PrismaJornadaPolicyRepository 3-level resolution tests.
 *
 * These tests verify the NEW 3-level policy resolution:
 *   1. operarioId + vigenteDesde (operario-level)
 *   2. zoneId + vigenteDesde (zone-level, operarioId IS NULL)
 *   3. operarioId IS NULL AND zoneId IS NULL + vigenteDesde (global)
 *
 * Currently the repository only supports 2-level (zone → global).
 * These tests will FAIL (RED) until the implementation is updated.
 */
import { PrismaJornadaPolicyRepository } from './prisma-jornada-policy.repository';
import { Decimal } from '@prisma/client/runtime/client';
import { JornadaPolicy } from '@prisma/client';

describe('PrismaJornadaPolicyRepository (3-level resolution)', () => {
  let repo: PrismaJornadaPolicyRepository;
  let mockPrisma: any;

  const date = new Date('2026-07-01');

  function makePolicy(overrides: Partial<JornadaPolicy> = {}): JornadaPolicy {
    return {
      id: 'P1',
      operarioId: null,
      zoneId: null,
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: new Decimal(7.5),
      horasSemanales: new Decimal(37.5),
      almuerzoInicio: null,
      almuerzoFin: null,
      toleranciaMin: 5,
      vigenteDesde: new Date('2025-07-16'),
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma = {
      jornadaPolicy: {
        findFirst: jest.fn(),
      },
    };
    repo = new PrismaJornadaPolicyRepository(mockPrisma as any);
  });

  // ── S1: Operario-level policy takes precedence ──────────────────────────

  it('S1: resolves operario-level policy when it exists', async () => {
    const operarioPolicy = makePolicy({ id: 'OP1', operarioId: 'O1', zoneId: 'Z1' });
    mockPrisma.jornadaPolicy.findFirst.mockResolvedValueOnce(operarioPolicy);

    const result = await repo.findLatest('O1', 'Z1', date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledWith({
      where: {
        operarioId: 'O1',
        vigenteDesde: { lte: date },
      },
      orderBy: { vigenteDesde: 'desc' },
    });
    expect(result).toBe(operarioPolicy);
    // Zone-level should NOT be queried because operario-level returned a result
    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(1);
  });

  // ── S2: Fallback to zone-level when operario-level has no match ─────────

  it('S2: falls back to zone-level when operario-level returns null', async () => {
    const zonePolicy = makePolicy({ id: 'ZP1', zoneId: 'Z1', operarioId: null });
    mockPrisma.jornadaPolicy.findFirst
      .mockResolvedValueOnce(null)   // operario-level: no match
      .mockResolvedValueOnce(zonePolicy); // zone-level: found

    const result = await repo.findLatest('O1', 'Z1', date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(2);
    expect(result).toBe(zonePolicy);
  });

  // ── S3: Fallback to global when both operario and zone have no match ────

  it('S3: falls back to global when operario and zone both return null', async () => {
    const globalPolicy = makePolicy({ id: 'GP1', zoneId: null, operarioId: null });
    mockPrisma.jornadaPolicy.findFirst
      .mockResolvedValueOnce(null)   // operario-level
      .mockResolvedValueOnce(null)   // zone-level
      .mockResolvedValueOnce(globalPolicy); // global

    const result = await repo.findLatest('O1', 'Z1', date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(3);
    expect(result).toBe(globalPolicy);
  });

  // ── S4: Returns null when no policy exists at any level ─────────────────

  it('S4: returns null when no policy exists at any level', async () => {
    mockPrisma.jornadaPolicy.findFirst
      .mockResolvedValueOnce(null)  // operario
      .mockResolvedValueOnce(null)  // zone
      .mockResolvedValueOnce(null); // global

    const result = await repo.findLatest('O1', 'Z1', date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  });

  // ── S5: operarioId null → skips operario level, goes straight to zone ──

  it('S5: skips operario level when operarioId is null', async () => {
    const zonePolicy = makePolicy({ id: 'ZP2', zoneId: 'Z1', operarioId: null });
    mockPrisma.jornadaPolicy.findFirst.mockResolvedValueOnce(zonePolicy);

    const result = await repo.findLatest(null, 'Z1', date);

    // Should query zone-level directly (no operario query)
    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledWith({
      where: {
        zoneId: 'Z1',
        operarioId: null,
        vigenteDesde: { lte: date },
      },
      orderBy: { vigenteDesde: 'desc' },
    });
    expect(result).toBe(zonePolicy);
  });

  // ── S6: zoneId null → skips zone level, goes operario → global ─────────

  it('S6: skips zone level when zoneId is null (operario→global)', async () => {
    const globalPolicy = makePolicy({ id: 'GP2', zoneId: null, operarioId: null });
    mockPrisma.jornadaPolicy.findFirst
      .mockResolvedValueOnce(null)   // operario-level
      .mockResolvedValueOnce(globalPolicy); // global

    const result = await repo.findLatest('O1', null, date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(2);
    expect(result).toBe(globalPolicy);
  });

  // ── S7: Effective dating — respects vigenteDesde ordering ───────────────

  it('S7: respects vigenteDesde ordering within same scope', async () => {
    const newerPolicy = makePolicy({ id: 'NP1', operarioId: 'O1', vigenteDesde: new Date('2026-07-01') });
    mockPrisma.jornadaPolicy.findFirst.mockResolvedValueOnce(newerPolicy);

    const result = await repo.findLatest('O1', 'Z1', new Date('2026-07-16'));

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledWith({
      where: {
        operarioId: 'O1',
        vigenteDesde: { lte: new Date('2026-07-16') },
      },
      orderBy: { vigenteDesde: 'desc' },
    });
    expect(result).toBe(newerPolicy);
  });

  // ── S8: operarioId and zoneId both null — queries global directly ───────

  it('S8: queries global directly when both operarioId and zoneId are null', async () => {
    const globalPolicy = makePolicy({ id: 'GP3', zoneId: null, operarioId: null });
    mockPrisma.jornadaPolicy.findFirst.mockResolvedValueOnce(globalPolicy);

    const result = await repo.findLatest(null, null, date);

    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.jornadaPolicy.findFirst).toHaveBeenCalledWith({
      where: {
        operarioId: null,
        zoneId: null,
        vigenteDesde: { lte: date },
      },
      orderBy: { vigenteDesde: 'desc' },
    });
    expect(result).toBe(globalPolicy);
  });
});
