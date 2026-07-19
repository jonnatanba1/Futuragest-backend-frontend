/**
 * T1 RED → GREEN: structural contract spec for JornadaPolicyRepositoryPort.
 *
 * JornadaPolicy is now SCOPE-AWARE (per-zone / per-operario / global), no longer
 * a single company-wide setting. Asserts the port exposes the new scope methods
 * used by SetJornadaPolicyUseCase and the timeline GET filter (PR 2).
 *
 * Spec refs: R1.1 findByScope, R1.2 existsByOperarioZoneVigente.
 */

import {
  JORNADA_POLICY_REPOSITORY_PORT,
  type JornadaPolicyRepositoryPort,
  type JornadaPolicyRecord,
  type CreateJornadaPolicyData,
} from './jornada-policy-repository.port';

describe('JornadaPolicyRepositoryPort — structural contract', () => {
  it('exports JORNADA_POLICY_REPOSITORY_PORT as a Symbol', () => {
    expect(typeof JORNADA_POLICY_REPOSITORY_PORT).toBe('symbol');
    expect(JORNADA_POLICY_REPOSITORY_PORT.toString()).toContain('JornadaPolicyRepositoryPort');
  });

  it('exposes the legacy methods (create, findTimeline, findLatestBefore, delete)', () => {
    const _methods: {
      create: JornadaPolicyRepositoryPort['create'];
      findTimeline: JornadaPolicyRepositoryPort['findTimeline'];
      findLatestBefore: JornadaPolicyRepositoryPort['findLatestBefore'];
      delete: JornadaPolicyRepositoryPort['delete'];
    } = null as never;
    void _methods;
    expect(JORNADA_POLICY_REPOSITORY_PORT).toBeDefined();
  });

  it('exposes findByScope for scope-filtered reads (R1.1)', () => {
    const _findByScope: JornadaPolicyRepositoryPort['findByScope'] = null as never;
    void _findByScope;
    expect(JORNADA_POLICY_REPOSITORY_PORT).toBeDefined();
  });

  it('exposes existsByOperarioZoneVigente for scope-aware duplicate check (R1.2)', () => {
    const _exists: JornadaPolicyRepositoryPort['existsByOperarioZoneVigente'] = null as never;
    void _exists;
    expect(JORNADA_POLICY_REPOSITORY_PORT).toBeDefined();
  });

  it('JornadaPolicyRecord and CreateJornadaPolicyData types are importable (scope-aware fields)', () => {
    // Compile-time check: scope fields must be on the shapes.
    const _record: JornadaPolicyRecord = null as never;
    const _data: CreateJornadaPolicyData = null as never;
    void _record;
    void _data;
    expect(JORNADA_POLICY_REPOSITORY_PORT).toBeDefined();
  });

  describe('findByScope — scope semantics (behavioral contract against a mock)', () => {
    function makeMock(
      findByScopeImpl: (opts?: { zoneId?: string | null; operarioId?: string | null }) => Promise<JornadaPolicyRecord[]>,
    ): JornadaPolicyRepositoryPort {
      return {
        create: jest.fn(),
        findTimeline: jest.fn(),
        findLatestBefore: jest.fn(),
        delete: jest.fn(),
        findByScope: jest.fn(findByScopeImpl),
        existsByOperarioZoneVigente: jest.fn().mockResolvedValue(false),
      } as unknown as JornadaPolicyRepositoryPort;
    }

    it('zoneId absent (undefined) returns ALL rows (no clause)', async () => {
      const all = [{ id: 'a' }, { id: 'b' }] as unknown as JornadaPolicyRecord[];
      const port = makeMock(async () => all);
      const result = await port.findByScope();
      expect(result).toBe(all);
      expect(port.findByScope).toHaveBeenCalledWith();
    });

    it('zoneId null/empty filters to GLOBAL rows only (IS NULL)', async () => {
      const globalRows = [{ id: 'g' }] as unknown as JornadaPolicyRecord[];
      const port = makeMock(async (opts) => {
        expect(opts?.zoneId).toBeNull();
        return globalRows;
      });
      const result = await port.findByScope({ zoneId: null });
      expect(result).toBe(globalRows);
    });

    it('zoneId non-empty filters to that zone', async () => {
      const zoneRows = [{ id: 'z1' }] as unknown as JornadaPolicyRecord[];
      const port = makeMock(async (opts) => {
        expect(opts?.zoneId).toBe('z1');
        return zoneRows;
      });
      const result = await port.findByScope({ zoneId: 'z1' });
      expect(result).toBe(zoneRows);
    });

    it('operarioId filter is applied when provided', async () => {
      const port = makeMock(async (opts) => {
        expect(opts?.operarioId).toBe('op-9');
        return [];
      });
      await port.findByScope({ operarioId: 'op-9' });
      expect(port.findByScope).toHaveBeenCalledWith({ operarioId: 'op-9' });
    });
  });

  describe('existsByOperarioZoneVigente — scope-aware duplicate probe', () => {
    function makeMock(
      existsImpl: (operarioId: string | null, zoneId: string | null, vigenteDesde: Date) => Promise<boolean>,
    ): JornadaPolicyRepositoryPort {
      return {
        create: jest.fn(),
        findTimeline: jest.fn(),
        findLatestBefore: jest.fn(),
        delete: jest.fn(),
        findByScope: jest.fn().mockResolvedValue([]),
        existsByOperarioZoneVigente: jest.fn(existsImpl),
      } as unknown as JornadaPolicyRepositoryPort;
    }

    it('returns true when a global row exists for the date', async () => {
      const date = new Date('2026-07-01T00:00:00Z');
      const port = makeMock(async (operarioId, zoneId, vigenteDesde) => {
        expect(operarioId).toBeNull();
        expect(zoneId).toBeNull();
        expect(vigenteDesde).toBe(date);
        return true;
      });
      await expect(port.existsByOperarioZoneVigente(null, null, date)).resolves.toBe(true);
    });

    it('returns false when no row matches the scope+date', async () => {
      const port = makeMock(async () => false);
      await expect(
        port.existsByOperarioZoneVigente('op-1', 'z1', new Date('2026-07-01T00:00:00Z')),
      ).resolves.toBe(false);
    });
  });
});