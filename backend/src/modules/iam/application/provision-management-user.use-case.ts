/**
 * ProvisionManagementUserUseCase — application use-case.
 *
 * Creates a new management-role user (GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO).
 *
 * TWO-LAYER authz model:
 * - Layer 1 (interface): @Roles(SYSTEM_ADMIN, TALENTO_HUMANO) guard on OrgController.
 * - Layer 2 (here): privilege-escalation guard enforces the role hierarchy.
 *
 * RANK map (management hierarchy — higher number = higher privilege):
 *   GERENCIA: 3 > TALENTO_HUMANO: 2 > LIDER_OPERATIVO: 1
 *
 * Rules:
 * - SYSTEM_ADMIN bypasses rank check (super-role, above the org hierarchy).
 * - Other callers: RANK[requestedRole] must be <= RANK[actorRole].
 *   Violation → ForbiddenException (HTTP 403).
 *
 * Actor role is read from ScopeContextHolder.current().role — verified JWT claim.
 * It is NEVER taken from the DTO body (spoofable).
 */

import { ForbiddenException } from '@nestjs/common';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import type { PasswordHasherPort } from '../../auth/domain/password-hasher.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { UnsupportedProvisionRoleError } from '../domain/org.errors';
import type { Role } from '@prisma/client';

/** Roles that may be provisioned via this use-case. */
const PROVISIONABLE_ROLES = new Set<Role>(['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO']);

/**
 * Management hierarchy rank.
 * Used exclusively for the privilege-escalation check.
 * SYSTEM_ADMIN is not in this map — it bypasses rank comparison.
 */
const RANK: Partial<Record<Role, number>> = {
  GERENCIA: 3,
  TALENTO_HUMANO: 2,
  LIDER_OPERATIVO: 1,
};

export interface ProvisionManagementUserInput {
  email: string;
  password: string;
  role: Role;
}

export interface ProvisionManagementUserOutput {
  id: string;
}

export class ProvisionManagementUserUseCase {
  constructor(
    private readonly orgRepo: OrgRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  async execute(input: ProvisionManagementUserInput): Promise<ProvisionManagementUserOutput> {
    // 1. Whitelist check — SUPERVISOR, COORDINADOR, SYSTEM_ADMIN not provisionable here
    if (!PROVISIONABLE_ROLES.has(input.role)) {
      throw new UnsupportedProvisionRoleError(input.role);
    }

    // 2. Privilege-escalation guard — actor role from VERIFIED JWT claim, never from body
    const actorRole = this.scopeHolder.current().role;

    if (actorRole !== 'SYSTEM_ADMIN') {
      // Actor is in the management hierarchy — apply rank check
      const actorRank = RANK[actorRole as Role] ?? 0;
      const targetRank = RANK[input.role] ?? 0;

      if (targetRank > actorRank) {
        throw new ForbiddenException(
          `[org] Privilege escalation denied: actor with role "${actorRole}" ` +
            `cannot provision role "${input.role}" which outranks their own.`,
        );
      }
    }

    // 3. Hash password — raw password MUST NOT reach the repository
    const passwordHash = await this.hasher.hash(input.password);

    // 4. Persist — repo sets mustChangePassword=true and coordinatedZoneId=null
    return this.orgRepo.createManagementUser({
      email: input.email,
      passwordHash,
      role: input.role,
    });
  }
}
