/**
 * A7.2 RED → GREEN: JornadaPolicyRepository unit spec.
 * Global Prisma adapter — no ScopedRepository base (company-wide policy).
 */

import { Decimal } from '@prisma/client/runtime/client';
import { JornadaPolicyRepository } from './jornada-policy.repository';
import type { JornadaPolicyRecord } from '../../compensacion/domain/ports/jornada-policy-repository.port';
import type { PrismaService } from '../../../database/prisma.service';

function makeDelegate(findManyResult: JornadaPolicyRecord[] = [], findFirstResult: JornadaPolicyRecord | null = null) {
  return {
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pol-1', ...data, createdAt: new Date() })),
    findMany: jest.fn().mockResolvedValue(findManyResult),
    findFirst: jest.fn().mockResolvedValue(findFirstResult),
  };
}

function makePrisma(delegate: ReturnType<typeof makeDelegate>) {
  return { jornadaPolicy: delegate } as unknown as PrismaService;
}

describe('JornadaPolicyRepository', () => {
  // ── create ──────────────────────────────────────────────────────────────────

  it('create — calls prisma.jornadaPolicy.create with horasDiarias + vigenteDesde', async () => {
    const delegate = makeDelegate();
    const prisma = makePrisma(delegate);
    const repo = new JornadaPolicyRepository(prisma);

    const data = { horasDiarias: new Decimal(8), vigenteDesde: new Date('2026-07-01T00:00:00Z') };
    await repo.create(data);

    expect(delegate.create).toHaveBeenCalledTimes(1);
    const createArg = delegate.create.mock.calls[0][0];
    expect(createArg.data.horasDiarias.toNumber()).toBe(8);
  });

  // ── findTimeline ────────────────────────────────────────────────────────────

  it('findTimeline — calls findMany with orderBy vigenteDesde asc', async () => {
    const policies = [
      { id: 'p1', horasDiarias: new Decimal(8), vigenteDesde: new Date('2025-01-01'), createdAt: new Date() },
      { id: 'p2', horasDiarias: new Decimal(7.5), vigenteDesde: new Date('2026-01-01'), createdAt: new Date() },
    ];
    const delegate = makeDelegate(policies);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findTimeline();

    expect(delegate.findMany).toHaveBeenCalledTimes(1);
    const callArg = delegate.findMany.mock.calls[0][0];
    expect(JSON.stringify(callArg.orderBy)).toContain('vigenteDesde');
    expect(result).toHaveLength(2);
  });

  // ── findLatestBefore ────────────────────────────────────────────────────────

  it('findLatestBefore — queries with vigenteDesde lte + orderBy desc + take 1', async () => {
    const policy = { id: 'p1', horasDiarias: new Decimal(8), vigenteDesde: new Date('2026-01-01'), createdAt: new Date() };
    const delegate = makeDelegate([], policy);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findLatestBefore(new Date('2026-05-01T00:00:00Z'));

    expect(delegate.findFirst).toHaveBeenCalledTimes(1);
    const callArg = delegate.findFirst.mock.calls[0][0];
    expect(JSON.stringify(callArg.where)).toContain('lte');
    expect(result?.id).toBe('p1');
  });

  it('findLatestBefore — returns null when no policy exists before the date', async () => {
    const delegate = makeDelegate([], null);
    const repo = new JornadaPolicyRepository(makePrisma(delegate));

    const result = await repo.findLatestBefore(new Date('2025-01-01T00:00:00Z'));

    expect(result).toBeNull();
  });
});
