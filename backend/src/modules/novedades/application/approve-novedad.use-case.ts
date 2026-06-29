/**
 * ApproveNovedadUseCase — approves a PENDING novedad.
 *
 * Business rules (spec REQ-08, INV-05):
 * - Novedad must exist in scope → else 404 (NovedadNotFoundError)
 * - Status must be PENDING → else 409 (ImmutableNovedadError)
 * - approvedByUserId = ctx.userId from JWT (NEVER from body)
 * - decidedAt = server clock (new Date())
 *
 * Role gate: LIDER_OPERATIVO or SYSTEM_ADMIN — enforced at controller level.
 * LIDER_OPERATIVO is GLOBAL → findByIdScoped returns all novedades (pass-through).
 *
 * REQUEST-scoped: reads ScopeContextHolder per request.
 */

import type { Novedad, VerificationMethod } from '@prisma/client';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { NovedadNotFoundError, ImmutableNovedadError } from '../domain/novedad.errors';

export class ApproveNovedadUseCase {
  constructor(
    private readonly novedadRepo: NovedadRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  async execute(novedadId: string, verification?: VerificationMethod): Promise<Novedad> {
    // 1. Find novedad in scope (LIDER_OPERATIVO/SYSTEM_ADMIN → global pass-through)
    const novedad = await this.novedadRepo.findByIdScoped(novedadId);
    if (!novedad) {
      throw new NovedadNotFoundError(novedadId);
    }

    // 2. Assert PENDING → else immutable (INV-05)
    if (novedad.status !== 'PENDING') {
      throw new ImmutableNovedadError(novedadId);
    }

    // 3. Update status — approvedByUserId from JWT, decidedAt = server clock
    // Audit label only — no authorization logic may depend on decisionVerification.
    const ctx = this.scopeHolder.current();
    return this.novedadRepo.updateStatus(novedadId, {
      status: 'APPROVED',
      approvedByUserId: ctx.userId,
      decidedAt: new Date(),
      decisionVerification: verification ?? null,
    });
  }
}
