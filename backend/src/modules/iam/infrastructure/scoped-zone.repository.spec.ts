/**
 * T-10 — Unit tests for ScopedZoneRepository.
 *
 * Written FIRST (TDD red phase) — fails before the repository and Zone entry
 * in SCOPE_MAPS exist.
 *
 * Verifies:
 * - COORDINADOR with zoneId → applyScopeFilter returns { id: zoneId } where-fragment.
 * - COORDINADOR missing zoneId claim → structural deny { id: { in: [] } }.
 * - GLOBAL_ROLES (SYSTEM_ADMIN) → pass-through (no where restriction).
 * - Unknown role "GHOST" → structural deny (fail-closed, INV-01).
 */

import { ScopedZoneRepository } from './scoped-zone.repository';
import { applyScopeFilter } from '../domain/scope-filter';
import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';
import type { PrismaService } from '../../../database/prisma.service';

// ─── Test doubles ────────────────────────────────────────────────────────────

interface FakeDelegate {
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown | null>;
}

function makeDelegate(rows: unknown[] = []): FakeDelegate {
  return {
    findMany: jest.fn().mockResolvedValue(rows),
    findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
  };
}

function makeHolder(ctx: ScopeContext): ScopeContextHolder {
  return {
    current: () => ctx,
    set: () => {},
  } as unknown as ScopeContextHolder;
}

/**
 * Fake PrismaService subset that exposes only the zone delegate.
 * Matches how ScopedZoneRepository consumes PrismaService (prisma.zone).
 */
function makePrisma(delegate: FakeDelegate): { zone: FakeDelegate } {
  return { zone: delegate };
}

const ZONE_ID = 'zone-uraba-uuid';

// ─── COORDINADOR with zoneId ─────────────────────────────────────────────────

describe('ScopedZoneRepository — COORDINADOR with zoneId', () => {
  it('findMany passes { id: zoneId } where-fragment to the delegate', async () => {
    const delegate = makeDelegate([]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'COORDINADOR', zoneId: ZONE_ID };
    const repo = new ScopedZoneRepository(makePrisma(delegate) as unknown as PrismaService, makeHolder(ctx));

    await repo.findMany();

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: applyScopeFilter(ctx, 'Zone', {}),
      }),
    );
  });

  it('findById scopes correctly via findFirstScoped', async () => {
    const delegate = makeDelegate([{ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date() }]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'COORDINADOR', zoneId: ZONE_ID };
    const repo = new ScopedZoneRepository(makePrisma(delegate) as unknown as PrismaService, makeHolder(ctx));

    await repo.findById(ZONE_ID);

    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: applyScopeFilter(ctx, 'Zone', { id: ZONE_ID }),
      }),
    );
  });
});

// ─── COORDINADOR missing zoneId → structural deny ────────────────────────────

describe('ScopedZoneRepository — COORDINADOR missing zoneId (structural deny)', () => {
  it('findMany produces { id: { in: [] } } (INV-01 fail-closed)', async () => {
    const delegate = makeDelegate([]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'COORDINADOR' }; // no zoneId
    const repo = new ScopedZoneRepository(makePrisma(delegate) as unknown as PrismaService, makeHolder(ctx));

    await repo.findMany();

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: applyScopeFilter(ctx, 'Zone', {}),
      }),
    );
    // The resulting where must be the structural-deny form (AND with impossible predicate)
    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: [] } }]),
    });
  });
});

// ─── GLOBAL_ROLES → pass-through ─────────────────────────────────────────────

describe('ScopedZoneRepository — GLOBAL_ROLES pass-through', () => {
  const globalRoles: ScopeContext['role'][] = [
    'SYSTEM_ADMIN',
    'GERENCIA',
    'TALENTO_HUMANO',
    'LIDER_OPERATIVO',
  ];

  for (const role of globalRoles) {
    it(`${role} → findMany called with empty where (no scope restriction)`, async () => {
      const delegate = makeDelegate([]);
      const ctx: ScopeContext = { userId: 'u-1', role };
      const repo = new ScopedZoneRepository(makePrisma(delegate) as unknown as PrismaService, makeHolder(ctx));

      await repo.findMany();

      // Global roles: where = {} (pass-through, base where unchanged)
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  }
});

// ─── Unknown role → structural deny (fail-closed) ────────────────────────────

describe('ScopedZoneRepository — unknown role (fail-closed)', () => {
  it('role "GHOST" → structural deny { id: { in: [] } }', async () => {
    const delegate = makeDelegate([]);
    const ctx = { userId: 'u-1', role: 'GHOST' } as unknown as ScopeContext;
    const repo = new ScopedZoneRepository(makePrisma(delegate) as unknown as PrismaService, makeHolder(ctx));

    await repo.findMany();

    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: [] } }]),
    });
  });
});
