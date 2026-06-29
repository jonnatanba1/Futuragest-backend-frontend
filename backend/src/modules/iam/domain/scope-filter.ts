/**
 * T4.5 — RBAC scope-filter (SECURITY CRITICAL).
 *
 * applyScopeFilter is a PURE, FAIL-CLOSED function that translates a
 * ScopeContext + model key into a Prisma where-clause fragment.
 *
 * Security invariants (MUST NEVER be relaxed):
 *  1. Missing scope map for a scoped role → throw MissingScopeMapError (not pass-through).
 *  2. Scoped role missing its scope key (zoneId / supervisorId) → { id: { in: [] } } (zero rows, structurally impossible).
 *  3. Unknown role (not in GLOBAL_ROLES, not COORDINADOR, not SUPERVISOR) → fail-closed.
 *  4. Global roles (see GLOBAL_ROLES) → pass-through the base where unchanged.
 *
 * S1 — Denial sentinel: we use { id: { in: [] } } instead of { id: '__deny__' } so denial
 * never relies on string value uniqueness. An empty IN list is structurally impossible to
 * satisfy, regardless of actual data.
 *
 * Adding a new scoped model: add an entry to SCOPE_MAPS. Forgetting it is a
 * compile-time miss but the runtime throws MissingScopeMapError immediately on
 * first scoped query — easier to catch in testing than a silent data leak.
 */

import type { ScopeContext, Role } from '../../auth/domain/scope-context';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class MissingScopeMapError extends Error {
  constructor(model: string) {
    super(
      `[scope-filter] No SCOPE_MAPS entry for model "${model}". ` +
        `Add an entry to SCOPE_MAPS or mark the model as explicitly unscoped. ` +
        `This is a programmer error — the filter fails closed to prevent data leaks.`,
    );
    this.name = 'MissingScopeMapError';
  }
}

// ---------------------------------------------------------------------------
// Scope map type
// ---------------------------------------------------------------------------

/**
 * Describes how a single Prisma model reaches Zone and Supervisor scopes.
 *
 * zonePath: returns a Prisma where-fragment that constrains this model to a single zone.
 * supervisorPath: returns a Prisma where-fragment that constrains this model to a single supervisor.
 */
interface ScopeMap {
  zonePath: (zoneId: string) => object;
  supervisorPath: (supervisorId: string) => object;
}

// ---------------------------------------------------------------------------
// SCOPE_MAPS — one entry per scoped model
// ---------------------------------------------------------------------------
// Extend this table when adding new scoped models.
// Models NOT listed here are assumed global (no row-level scoping needed).
// Attempting to filter an unlisted model from a scoped role → MissingScopeMapError.

export const SCOPE_MAPS: Record<string, ScopeMap> = {
  /**
   * Supervisor is directly scoped by zoneId (denormalized on the entity).
   * SUPERVISOR sees only their own entity row.
   */
  Supervisor: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: (supervisorId) => ({ id: supervisorId }),
  },

  /**
   * Operario is owned by a Supervisor; scope reaches Zone via supervisor.zoneId.
   */
  Operario: {
    zonePath: (zoneId) => ({ supervisor: { zoneId } }),
    supervisorPath: (supervisorId) => ({ supervisorId }),
  },

  /**
   * Assignment has a denormalized zoneId column for efficient filtering.
   * SUPERVISOR sees only assignments for their operarios.
   */
  Assignment: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: (supervisorId) => ({ supervisorId }),
  },

  /**
   * Municipio is scoped by zone only (supervisors don't own municipios).
   * SUPERVISOR has no direct municipio scope — deny via impossible predicate.
   */
  Municipio: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: () => ({ id: { in: [] } }), // SUPERVISOR → structurally-impossible deny
  },

  /**
   * Zone is scoped by the zone's own id.
   * COORDINADOR sees only their own zone row (self-id zonePath).
   * SUPERVISOR has no zone-level read permission — deny via impossible predicate.
   */
  Zone: {
    zonePath: (zoneId) => ({ id: zoneId }),
    supervisorPath: () => ({ id: { in: [] } }), // SUPERVISOR → structurally-impossible deny
  },

  /**
   * Attendance has a denormalized zoneId for efficient COORDINADOR filtering.
   * SUPERVISOR sees only their own attendance records.
   */
  Attendance: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: (supervisorId) => ({ supervisorId }),
  },

  /**
   * Novedad (overtime novelty) has denormalized zoneId + supervisorId columns.
   * SUPERVISOR sees only their own novedades.
   * COORDINADOR sees all novedades in their zone (cross-supervisor).
   * LIDER_OPERATIVO/SYSTEM_ADMIN → global (pass-through via GLOBAL_ROLES).
   */
  Novedad: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: (supervisorId) => ({ supervisorId }),
  },

  /**
   * CompensationPeriod (immutable fortnight-close snapshot) has denormalized
   * zoneId + supervisorId columns — same pattern as Attendance and Novedad.
   * COORDINATOR sees all periods in their zone; SUPERVISOR sees only their own.
   * Missing entry → MissingScopeMapError (fail-closed).
   */
  CompensationPeriod: {
    zonePath: (zoneId) => ({ zoneId }),
    supervisorPath: (supervisorId) => ({ supervisorId }),
  },
};

