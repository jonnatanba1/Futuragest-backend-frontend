/**
 * AssignCoordinadorToZoneUseCase — application use-case.
 *
 * Assigns a COORDINADOR user to a zone. The clear-then-set $transaction
 * that preserves the @unique coordinatedZoneId constraint is delegated to
 * OrgRepositoryPort.assignCoordinador (implemented by PrismaOrgRepository).
 *
 * Authorization gate: callers with role SYSTEM_ADMIN or TALENTO_HUMANO only.
 * This is enforced at the interface layer (@Roles guard on OrgController).
 * No privilege-escalation check is needed here — assigning a COORDINADOR to
 * a zone is not a hierarchy-escalation vector.
 */

import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';

export interface AssignCoordinadorInput {
  userId: string;
  zoneId: string;
}

export class AssignCoordinadorToZoneUseCase {
  constructor(private readonly orgRepo: OrgRepositoryPort) {}

  /**
   * Execute the assignment.
   *
   * Delegates all DB-side validation and transactional work to the repo port:
   * - Validates zone exists (throws ZoneNotFoundError on miss).
   * - Validates user exists (throws UserNotFoundError on miss).
   * - Validates user has role COORDINADOR (throws InvalidCoordinadorRoleError on mismatch).
   * - Executes clear-then-set inside a $transaction (INV-05).
   */
  async execute(input: AssignCoordinadorInput): Promise<void> {
    await this.orgRepo.assignCoordinador({
      userId: input.userId,
      zoneId: input.zoneId,
    });
  }
}
