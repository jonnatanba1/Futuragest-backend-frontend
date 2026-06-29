/**
 * B4.1 RED — ScopedCompensationPeriodRepository unit spec.
 *
 * Tests verify that:
 *   - findByOperarioAndPeriod delegates to findFirstScoped with correct where clause.
 *   - findPreviousClosed returns the most recent period with periodKey < beforePeriodKey.
 *   - findByClientRef delegates to findFirstScoped.
 *   - findOverlappingClosed queries globally (no scope) via raw delegate.
 *   - create delegates to this.delegate.create.
 *
 * Pattern mirrors scoped-novedad.repository.spec.ts — mock delegate + scopeHolder.
 */

import type { CompensationPeriod } from '@prisma/client';
import { ScopedCompensationPeriodRepository } from './scoped-compensation-period.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePeriod(overrides: Partial<CompensationPeriod> = {}): CompensationPeriod {
  return {
    id: 'cp-1',
    operarioId: 'O1',
    zoneId: 'zone-1',
    supervisorId: 'sup-1',
    periodKey: '2026-05-Q1',
    desde: '2026-05-01',
    hasta: '2026-05-15',
    creditos: '0.50' as unknown as CompensationPeriod['creditos'],
    debitos: '1.00' as unknown as CompensationPeriod['debitos'],
    carryIn: '0.00' as unknown as CompensationPeriod['carryIn'],
    saldo: '-0.50' as unknown as CompensationPeriod['saldo'],
    disposition: 'CARRY_OVER',
    approvedByUserId: 'user-1',
    decidedAt: new Date(),
    closedAt: new Date(),
    clientRef: 'ref-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CompensationPeriod;
}

function makeRepo(findFirstResult: CompensationPeriod | null = null, findManyResult: CompensationPeriod[] = []) {
  const mockDelegate = {
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(findFirstResult),
    findMany: jest.fn().mockResolvedValue(findManyResult),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockPrisma = { compensationPeriod: mockDelegate };

  const mockScopeHolder = {
    current: () => ({
      userId: 'user-1',
      role: 'SUPERVISOR' as const,
      supervisorId: 'sup-1',
      zoneId: 'zone-1',
    }),
  };

  const repo = new ScopedCompensationPeriodRepository(
    mockPrisma as unknown as import('../../../database/prisma.service').PrismaService,
    mockScopeHolder as unknown as import('../../auth/domain/scope-context').ScopeContextHolder,
  );

  return { repo, mockDelegate };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScopedCompensationPeriodRepository', () => {
  describe('findByOperarioAndPeriod', () => {
    it('B4-01 — calls findFirstScoped with operarioId + periodKey in where and returns result', async () => {
      const existing = makePeriod();
      const { repo, mockDelegate } = makeRepo(existing);

      const result = await repo.findByOperarioAndPeriod('O1', '2026-05-Q1');

      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      const callArg = (mockDelegate.findFirst as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      const where = callArg.where as Record<string, unknown>;
      // Scope filter adds AND array — operarioId and periodKey must appear somewhere in where
      const whereStr = JSON.stringify(where);
      expect(whereStr).toContain('O1');
      expect(whereStr).toContain('2026-05-Q1');
      expect(result).not.toBeNull();
      expect(result?.periodKey).toBe('2026-05-Q1');
    });

    it('B4-02 — returns null when not found', async () => {
      const { repo } = makeRepo(null);
      const result = await repo.findByOperarioAndPeriod('O1', '2026-05-Q1');
      expect(result).toBeNull();
    });
  });

  describe('findByClientRef', () => {
    it('B4-03 — calls findFirstScoped with clientRef and returns result', async () => {
      const existing = makePeriod({ clientRef: 'ref-xyz' });
      const { repo, mockDelegate } = makeRepo(existing);

      const result = await repo.findByClientRef('ref-xyz');

      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      const callArg = (mockDelegate.findFirst as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      const whereStr = JSON.stringify(callArg.where);
      expect(whereStr).toContain('ref-xyz');
      expect(result?.clientRef).toBe('ref-xyz');
    });
  });

  describe('findPreviousClosed', () => {
    it('B4-04 — calls findFirstScoped ordered by periodKey desc and returns result', async () => {
      const prev = makePeriod({ periodKey: '2026-04-Q2' });
      const { repo, mockDelegate } = makeRepo(prev);

      const result = await repo.findPreviousClosed('O1', '2026-05-Q1');

      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      const callArg = (mockDelegate.findFirst as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      const whereStr = JSON.stringify(callArg.where);
      // Must filter operarioId = O1 and periodKey < '2026-05-Q1'
      expect(whereStr).toContain('O1');
      // orderBy desc
      expect(callArg.orderBy).toBeDefined();
      expect(result?.periodKey).toBe('2026-04-Q2');
    });

    it('B4-05 — returns null when no previous period exists', async () => {
      const { repo } = makeRepo(null);
      const result = await repo.findPreviousClosed('O1', '2026-05-Q1');
      expect(result).toBeNull();
    });
  });

  describe('findOverlappingClosed', () => {
    it('B4-06 — calls delegate.findFirst directly (global, no scope) with date range overlap', async () => {
      const period = makePeriod({ desde: '2026-05-01', hasta: '2026-05-15' });
      const { repo, mockDelegate } = makeRepo(period);

      const vigenteDesde = new Date('2026-05-10T00:00:00Z');
      const result = await repo.findOverlappingClosed(vigenteDesde);

      // findFirst on the raw delegate (global — not scoped)
      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
    });

    it('B4-07 — returns null when no overlapping period', async () => {
      const { repo } = makeRepo(null);
      const result = await repo.findOverlappingClosed(new Date('2026-06-01T00:00:00Z'));
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('B4-08 — calls delegate.create with the provided data', async () => {
      const created = makePeriod({ id: 'cp-new' });
      const { repo, mockDelegate } = makeRepo(null);
      (mockDelegate.create as jest.Mock).mockResolvedValue(created);

      const data = {
        operarioId: 'O1',
        zoneId: 'zone-1',
        supervisorId: 'sup-1',
        periodKey: '2026-05-Q1',
        desde: '2026-05-01',
        hasta: '2026-05-15',
        creditos: '0.50' as unknown as import('@prisma/client/runtime/client').Decimal,
        debitos: '1.00' as unknown as import('@prisma/client/runtime/client').Decimal,
        carryIn: '0.00' as unknown as import('@prisma/client/runtime/client').Decimal,
        saldo: '-0.50' as unknown as import('@prisma/client/runtime/client').Decimal,
        disposition: 'CARRY_OVER' as const,
        approvedByUserId: 'user-1',
        decidedAt: new Date(),
        clientRef: 'ref-new',
      };

      const result = await repo.create(data);

      expect(mockDelegate.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('cp-new');
    });
  });
});
