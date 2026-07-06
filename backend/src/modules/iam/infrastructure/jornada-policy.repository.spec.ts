/**
 * T2 RED → GREEN: JornadaPolicyRepository — scope-aware Prisma adapter.
 *
 * Spec refs: R1.1 findByScope, R1.2 existsByOperarioZoneVigente.
 *
 * NOTE: this spec needs full JornadaPolicyRecord shapes for TypeScript to
 * compile against the strict port type. The pre-existing slim test fixtures
 * were widened as part of T2 to satisfy the scope-aware port contract.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { JornadaPolicyRepository } from './jornada-policy.repository';
import type { JornadaPolicyRecord } from '../../compensacion/domain/ports/jornada-policy-repository.port';
import type { PrismaService } from '../../../database/prisma.service';

function record(overrides: Partial<JornadaPolicyRecord> = {}): JornadaPolicyRecord {
  return {
    id: 'pol-x',
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
    horasSemanales: new Decimal(40),
    horasDiarias: new Decimal(8),
    vigenteDesde: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDelegate(
  findManyResult: JornadaPolicyRecord[] = [],
  findFirstResult: JornadaPolicyRecord | null = null,
  countResult = 0,
) {
  return {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pol-1', ...data, createdAt: new Date() }),
    ),
    findMany: jest.fn().mockResolvedValue(findManyResult),
    findFirst: jest.fn().mockResolvedValue(findFirstResult),
    count: jest.fn().mockResolvedValue(countResult),
  };
}

function makePrisma(delegate: ReturnType<typeof makeDelegate>) {
  return { jornadaPolicy: delegate } as unknown as PrismaService;
}

describe('JornadaPolicyRepository — scope-aware (T2)', () => {
  // ── create (kept working) ────────────────────────────────────────────────
  it('create — calls prisma.jornadaPolicy.create with scope fields + horasDiarias + vigenteDesde', async () => {
    const delegate = makeDelegate();
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const data = {
      operarioId: null,
      zoneId: 'z1',
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      almuerzoInicio: null,
      almuerzoFin: null,
      desayunoInicio: null,
      desayunoFin: null,
      toleranciaMin: 5,
      horasDiarias: new Decimal(8),
      horasSemanales: new Decimal(40),
      vigenteDesde: new Date('2026-07-01T00:00:00Z'),
    };
    await repo.create(data);

    expect(delegate.create).toHaveBeenCalledTimes(1);
    expect(delegate.create.mock.calls[0][0].data.zoneId).toBe('z1');
    expect(delegate.create.mock.calls[0][0].data.horasDiarias.toNumber()).toBe(8);
  });

  // ── findTimeline (kept working) ──────────────────────────────────────────
  it('findTimeline — calls findMany with orderBy vigenteDesde asc', async () => {
    const policies = [
      record({ id: 'p1', vigenteDesde: new Date('2025-01-01T00:00:00Z') }),
      record({ id: 'p2', vigenteDesde: new Date('2026-01-01T00:00:00Z') }),
    ];
    const delegate = makeDelegate(policies);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findTimeline();

    expect(delegate.findMany).toHaveBeenCalledTimes(1);
    const callArg = delegate.findMany.mock.calls[0][0];
    expect(JSON.stringify(callArg.orderBy)).toContain('vigenteDesde');
    expect(result).toHaveLength(2);
  });

  // ── findLatestBefore (kept working) ──────────────────────────────────────
  it('findLatestBefore — queries with vigenteDesde lte + orderBy desc', async () => {
    const policy = record({ id: 'p1', vigenteDesde: new Date('2026-01-01T00:00:00Z') });
    const delegate = makeDelegate([], policy);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findLatestBefore(new Date('2026-05-01T00:00:00Z'));

    expect(delegate.findFirst).toHaveBeenCalledTimes(1);
    expect(result?.id).toBe('p1');
  });

  it('findLatestBefore — returns null when no policy exists before the date', async () => {
    const delegate = makeDelegate([], null);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findLatestBefore(new Date('2025-01-01T00:00:00Z'));

    expect(result).toBeNull();
  });

  // ── findByScope (R1.1) ────────────────────────────────────────────────────
  it('T2-a — findByScope({ zoneId: "z1" }) → where.zoneId equals "z1", orderBy vigenteDesde asc', async () => {
    const rows = [
      record({ id: 'z1-a', zoneId: 'z1', vigenteDesde: new Date('2026-01-01T00:00:00Z') }),
    ];
    const delegate = makeDelegate(rows);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findByScope({ zoneId: 'z1' });

    expect(delegate.findMany).toHaveBeenCalledTimes(1);
    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({ zoneId: { equals: 'z1' } });
    expect(JSON.stringify(callArg.orderBy)).toContain('vigenteDesde');
    expect(result).toHaveLength(1);
  });

  it('T2-b — findByScope({ zoneId: null }) → where.zoneId equals null (GLOBAL)', async () => {
    const delegate = makeDelegate([record({ id: 'g1', zoneId: null })]);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    await repo.findByScope({ zoneId: null });

    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({ zoneId: { equals: null } });
  });

  it('T2-b′ — findByScope({ zoneId: "" }) → empty string also maps to GLOBAL (IS NULL)', async () => {
    const delegate = makeDelegate([]);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    await repo.findByScope({ zoneId: '' });

    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({ zoneId: { equals: null } });
  });

  it('T2-c — findByScope() (no opts) → no where clause (returns ALL rows)', async () => {
    const rows = [record({ id: 'a' }), record({ id: 'b', zoneId: 'z1' })];
    const delegate = makeDelegate(rows);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findByScope();

    expect(delegate.findMany).toHaveBeenCalledTimes(1);
    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({});
    expect(result).toHaveLength(2);
  });

  it('T2-c′ — findByScope({ operarioId: "op-9" }) → filters by operarioId only', async () => {
    const delegate = makeDelegate([]);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    await repo.findByScope({ operarioId: 'op-9' });

    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({ operarioId: { equals: 'op-9' } });
  });

  it('T2-c″ — findByScope({ operarioId: null, zoneId: "z1" }) → both clauses applied', async () => {
    const delegate = makeDelegate([]);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    await repo.findByScope({ operarioId: null, zoneId: 'z1' });

    const callArg = delegate.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({
      operarioId: { equals: null },
      zoneId: { equals: 'z1' },
    });
  });

  // ── existsByOperarioZoneVigente (R1.2) ────────────────────────────────────
  it('T2-d — existsByOperarioZoneVigente(null, null, date) → count where vigenteDesde equals UTC-midnight Date; true when row exists', async () => {
    const delegate = makeDelegate([], null, 1);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const date = new Date('2026-07-01T00:00:00Z');
    const result = await repo.existsByOperarioZoneVigente(null, null, date);

    expect(delegate.count).toHaveBeenCalledTimes(1);
    const callArg = delegate.count.mock.calls[0][0];
    expect(callArg.where).toEqual({
      operarioId: null,
      zoneId: null,
      vigenteDesde: date,
    });
    expect(result).toBe(true);
  });

  it('T2-d′ — existsByOperarioZoneVigente returns false when count === 0', async () => {
    const delegate = makeDelegate([], null, 0);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.existsByOperarioZoneVigente('op-1', 'z1', new Date('2026-07-01T00:00:00Z'));
    expect(result).toBe(false);
  });
});