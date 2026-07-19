/**
 * UpdateSupervisorUseCase — application use-case.
 *
 * Updates a supervisor's municipal assignment, area, and/or display name.
 * displayName is stored on the related User row; municipio and area are
 * stored on the Supervisor row.
 *
 * Error mapping (domain → HTTP handled by controller):
 *   SupervisorNotFoundError → 404
 *   MunicipioNotFoundError  → 400
 *   ZoneNotFoundError       → 400
 *   MunicipioNotInZoneError → 400
 */

import type { Supervisor } from '@prisma/client';
import type { ScopedSupervisorRepository, SupervisorWithUser } from '../infrastructure/scoped-supervisor.repository';
import type { ScopedMunicipioRepository } from '../infrastructure/scoped-municipio.repository';
import {
  SupervisorNotFoundError,
  MunicipioNotFoundError,
  ZoneNotFoundError,
  MunicipioNotInZoneError,
} from '../domain/org.errors';

export interface UpdateSupervisorInput {
  id: string;
  municipioId?: string;
  area?: Supervisor['area'];
  displayName?: string;
}

export type UpdateSupervisorOutput = SupervisorWithUser;

export class UpdateSupervisorUseCase {
  constructor(
    private readonly supervisorRepo: Pick<ScopedSupervisorRepository, 'findById' | 'update'>,
    private readonly municipioRepo: Pick<ScopedMunicipioRepository, 'findByIdForWrite'>,
  ) {}

  async execute(input: UpdateSupervisorInput): Promise<UpdateSupervisorOutput> {
    // 1. Validate supervisor exists
    const supervisor = await this.supervisorRepo.findById(input.id);
    if (!supervisor) {
      throw new SupervisorNotFoundError(input.id);
    }

    // 2. If changing municipio, validate it exists and belongs to the correct zone
    if (input.municipioId !== undefined) {
      const municipio = await this.municipioRepo.findByIdForWrite(input.municipioId);
      if (!municipio) {
        throw new MunicipioNotFoundError(input.municipioId);
      }
      if (municipio.zoneId !== supervisor.zoneId) {
        throw new MunicipioNotInZoneError(input.municipioId, supervisor.zoneId);
      }
    }

    // 3. Delegate the update to the repository
    return this.supervisorRepo.update(input.id, {
      municipioId: input.municipioId,
      area: input.area,
      displayName: input.displayName,
    });
  }
}
