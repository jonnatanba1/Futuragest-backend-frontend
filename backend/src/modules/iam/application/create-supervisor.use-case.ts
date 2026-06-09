/**
 * CreateSupervisorUseCase — application use-case.
 *
 * Creates a new Supervisor: validates zone + municipio existence and
 * municipio-in-zone membership, hashes the plaintext password via the
 * PasswordHasherPort, then delegates the compound User + Supervisor write
 * to ScopedSupervisorRepository.createWithUser (single $transaction).
 *
 * Error mapping (domain → HTTP handled by controller):
 *   ZoneNotFoundError         → 400
 *   MunicipioNotFoundError    → 400
 *   MunicipioNotInZoneError   → 400
 *   EmailInUseError           → 409
 */

import type { PasswordHasherPort } from '../../auth/domain/password-hasher.port';
import type { ScopedZoneRepository } from '../infrastructure/scoped-zone.repository';
import type { ScopedMunicipioRepository } from '../infrastructure/scoped-municipio.repository';
import type { ScopedSupervisorRepository, CreateSupervisorWithUserParams } from '../infrastructure/scoped-supervisor.repository';
import type { Supervisor } from '@prisma/client';
import {
  ZoneNotFoundError,
  MunicipioNotFoundError,
  MunicipioNotInZoneError,
} from '../domain/org.errors';

export interface CreateSupervisorInput {
  email: string;
  password: string;
  area: Supervisor['area'];
  zoneId: string;
  municipioId: string;
}

export interface CreateSupervisorOutput {
  /** The created Supervisor.id (NOT the User.id). */
  id: string;
}

export class CreateSupervisorUseCase {
  constructor(
    private readonly supervisorRepo: Pick<ScopedSupervisorRepository, 'createWithUser'>,
    private readonly zoneRepo: Pick<ScopedZoneRepository, 'findByIdForWrite'>,
    private readonly municipioRepo: Pick<ScopedMunicipioRepository, 'findByIdForWrite'>,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: CreateSupervisorInput): Promise<CreateSupervisorOutput> {
    // 1. Validate zone exists
    const zone = await this.zoneRepo.findByIdForWrite(input.zoneId);
    if (!zone) {
      throw new ZoneNotFoundError(input.zoneId);
    }

    // 2. Validate municipio exists
    const municipio = await this.municipioRepo.findByIdForWrite(input.municipioId);
    if (!municipio) {
      throw new MunicipioNotFoundError(input.municipioId);
    }

    // 3. Validate municipio belongs to the requested zone
    if (municipio.zoneId !== input.zoneId) {
      throw new MunicipioNotInZoneError(input.municipioId, input.zoneId);
    }

    // 4. Hash password — raw password MUST NOT reach the repository
    const passwordHash = await this.hasher.hash(input.password);

    // 5. Compound write — User + Supervisor in one transaction
    const params: CreateSupervisorWithUserParams = {
      email: input.email,
      passwordHash,
      area: input.area,
      zoneId: input.zoneId,
      municipioId: input.municipioId,
    };

    return this.supervisorRepo.createWithUser(params);
  }
}
