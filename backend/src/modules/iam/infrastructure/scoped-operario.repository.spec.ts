/**
 * T-10 — Unit tests for ScopedOperarioRepository write methods (RED phase).
 *
 * Mocks PrismaService; asserts each method calls the correct Prisma delegate.
 */

import { ScopedOperarioRepository } from './scoped-operario.repository';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    operario: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'op-1', fullName: 'Test', documento: '123', supervisorId: 'sup-1', deactivatedAt: null, createdAt: new Date(), assignments: [], attendances: [] }),
      update: jest.fn().mockResolvedValue({ id: 'op-1', fullName: 'Test', documento: '123', supervisorId: 'sup-1', deactivatedAt: new Date(), createdAt: new Date() }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    supervisor: {
      findFirst: jest.fn().mockResolvedValue({ id: 'sup-1' }),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.resolve(ops.map(() => ({ id: 'op-x' })));
      }
      return Promise.resolve(ops);
    }),
  } as any;
}

function makeHolder(role = 'SYSTEM_ADMIN'): ScopeContextHolder {
  return {
    current: () => ({ role, supervisorId: null, zoneId: null }),
  } as unknown as ScopeContextHolder;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScopedOperarioRepository — write methods', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ScopedOperarioRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ScopedOperarioRepository(prisma as any, makeHolder());
  });

  describe('create', () => {
    it('calls prisma.operario.create with data and deactivatedAt:null', async () => {
      await repo.create({ fullName: 'Ana', documento: '111', supervisorId: 'sup-1' });
      expect(prisma.operario.create).toHaveBeenCalledWith({
        data: { fullName: 'Ana', documento: '111', supervisorId: 'sup-1', deactivatedAt: null },
      });
    });
  });

  describe('findByDocumento', () => {
    it('calls prisma.operario.findUnique with where.documento', async () => {
      await repo.findByDocumento('999999');
      expect(prisma.operario.findUnique).toHaveBeenCalledWith({ where: { documento: '999999' } });
    });

    it('returns null when not found', async () => {
      prisma.operario.findUnique.mockResolvedValue(null);
      const result = await repo.findByDocumento('notexist');
      expect(result).toBeNull();
    });
  });

  describe('findByIdScoped', () => {
    it('delegates to findFirstScoped (calls findFirst on delegate)', async () => {
      prisma.operario.findFirst.mockResolvedValue({ id: 'op-1' });
      const result = await repo.findByIdScoped('op-1');
      expect(prisma.operario.findFirst).toHaveBeenCalled();
      expect(result).toEqual({ id: 'op-1' });
    });
  });

  describe('setDeactivatedAt', () => {
    it('calls prisma.operario.update with deactivatedAt date', async () => {
      const date = new Date('2026-06-01');
      await repo.setDeactivatedAt('op-1', date);
      expect(prisma.operario.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { deactivatedAt: date },
      });
    });

    it('calls prisma.operario.update with deactivatedAt null (reactivate)', async () => {
      await repo.setDeactivatedAt('op-1', null);
      expect(prisma.operario.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { deactivatedAt: null },
      });
    });
  });

  describe('resolveSupervisorByEmail', () => {
    it('calls prisma.supervisor.findFirst with user.email — no include on operario', async () => {
      const result = await repo.resolveSupervisorByEmail('sup@example.com');
      expect(prisma.supervisor.findFirst).toHaveBeenCalledWith({
        where: { user: { email: 'sup@example.com' } },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'sup-1' });
    });

    it('returns null when supervisor not found', async () => {
      prisma.supervisor.findFirst.mockResolvedValue(null);
      const result = await repo.resolveSupervisorByEmail('notfound@example.com');
      expect(result).toBeNull();
    });
  });

  describe('bulkCreate', () => {
    it('calls prisma.$transaction with array of create operations', async () => {
      const rows = [
        { fullName: 'Ana', documento: '111', supervisorId: 'sup-1' },
        { fullName: 'Luis', documento: '222', supervisorId: 'sup-1' },
      ];
      const count = await repo.bulkCreate(rows);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(count).toBe(2);
    });

    it('returns 0 for empty rows array', async () => {
      const count = await repo.bulkCreate([]);
      expect(count).toBe(0);
    });
  });
});

describe('ScopedOperarioRepository — isActive', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ScopedOperarioRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ScopedOperarioRepository(prisma as any, makeHolder());
  });

  it('returns true when operario found and deactivatedAt is null', async () => {
    prisma.operario.findFirst.mockResolvedValue({ id: 'op-1', deactivatedAt: null });
    const result = await repo.isActive('op-1');
    expect(result).toBe(true);
  });

  it('returns false when operario found and deactivatedAt is set', async () => {
    prisma.operario.findFirst.mockResolvedValue({ id: 'op-1', deactivatedAt: new Date() });
    const result = await repo.isActive('op-1');
    expect(result).toBe(false);
  });

  it('returns null when operario not found', async () => {
    prisma.operario.findFirst.mockResolvedValue(null);
    const result = await repo.isActive('op-not-found');
    expect(result).toBeNull();
  });
});
