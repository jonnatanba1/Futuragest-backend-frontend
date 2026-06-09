/**
 * T-09 RED → T-10 GREEN: ScopedAttendanceRepository unit spec.
 *
 * Covers:
 * - findByCheckOutClientRef: delegates to findFirstScoped with { checkOutClientRef }
 * - findByOperarioAndDate: delegates to findFirstScoped with { operarioId, date }
 *
 * Pattern mirrors scoped-novedad.repository.spec.ts (created in PR-A).
 * findFirstScoped merges scope filter as AND clause, so assertions check
 * that the WHERE passed to the delegate includes the expected fields.
 */

import { ScopedAttendanceRepository } from './scoped-attendance.repository';
import type { Attendance } from '@prisma/client';

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-05-31',
    checkInCapturedAt: new Date(),
    checkInReceivedAt: new Date(),
    checkInLat: 7.5,
    checkInLng: -76.5,
    checkInAccuracy: 10,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    signatureKey: 'sig-key',
    checkOutSignatureKey: null,
    clientRef: 'REF-A',
    checkOutClientRef: 'CREF-Z',
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(findFirstResult: Attendance | null) {
  const delegate = {
    findFirst: jest.fn().mockResolvedValue(findFirstResult),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  };

  const scopeHolder = {
    current: () => ({ role: 'SUPERVISOR', supervisorId: 'S1', zoneId: 'Z1', userId: 'U1' }),
  };

  // Provide a minimal PrismaService-like object
  const prisma = { attendance: delegate } as any;
  const repo = new ScopedAttendanceRepository(
    prisma,
    scopeHolder as unknown as import('../../auth/domain/scope-context').ScopeContextHolder,
  );

  return { repo, delegate };
}

describe('ScopedAttendanceRepository — PR-B additions', () => {
  describe('findByCheckOutClientRef', () => {
    it('returns attendance when found by checkOutClientRef', async () => {
      const att = makeAttendance({ checkOutClientRef: 'CREF-Z' });
      const { repo, delegate } = makeRepo(att);

      const result = await repo.findByCheckOutClientRef('CREF-Z');

      expect(result).toBe(att);
      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
      // The WHERE clause must include checkOutClientRef
      const callArg = delegate.findFirst.mock.calls[0][0];
      const whereStr = JSON.stringify(callArg.where);
      expect(whereStr).toContain('checkOutClientRef');
      expect(whereStr).toContain('CREF-Z');
    });

    it('returns null when not found', async () => {
      const { repo } = makeRepo(null);
      const result = await repo.findByCheckOutClientRef('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('findByOperarioAndDate', () => {
    it('returns attendance when found by operarioId+date', async () => {
      const att = makeAttendance({ operarioId: 'O1', date: '2026-05-31' });
      const { repo, delegate } = makeRepo(att);

      const result = await repo.findByOperarioAndDate('O1', '2026-05-31');

      expect(result).toBe(att);
      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
      const callArg = delegate.findFirst.mock.calls[0][0];
      const whereStr = JSON.stringify(callArg.where);
      expect(whereStr).toContain('operarioId');
      expect(whereStr).toContain('O1');
      expect(whereStr).toContain('date');
      expect(whereStr).toContain('2026-05-31');
    });

    it('returns null when not found', async () => {
      const { repo } = makeRepo(null);
      const result = await repo.findByOperarioAndDate('UNKNOWN', '2026-01-01');
      expect(result).toBeNull();
    });
  });

  // ── Delta ?since= branch (sync-delta-pull) ───────────────────────────────────

  describe('findMany (with optional since)', () => {
    it('SD-REPO-01: calls findManyScoped with empty where when since is undefined', async () => {
      const { repo, delegate } = makeRepo(null);
      await repo.findMany(undefined);
      expect(delegate.findMany).toHaveBeenCalledTimes(1);
      const callArg = delegate.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('updatedAt');
    });

    it('SD-REPO-02: calls findManyScoped with updatedAt.gte when since is provided', async () => {
      const { repo, delegate } = makeRepo(null);
      const since = new Date('2026-05-31T12:00:00.000Z');
      await repo.findMany(since);
      expect(delegate.findMany).toHaveBeenCalledTimes(1);
      const callArg = delegate.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(callArg.where);
      expect(whereStr).toContain('updatedAt');
      expect(whereStr).toContain('gte');
    });
  });
});
