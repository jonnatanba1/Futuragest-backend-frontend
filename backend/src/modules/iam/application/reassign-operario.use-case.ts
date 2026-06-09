/**
 * ReassignOperarioUseCase — moves an operario to a different supervisor.
 *
 * Business rules:
 * - 404 if the operario is not found or out of scope.
 * - 400 if the target supervisorId does not reference a real Supervisor (P2003).
 * - The operario's zone scope follows the new supervisor (supervisorId is the
 *   single source of truth — Operario.supervisorId).
 */

import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import type { OperarioDto } from '@futuragest/contracts';
import { OperarioNotFoundError, OperarioSupervisorNotFoundError } from '../domain/operario.errors';

export interface ReassignOperarioInput {
  operarioId: string;
  supervisorId: string;
}

export class ReassignOperarioUseCase {
  constructor(private readonly repo: OperarioRepositoryPort) {}

  async execute(input: ReassignOperarioInput): Promise<OperarioDto> {
    const operario = await this.repo.findByIdScoped(input.operarioId);
    if (!operario) {
      throw new OperarioNotFoundError(input.operarioId);
    }

    let updated;
    try {
      updated = await this.repo.setSupervisor(input.operarioId, input.supervisorId);
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === 'P2003') {
        throw new OperarioSupervisorNotFoundError(input.supervisorId);
      }
      throw err;
    }

    return {
      id: updated.id,
      fullName: updated.fullName,
      documento: updated.documento,
      supervisorId: updated.supervisorId,
      active: updated.deactivatedAt === null,
      deactivatedAt: updated.deactivatedAt ? updated.deactivatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
