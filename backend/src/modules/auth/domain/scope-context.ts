/**
 * Auth domain — ScopeContext + ScopeContextHolder.
 *
 * ScopeContext is an immutable per-request object built ONCE by AuthGuard
 * from verified JWT claims and stored on the request via ScopeContextHolder.
 *
 * PR4 (RBAC scope-filter) will consume this to drive applyScopeFilter.
 * This file defines the shape and the request-scoped holder — PR4 implements
 * the filter logic itself.
 */

export type Role =
  | 'SYSTEM_ADMIN'
  | 'GERENCIA'
  | 'TALENTO_HUMANO'
  | 'LIDER_OPERATIVO'
  | 'COORDINADOR'
  | 'SUPERVISOR';

/**
 * Immutable per-request scope context.
 * Built from JWT claims by AuthGuard and held in ScopeContextHolder.
 */
export interface ScopeContext {
  readonly userId: string;
  readonly role: Role;
  readonly zoneId?: string; // present for COORDINADOR
  readonly supervisorId?: string; // present for SUPERVISOR
  readonly deviceId?: string; // the device that issued this request
}

/**
 * Request-scoped holder for ScopeContext.
 * AuthGuard populates this after validating the JWT.
 * PR4 repositories read from it via DI.
 */
export class ScopeContextHolder {
  private _context: ScopeContext | null = null;

  set(context: ScopeContext): void {
    this._context = context;
  }

  get(): ScopeContext | null {
    return this._context;
  }

  /**
   * Returns the context or throws if not yet populated.
   * Repositories (PR4) use this — it is safe because guards run before handlers.
   */
  current(): ScopeContext {
    if (!this._context) {
      throw new Error('ScopeContext has not been set. AuthGuard must run before repositories.');
    }
    return this._context;
  }
}

/** Injection token for ScopeContextHolder (request-scoped). */
export const SCOPE_CONTEXT_HOLDER = Symbol('SCOPE_CONTEXT_HOLDER');
