/**
 * T-11 — Unit spec for ScopedNovedadRepository
 *
 * TDD RED: test for findByClientRef added before implementation.
 * Covers: REQ-03, INV-04 — findByClientRef delegates to findFirstScoped with scope-enforced where clause.
 */

import type { Novedad } from '@prisma/client';
import { ScopedNovedadRepository } from './scoped-novedad.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNovedad(overrides: Partial<Novedad> = {}): Novedad {
  return {
    id: 'nov-1',
    attendanceId: 'att-a1',
    supervisorId: 'sup-s1',
    zoneId: 'zone-z1',
    horasExtra: '2.50' as unknown as Novedad['horasExtra'],
    motivo: null,
    status: 'PENDING',
    clientRef: null,
    approvedByUserId: null,
    decidedAt: null,
    decisionVerification: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(findFirstResult: Novedad | null) {
  // Minimal mock of the prisma delegate and scopeHolder that ScopedNovedadRepository uses
  const mockDelegate = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(findFirstResult),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockPrisma = { novedad: mockDelegate };

  const mockScopeHolder = {
    current: () => ({
      userId: 'user-1',
      role: 'SUPERVISOR',
      supervisorId: 'sup-s1',
      zoneId: 'zone-z1',
    }),
  };

  // We need to spy on findFirstScoped since that's what we assert is called
  // Instead, we spy on the underlying prisma.novedad.findFirst
  const repo = new ScopedNovedadRepository(
    mockPrisma as unknown as import('../../../database/prisma.service').PrismaService,
    mockScopeHolder as unknown as import('../../auth/domain/scope-context').ScopeContextHolder,
  );

  return { repo, mockDelegate };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScopedNovedadRepository', () => {
  describe('findByClientRef', () => {
    it('T-11 — calls findFirstScoped with { where: { clientRef } } and returns result', async () => {
      const existing = makeNovedad({ clientRef: 'uuid-x' });
      const { repo, mockDelegate } = makeRepo(existing);

      const result = await repo.findByClientRef('uuid-x');

      // findFirst is the underlying DB call made by findFirstScoped
      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      const callArg = (mockDelegate.findFirst as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      // findFirstScoped merges scope into an AND array — assert clientRef appears in it
      const where = callArg.where as Record<string, unknown>;
      const andClauses = where.AND as Record<string, unknown>[] | undefined;
      // clientRef must be present either directly or inside the AND array
      const hasClientRef = andClauses
        ? andClauses.some((c) => c.clientRef === 'uuid-x')
        : where.clientRef === 'uuid-x';
      expect(hasClientRef).toBe(true);
      expect(result).toEqual(existing);
    });

    it('returns null when clientRef not found in scope', async () => {
      const { repo, mockDelegate } = makeRepo(null);

      const result = await repo.findByClientRef('uuid-missing');

      expect(mockDelegate.findFirst).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('persists clientRef when provided in data', async () => {
      const mockDelegate = {
        create: jest.fn().mockResolvedValue(makeNovedad({ clientRef: 'uuid-y' })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      };
      const mockPrisma = { novedad: mockDelegate };
      const mockScopeHolder = {
        current: () => ({ userId: 'u', role: 'SUPERVISOR', supervisorId: 's', zoneId: 'z' }),
      };

      const repo = new ScopedNovedadRepository(
        mockPrisma as unknown as import('../../../database/prisma.service').PrismaService,
        mockScopeHolder as unknown as import('../../auth/domain/scope-context').ScopeContextHolder,
      );

      await repo.create({
        attendanceId: 'att-1',
        supervisorId: 'sup-s1',
        zoneId: 'zone-z1',
        horasExtra: '2.00',
        clientRef: 'uuid-y',
      });

      expect(mockDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientRef: 'uuid-y' }),
        }),
      );
    });

    it('passes clientRef as null when not provided in data', async () => {
      const mockDelegate = {
        create: jest.fn().mockResolvedValue(makeNovedad()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      };
      const mockPrisma = { novedad: mockDelegate };
      const mockScopeHolder = {
        current: () => ({ userId: 'u', role: 'SUPERVISOR', supervisorId: 's', zoneId: 'z' }),
      };

      const repo = new ScopedNovedadRepository(
        mockPrisma as unknown as import('../../../database/prisma.service').PrismaService,
        mockScopeHolder as unknown as import('../../auth/domain/scope-context').ScopeContextHolder,
      );

      await repo.create({
        attendanceId: 'att-1',
        supervisorId: 'sup-s1',
        zoneId: 'zone-z1',
        horasExtra: '1.00',
      });

      expect(mockDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientRef: null }),
        }),
      );
    });
  });
});