// ---------------------------------------------------------------------------
// Global roles — see all rows, no zone/supervisor restriction
// ---------------------------------------------------------------------------

const GLOBAL_ROLES: Role[] = ['SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'];

// The Montería coordinador (LIDER_OPERATIVO) is included in GLOBAL_ROLES
// because the design spec §3.1 confirms global-scope roles include Montería.

// ---------------------------------------------------------------------------
// applyScopeFilter — the single choke point
// ---------------------------------------------------------------------------

/**
 * Returns a Prisma where-clause fragment that enforces row-level visibility
 * for the given ScopeContext and model.
 *
 * @param ctx     - Immutable ScopeContext built by AuthGuard from verified JWT.
 * @param model   - Prisma model name (e.g. 'Supervisor', 'Operario').
 * @param where   - Optional base where-clause to AND with the scope restriction.
 * @returns       - A Prisma-compatible where object combining base + scope.
 *
 * Fail-closed rules:
 *   - Unknown model for a scoped role → throws MissingScopeMapError.
 *   - COORDINADOR without zoneId → { AND: [where, { id: { in: [] } }] } (structurally impossible, zero rows).
 *   - SUPERVISOR without supervisorId → { AND: [where, { id: { in: [] } }] } (structurally impossible, zero rows).
 *   - Unknown/future roles → fail-closed (treated as scoped with no key).
 */

/**
 * Structurally-impossible denial predicate (S1).
 * An empty IN list can never match any row, regardless of actual data values.
 * This is safer than { id: '__deny__' } which relies on value uniqueness.
 */
const DENY_PREDICATE = { id: { in: [] as string[] } } as const;

export function applyScopeFilter(ctx: ScopeContext, model: string, where: object = {}): object {
  // ── Global roles: no row restriction ──────────────────────────────────────
  if (GLOBAL_ROLES.includes(ctx.role)) {
    return where;
  }

  // ── Scoped roles: look up scope map ───────────────────────────────────────
  const map = SCOPE_MAPS[model];
  if (!map) {
    // Fail closed: a scoped role querying an unmapped model is a programming error.
    throw new MissingScopeMapError(model);
  }

  // ── COORDINADOR → scope by zone ───────────────────────────────────────────
  if (ctx.role === 'COORDINADOR') {
    if (ctx.zoneId) {
      return { AND: [where, map.zonePath(ctx.zoneId)] };
    }
    // Missing zoneId → fail closed (S1: structurally-impossible predicate)
    return { AND: [where, DENY_PREDICATE] };
  }

  // ── SUPERVISOR → scope by supervisor identity ─────────────────────────────
  if (ctx.role === 'SUPERVISOR') {
    if (ctx.supervisorId) {
      return { AND: [where, map.supervisorPath(ctx.supervisorId)] };
    }
    // Missing supervisorId → fail closed (S1: structurally-impossible predicate)
    return { AND: [where, DENY_PREDICATE] };
  }

  // ── Unknown/future roles → fail closed ───────────────────────────────────
  // Any role not explicitly handled above is denied — never pass-through.
  return { AND: [where, DENY_PREDICATE] };
}
