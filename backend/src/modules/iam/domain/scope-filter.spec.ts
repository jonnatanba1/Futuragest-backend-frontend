/**
 * T4.2 — Unit truth-table tests for applyScopeFilter.
 *
 * Tests ALL 6 roles × 3 scoped models × has-key / missing-key cases.
 * Written FIRST (TDD red phase). All FAIL before implementation.
 *
 * Verifies:
 * - Global roles (SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO) → pass-through
 * - COORDINADOR with zoneId → zonePath fragment applied
 * - COORDINADOR without zoneId → fail-closed ({ id: { in: [] } } — S1: structurally impossible)
 * - SUPERVISOR with supervisorId → supervisorPath fragment applied
 * - SUPERVISOR without supervisorId → fail-closed ({ id: { in: [] } } — S1: structurally impossible)
 * - Unknown model key → throws MissingScopeMapError
 */

import { applyScopeFilter, MissingScopeMapError } from './scope-filter';
import type { ScopeContext } from '../../auth/domain/scope-context';

const ZONE_ID = 'zone-uuid-123';
const SUPERVISOR_ID = 'sup-uuid-456';
const BASE_WHERE = { fullName: { contains: 'test' } };

function ctx(override: Partial<ScopeContext>): ScopeContext {
  return {
    userId: 'user-uuid',
    role: 'SYSTEM_ADMIN',
    ...override,
  };
}

// ─── Global roles ────────────────────────────────────────────────────────────

describe('applyScopeFilter — global roles (pass-through)', () => {
  const globalRoles = ['SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'] as const;
  const models = ['Supervisor', 'Operario', 'Assignment'] as const;

  for (const role of globalRoles) {
    for (const model of models) {
      it(`${role} × ${model} → returns base where unchanged`, () => {
        const result = applyScopeFilter(ctx({ role }), model, BASE_WHERE);
        expect(result).toEqual(BASE_WHERE);
      });
    }
  }
});

// ─── COORDINADOR ─────────────────────────────────────────────────────────────

describe('applyScopeFilter — COORDINADOR', () => {
  it('Supervisor model + zoneId → filters by zoneId', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }), 'Supervisor', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { zoneId: ZONE_ID }] });
  });

  it('Operario model + zoneId → filters via supervisor.zoneId', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }), 'Operario', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { supervisor: { zoneId: ZONE_ID } }] });
  });

  it('Assignment model + zoneId → filters by zoneId', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }), 'Assignment', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { zoneId: ZONE_ID }] });
  });

  it('Supervisor model + missing zoneId → fail-closed (S1: impossible predicate)', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR' /* no zoneId */ }), 'Supervisor', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('Operario model + missing zoneId → fail-closed', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR' }), 'Operario', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('Assignment model + missing zoneId → fail-closed', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR' }), 'Assignment', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });
});

// ─── SUPERVISOR ──────────────────────────────────────────────────────────────

