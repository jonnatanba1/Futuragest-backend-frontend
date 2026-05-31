/**
 * T-20 — Unit tests for ScopedMunicipioRepository.
 *
 * Written FIRST (TDD red phase) — fails before the repository exists.
 *
 * Verifies:
 * - COORDINADOR with zoneId → applyScopeFilter returns { zoneId } where-fragment
 *   (uses SCOPE_MAPS.Municipio zonePath).
 * - SUPERVISOR → structural deny { id: { in: [] } } (supervisorPath returns impossible predicate).
 * - GLOBAL_ROLES → pass-through.
 * - Unknown role "GHOST" → structural deny (fail-closed, INV-01).
 */

import { ScopedMunicipioRepository } from './scoped-municipio.repository';
import { applyScopeFilter } from '../domain/scope-filter';
import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';

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

function makePrisma(delegate: FakeDelegate): { municipio: FakeDelegate } {
  return { municipio: delegate };
}

const ZONE_ID = 'zone-uraba-uuid';
const SUPERVISOR_ID = 'sup-uuid-1';

// ─── COORDINADOR with zoneId ─────────────────────────────────────────────────

describe('ScopedMunicipioRepository — COORDINADOR with zoneId', () => {
  it('findMany passes { zoneId } where-fragment to the delegate', async () => {
    const delegate = makeDelegate([]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'COORDINADOR', zoneId: ZONE_ID };
    const repo = new ScopedMunicipioRepository(makePrisma(delegate) as any, makeHolder(ctx));

    await repo.findMany();

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: applyScopeFilter(ctx, 'Municipio', {}),
      }),
    );
    // The filter must contain the zone constraint
    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ zoneId: ZONE_ID }]),
    });
  });
});

// ─── COORDINATOR missing zoneId → structural deny ────────────────────────────

describe('ScopedMunicipioRepository — COORDINADOR missing zoneId (structural deny)', () => {
  it('findMany produces { id: { in: [] } } (INV-01 fail-closed)', async () => {
    const delegate = makeDelegate([]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'COORDINADOR' }; // no zoneId
    const repo = new ScopedMunicipioRepository(makePrisma(delegate) as any, makeHolder(ctx));

    await repo.findMany();

    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: [] } }]),
    });
  });
});

// ─── SUPERVISOR → structural deny ────────────────────────────────────────────

describe('ScopedMunicipioRepository — SUPERVISOR (structural deny)', () => {
  it('SUPERVISOR → findMany produces { id: { in: [] } }', async () => {
    const delegate = makeDelegate([]);
    const ctx: ScopeContext = { userId: 'u-1', role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID };
    const repo = new ScopedMunicipioRepository(makePrisma(delegate) as any, makeHolder(ctx));

    await repo.findMany();

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: applyScopeFilter(ctx, 'Municipio', {}),
      }),
    );
    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: [] } }]),
    });
  });
});

// ─── GLOBAL_ROLES → pass-through ─────────────────────────────────────────────

describe('ScopedMunicipioRepository — GLOBAL_ROLES pass-through', () => {
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
      const repo = new ScopedMunicipioRepository(makePrisma(delegate) as any, makeHolder(ctx));

      await repo.findMany();

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  }
});

// ─── Unknown role → structural deny (fail-closed) ────────────────────────────

describe('ScopedMunicipioRepository — unknown role (fail-closed)', () => {
  it('role "GHOST" → structural deny { id: { in: [] } }', async () => {
    const delegate = makeDelegate([]);
    const ctx = { userId: 'u-1', role: 'GHOST' } as unknown as ScopeContext;
    const repo = new ScopedMunicipioRepository(makePrisma(delegate) as any, makeHolder(ctx));

    await repo.findMany();

    const callArg = (delegate.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: [] } }]),
    });
  });
});
