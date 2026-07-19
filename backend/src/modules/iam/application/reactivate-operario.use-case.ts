/**
 * T-17 — ReactivateOperarioUseCase.
 *
 * Clears deactivatedAt (sets to null) on an operario (soft reactivation).
 * Per spec: 409 if already active (NOT idempotent).
 * Per spec: 404 if not found or out of scope.
 *
 * Covers: OP-46, OP-47, OP-29, REQ-07.
 */

import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import type { OperarioDto } from '@futuragest/contracts';
import { AlreadyActiveError, OperarioNotFoundError } from '../domain/operario.errors';

export class ReactivateOperarioUseCase {
  constructor(private readonly repo: OperarioRepositoryPort) {}

  async execute(operarioId: string): Promise<OperarioDto> {
    const operario = await this.repo.findByIdScoped(operarioId);

    if (!operario) {
      throw new OperarioNotFoundError(operarioId);
    }

    if (operario.deactivatedAt === null) {
      // Already active — spec says 409, NOT idempotent 200
      throw new AlreadyActiveError(operarioId);
    }

    const updated = await this.repo.setDeactivatedAt(operarioId, null);

    return {
      id: updated.id,
      fullName: updated.fullName,
      documento: updated.documento,
      supervisorId: updated.supervisorId,
      cargo: updated.cargo,
      areaId: updated.areaId ?? null,
      areaName: null,
      active: updated.deactivatedAt === null,
      deactivatedAt: updated.deactivatedAt ? updated.deactivatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
