/**
 * CancelNovedadUseCase — hard-deletes a PENDING novedad (cancel).
 *
 * Business rules (spec REQ-09, INV-05):
 * - Novedad must exist in scope AND supervisorId must match caller's supervisorId
 *   → else 404 (fail-closed — does not reveal existence to other supervisors)
 * - Status must be PENDING → else 409 (ImmutableNovedadError)
 * - On success: hard DELETE of the row (frees the partial-unique slot)
 * - Returns void (controller responds with 204)
 *
 * Role gate: SUPERVISOR only — enforced at controller level.
 * Double ownership check here as defense in depth (INV-05).
 *
 * REQUEST-scoped: reads ScopeContextHolder per request.
 */

import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { NovedadNotFoundError, ImmutableNovedadError } from '../domain/novedad.errors';

export class CancelNovedadUseCase {
  constructor(
    private readonly novedadRepo: NovedadRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  async execute(novedadId: string): Promise<void> {
    const ctx = this.scopeHolder.current();

    // 1. Find novedad in scope — scoped repo already applies SUPERVISOR filter by supervisorId
    const novedad = await this.novedadRepo.findByIdScoped(novedadId);
    if (!novedad) {
      throw new NovedadNotFoundError(novedadId);
    }

    // 2. Defense-in-depth ownership check (fail-closed)
    // The scoped repo should already filter by supervisorId for SUPERVISOR role,
    // but we double-check here to ensure a programming error doesn't silently bypass it.
    if (novedad.supervisorId !== ctx.supervisorId) {
      throw new NovedadNotFoundError(novedadId); // 404 — don't reveal existence
    }

    // 3. Assert PENDING → else immutable (INV-05)
    if (novedad.status !== 'PENDING') {
      throw new ImmutableNovedadError(novedadId);
    }

    // 4. Hard delete — frees the partial-unique slot for a new novedad after rejection
    await this.novedadRepo.delete(novedadId);
  }
}
