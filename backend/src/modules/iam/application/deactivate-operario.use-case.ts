/**
 * T-15 — DeactivateOperarioUseCase.
 *
 * Sets deactivatedAt = now() on an operario (soft deactivation).
 * Per spec: 409 if already inactive (NOT idempotent).
 * Per spec: 404 if not found or out of scope.
 *
 * Covers: OP-44, OP-45, OP-27, REQ-06.
 */

import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import type { OperarioDto } from '@futuragest/contracts';
import { AlreadyInactiveError, OperarioNotFoundError } from '../domain/operario.errors';

export class DeactivateOperarioUseCase {
  constructor(private readonly repo: OperarioRepositoryPort) {}

  async execute(operarioId: string): Promise<OperarioDto> {
    const operario = await this.repo.findByIdScoped(operarioId);

    if (!operario) {
      throw new OperarioNotFoundError(operarioId);
    }

    if (operario.deactivatedAt !== null) {
      // Already inactive — spec says 409, NOT idempotent 200
      throw new AlreadyInactiveError(operarioId);
    }

    const updated = await this.repo.setDeactivatedAt(operarioId, new Date());

    return {
      id: updated.id,
      fullName: updated.fullName,
      documento: updated.documento,
      supervisorId: updated.supervisorId,
      cargo: updated.cargo,
      active: updated.deactivatedAt === null,
      deactivatedAt: updated.deactivatedAt ? updated.deactivatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
