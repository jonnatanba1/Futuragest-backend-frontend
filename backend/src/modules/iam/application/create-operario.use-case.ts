/**
 * T-13 — CreateOperarioUseCase.
 *
 * Creates a new operario. Validates supervisor exists (P2003 → 400).
 * Catches duplicate documento (P2002 → 409 DuplicateDocumentoError).
 *
 * Business rules:
 * - supervisorId must reference a real Supervisor row → P2003 on FK → 400
 * - documento must be unique → P2002 on @unique → 409
 * - deactivatedAt is null on creation (active by default)
 * - Actor identity comes from JWT (controller layer); NOT from this use-case.
 *
 * Covers: OP-38, OP-39, OP-40, REQ-04.
 */

import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import {
  DuplicateDocumentoError,
  OperarioSupervisorNotFoundError,
} from '../domain/operario.errors';

export interface CreateOperarioInput {
  fullName: string;
  documento: string;
  supervisorId: string;
}

export interface CreateOperarioOutput {
  id: string;
}

export class CreateOperarioUseCase {
  constructor(private readonly repo: OperarioRepositoryPort) {}

  async execute(input: CreateOperarioInput): Promise<CreateOperarioOutput> {
    try {
      const operario = await this.repo.create({
        fullName: input.fullName,
        documento: input.documento,
        supervisorId: input.supervisorId,
      });
      return { id: operario.id };
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };

      if (prismaErr?.code === 'P2002') {
        // @unique violation on documento
        throw new DuplicateDocumentoError(input.documento);
      }

      if (prismaErr?.code === 'P2003') {
        // Foreign key violation — supervisorId does not exist
        throw new OperarioSupervisorNotFoundError(input.supervisorId);
      }

      throw err;
    }
  }
}
