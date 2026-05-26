/**
 * T4.6 — ScopedRepository abstract base class.
 *
 * Forces EVERY scoped read through applyScopeFilter. A developer extending
 * this class cannot issue an unfiltered findMany/findFirst for a scoped model
 * because the base methods are the only sanctioned read path.
 *
 * DI: The ScopeContextHolder is injected by NestJS into the concrete subclass
 * constructor and passed to super(). The holder is request-scoped.
 *
 * Design §3.3 implementation.
 *
 * W4 fix — Nested include guard:
 * If an include/select arg references a scoped relation by name, the base class
 * throws ScopedIncludeLeakError (fail-closed). The scoped relation names are
 * declared by each concrete subclass via SCOPED_INCLUDE_KEYS.
 *
 * Rationale: an include:{operarios:true} on a Supervisor query bypasses applyScopeFilter
 * for the nested operarios — they come back unfiltered. Rather than silently leaking,
 * we reject the call so the developer is forced to make a separate scoped query.
 */

import { applyScopeFilter, SCOPE_MAPS } from '../domain/scope-filter';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

// ---------------------------------------------------------------------------
// Error type for include/select leak guard (W4)
// ---------------------------------------------------------------------------

/**
 * Thrown when a scoped repository call includes a relation that is itself a
 * scoped model without independently re-applying scope filtering.
 * This is fail-closed: the developer must issue a separate scoped query for
 * the nested model rather than relying on an unscoped include.
 */
export class ScopedIncludeLeakError extends Error {
  constructor(parentModel: string, leakedRelation: string) {
    super(
      `[scoped-repository] Blocked include of scoped relation "${leakedRelation}" from "${parentModel}". ` +
        `Including a scoped model relation bypasses applyScopeFilter for that relation's rows — ` +
        `a security defect. Issue a separate ScopedRepository query for "${leakedRelation}" instead.`,
    );
    this.name = 'ScopedIncludeLeakError';
  }
}

/**
 * Minimal interface for a Prisma delegate that supports findMany and findFirst.
 * Using `unknown` for the return types to keep the base class generic — concrete
 * subclasses provide typed wrappers on top.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PrismaDelegate<TFindManyArgs = any, TFindFirstArgs = any> {
  findMany(args: TFindManyArgs): Promise<unknown[]>;
  findFirst(args: TFindFirstArgs): Promise<unknown | null>;
}

export abstract class ScopedRepository<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TDelegate extends PrismaDelegate<any, any>,
  TEntity,
> {
  /** Prisma model name — must match a key in SCOPE_MAPS for scoped roles. */
  protected abstract readonly model: string;

  constructor(
    protected readonly delegate: TDelegate,
    protected readonly scopeHolder: ScopeContextHolder,
  ) {}

  /**
   * Composes the scope restriction with any caller-supplied where clause.
   * This is the single authorised path for building a scoped where.
   */
  protected scopedWhere(where: object = {}): object {
    const ctx = this.scopeHolder.current();
    return applyScopeFilter(ctx, this.model, where);
  }

  /**
   * W4 guard: detect if args.include or args.select references a scoped relation.
   *
   * Scoped relation names are declared per-subclass via the optional `scopedRelations`
   * property. If not overridden, falls back to checking against SCOPE_MAPS model names
   * (singular lowercase, e.g. "operario") AND common pluralized forms (e.g. "operarios").
   *
   * Throws ScopedIncludeLeakError if a scoped relation is included without separate scoping.
   *
   * Why not use SCOPE_MAPS keys directly: Prisma relation field names on the parent model
   * (e.g. Supervisor.operarios) differ from the model name (Operario). We check both
   * singular and plural to catch both naming conventions.
   */
  protected get scopedRelations(): string[] {
    // Default: derive from SCOPE_MAPS keys — both singular lowercase and common plural forms
    return Object.keys(SCOPE_MAPS).flatMap((m) => {
      const singular = m.charAt(0).toLowerCase() + m.slice(1);
      const plural = singular + 's';
      return [singular, plural];
    });
  }

  protected assertNoScopedIncludeLeak(args: { include?: object; select?: object; [key: string]: unknown }): void {
    const guardedRelations = this.scopedRelations;

    for (const container of [args.include, args.select]) {
      if (!container) continue;
      for (const key of Object.keys(container)) {
        // If the include key is a known scoped model relation, reject it
        if (guardedRelations.includes(key)) {
          throw new ScopedIncludeLeakError(this.model, key);
        }
      }
    }
  }

  /**
   * Scoped findMany. Automatically injects the scope restriction.
   * Callers cannot bypass the filter — they must use this method or findFirstScoped.
   *
   * W4: Rejects (via rejected Promise) any args.include/select that references a
   * scoped relation. Declared async so a synchronous throw inside produces a
   * rejected Promise rather than an uncaught synchronous exception.
   */
  async findManyScoped(args: { where?: object; include?: object; select?: object; [key: string]: unknown } = {}): Promise<TEntity[]> {
    this.assertNoScopedIncludeLeak(args);
    const scopedArgs = { ...args, where: this.scopedWhere(args.where) };
    return this.delegate.findMany(scopedArgs) as Promise<TEntity[]>;
  }

  /**
   * Scoped findFirst. Returns null (not throws) when the row is out of scope —
   * callers should treat null as 404.
   *
   * W4: Rejects (via rejected Promise) any args.include/select that references a
   * scoped relation. Declared async so a synchronous throw inside produces a
   * rejected Promise rather than an uncaught synchronous exception.
   */
  async findFirstScoped(args: { where?: object; include?: object; select?: object; [key: string]: unknown } = {}): Promise<TEntity | null> {
    this.assertNoScopedIncludeLeak(args);
    const scopedArgs = { ...args, where: this.scopedWhere(args.where) };
    return this.delegate.findFirst(scopedArgs) as Promise<TEntity | null>;
  }
}
