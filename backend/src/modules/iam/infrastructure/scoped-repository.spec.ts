/**
 * W4 — ScopedRepository nested include leak guard unit tests.
 *
 * Proves that findManyScoped / findFirstScoped REJECT includes of scoped
 * relations (fail-closed) instead of silently leaking unfiltered rows.
 *
 * Also proves that non-scoped includes are allowed through.
 *
 * TDD: these tests were written BEFORE the assertNoScopedIncludeLeak implementation.
 */

import { ScopedRepository, ScopedIncludeLeakError } from './scoped-repository';
import { applyScopeFilter } from '../domain/scope-filter';
import type { ScopeContext, ScopeContextHolder } from '../../auth/domain/scope-context';

// ─── Test double: concrete ScopedRepository subclass ─────────────────────────

interface FakeDelegate {
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown | null>;
}

class FakeSupervisorRepository extends ScopedRepository<FakeDelegate, { id: string }> {
  protected readonly model = 'Supervisor';
}

function makeHolder(ctx: ScopeContext): ScopeContextHolder {
  return {
    current: () => ctx,
    set: () => {},
  } as unknown as ScopeContextHolder;
}

function makeDelegate(rows: unknown[] = []): FakeDelegate {
  return {
    findMany: jest.fn().mockResolvedValue(rows),
    findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
  };
}

const coordCtx: ScopeContext = {
  userId: 'user-1',
  role: 'COORDINADOR',
  zoneId: 'zone-A',
};

// ─── W4: include guard — scoped relation rejected ─────────────────────────────

describe('ScopedRepository W4 — nested include leak guard', () => {
  it('findManyScoped throws ScopedIncludeLeakError when include references a scoped relation (operarios)', async () => {
    const delegate = makeDelegate([]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    await expect(
      repo.findManyScoped({ include: { operarios: true } }),
    ).rejects.toThrow(ScopedIncludeLeakError);
  });

  it('findManyScoped throws ScopedIncludeLeakError when include references "supervisor" (scoped)', async () => {
    const delegate = makeDelegate([]);
    // Use a fresh repo representing the Operario model with an include of supervisor
    class FakeOperarioRepo extends ScopedRepository<FakeDelegate, { id: string }> {
      protected readonly model = 'Operario';
    }
    const repo = new FakeOperarioRepo(delegate, makeHolder(coordCtx));

    await expect(
      repo.findManyScoped({ include: { supervisor: true } }),
    ).rejects.toThrow(ScopedIncludeLeakError);
  });

  it('findFirstScoped throws ScopedIncludeLeakError when include references a scoped relation', async () => {
    const delegate = makeDelegate([{ id: 'sup-1' }]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    await expect(
      repo.findFirstScoped({ where: { id: 'sup-1' }, include: { operarios: true } }),
    ).rejects.toThrow(ScopedIncludeLeakError);
  });

  it('findManyScoped allows include of NON-scoped relations (e.g. user, municipio zone link)', async () => {
    const delegate = makeDelegate([{ id: 'sup-1', userId: 'u-1' }]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    // 'user' is NOT in SCOPE_MAPS — it should be allowed through
    await expect(
      repo.findManyScoped({ include: { user: true } }),
    ).resolves.toBeDefined();
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { user: true } }),
    );
  });

  it('findManyScoped throws ScopedIncludeLeakError when select references a scoped relation', async () => {
    const delegate = makeDelegate([]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    await expect(
      repo.findManyScoped({ select: { id: true, operarios: true } }),
    ).rejects.toThrow(ScopedIncludeLeakError);
  });

  it('error message identifies both parent model and leaked relation', async () => {
    const delegate = makeDelegate([]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    let caughtError: unknown = null;
    try {
      await repo.findManyScoped({ include: { operarios: true } });
      throw new Error('Expected ScopedIncludeLeakError but promise resolved');
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ScopedIncludeLeakError);
    const msg = (caughtError as Error).message;
    expect(msg).toContain('Supervisor');
    expect(msg).toContain('operarios');
  });
});

// ─── Baseline: scope filter still applied even when no include ────────────────

describe('ScopedRepository baseline — scope filter applied on findManyScoped', () => {
  it('injects COORDINADOR zone filter into findMany args', async () => {
    const delegate = makeDelegate([]);
    const repo = new FakeSupervisorRepository(delegate, makeHolder(coordCtx));

    await repo.findManyScoped({ where: { area: 'BARRIDO' } });

    expect(delegate.findMany).toHaveBeenCalledWith({
      where: applyScopeFilter(coordCtx, 'Supervisor', { area: 'BARRIDO' }),
    });
  });
});