describe('applyScopeFilter — SUPERVISOR', () => {
  it('Supervisor model + supervisorId → filters by own entity id', () => {
    const result = applyScopeFilter(
      ctx({ role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID }),
      'Supervisor',
      BASE_WHERE,
    );
    expect(result).toEqual({ AND: [BASE_WHERE, { id: SUPERVISOR_ID }] });
  });

  it('Operario model + supervisorId → filters by supervisorId', () => {
    const result = applyScopeFilter(
      ctx({ role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID }),
      'Operario',
      BASE_WHERE,
    );
    expect(result).toEqual({ AND: [BASE_WHERE, { supervisorId: SUPERVISOR_ID }] });
  });

  it('Assignment model + supervisorId → filters by supervisorId', () => {
    const result = applyScopeFilter(
      ctx({ role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID }),
      'Assignment',
      BASE_WHERE,
    );
    expect(result).toEqual({ AND: [BASE_WHERE, { supervisorId: SUPERVISOR_ID }] });
  });

  it('Supervisor model + missing supervisorId → fail-closed (S1: impossible predicate)', () => {
    const result = applyScopeFilter(ctx({ role: 'SUPERVISOR' /* no supervisorId */ }), 'Supervisor', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('Operario model + missing supervisorId → fail-closed', () => {
    const result = applyScopeFilter(ctx({ role: 'SUPERVISOR' }), 'Operario', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('Assignment model + missing supervisorId → fail-closed', () => {
    const result = applyScopeFilter(ctx({ role: 'SUPERVISOR' }), 'Assignment', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });
});

// ─── Missing scope map ────────────────────────────────────────────────────────

describe('applyScopeFilter — missing scope map', () => {
  it('throws MissingScopeMapError for unknown model (COORDINADOR)', () => {
    expect(() => {
      applyScopeFilter(ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }), 'UnknownModel', {});
    }).toThrow(MissingScopeMapError);
  });

  it('throws MissingScopeMapError for unknown model (SUPERVISOR)', () => {
    expect(() => {
      applyScopeFilter(ctx({ role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID }), 'GhostTable', {});
    }).toThrow(MissingScopeMapError);
  });

  // Global roles pass-through EVEN for unknown models (no filter needed)
  it('global role + unknown model → returns base where (no map needed)', () => {
    const result = applyScopeFilter(ctx({ role: 'GERENCIA' }), 'UnknownModel', BASE_WHERE);
    expect(result).toEqual(BASE_WHERE);
  });
});

// ─── Empty base where ────────────────────────────────────────────────────────

describe('applyScopeFilter — empty base where', () => {
  it('COORDINADOR + no base where → still applies zone filter', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }), 'Supervisor');
    expect(result).toEqual({ AND: [{}, { zoneId: ZONE_ID }] });
  });

  it('global role + no base where → returns empty object', () => {
    const result = applyScopeFilter(ctx({ role: 'SYSTEM_ADMIN' }), 'Supervisor');
    expect(result).toEqual({});
  });
});

// ─── NV-53, NV-54, NV-55: Novedad scope filter ──────────────────────────────

describe('applyScopeFilter — Novedad model (NV-53, NV-54, NV-55)', () => {
  it('NV-53 — SUPERVISOR missing supervisorId → DENY_PREDICATE (fail-closed)', () => {
    const result = applyScopeFilter(ctx({ role: 'SUPERVISOR' /* no supervisorId */ }), 'Novedad', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('NV-54 — COORDINADOR missing zoneId → DENY_PREDICATE (fail-closed)', () => {
    const result = applyScopeFilter(ctx({ role: 'COORDINADOR' /* no zoneId */ }), 'Novedad', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('NV-55 — LIDER_OPERATIVO → pass-through (global role, no restriction)', () => {
    const result = applyScopeFilter(ctx({ role: 'LIDER_OPERATIVO' }), 'Novedad', {});
    expect(result).toEqual({});
  });

  it('SUPERVISOR + supervisorId → filters by supervisorId', () => {
    const result = applyScopeFilter(
      ctx({ role: 'SUPERVISOR', supervisorId: SUPERVISOR_ID }),
      'Novedad',
      BASE_WHERE,
    );
    expect(result).toEqual({ AND: [BASE_WHERE, { supervisorId: SUPERVISOR_ID }] });
  });

  it('COORDINADOR + zoneId → filters by zoneId', () => {
    const result = applyScopeFilter(
      ctx({ role: 'COORDINADOR', zoneId: ZONE_ID }),
      'Novedad',
      BASE_WHERE,
    );
    expect(result).toEqual({ AND: [BASE_WHERE, { zoneId: ZONE_ID }] });
  });
});

// ─── W5: Unknown / unmapped role fail-closed ─────────────────────────────────
// Scenario #8 from design §8: a role not in GLOBAL_ROLES, COORDINADOR, or
// SUPERVISOR must NEVER pass-through — it must produce zero rows (fail-closed).
// This covers future roles or corrupted JWT claims.

describe('applyScopeFilter — unknown/unmapped role (W5: fail-closed)', () => {
  it('completely unknown role + Supervisor model → fail-closed impossible predicate', () => {
    // Cast to Role to simulate a future role not yet in the union type
    const result = applyScopeFilter(ctx({ role: 'FUTURE_ROLE' as never }), 'Supervisor', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('completely unknown role + Operario model → fail-closed impossible predicate', () => {
    const result = applyScopeFilter(ctx({ role: 'GHOST_ROLE' as never }), 'Operario', BASE_WHERE);
    expect(result).toEqual({ AND: [BASE_WHERE, { id: { in: [] } }] });
  });

  it('completely unknown role + no base where → fail-closed impossible predicate', () => {
    const result = applyScopeFilter(ctx({ role: 'FABRICATED_ROLE' as never }), 'Operario');
    expect(result).toEqual({ AND: [{}, { id: { in: [] } }] });
  });

  it('completely unknown role → does NOT throw MissingScopeMapError (fails closed with zero-rows instead)', () => {
    // Unknown role hits the catch-all return before map lookup for unknown model
    // For a KNOWN model, unknown role should fail closed (not throw)
    expect(() => {
      applyScopeFilter(ctx({ role: 'MADE_UP' as never }), 'Supervisor', {});
    }).not.toThrow();
  });
});
