/**
 * UpdateUserUseCase — application use-case.
 *
 * Updates a management user's displayName and/or role.
 * displayName is stored directly on the User row.
 *
 * TWO-LAYER authz model (same as provision):
 * - Layer 1 (interface): @Roles(SYSTEM_ADMIN, TALENTO_HUMANO) guard.
 * - Layer 2 (here): privilege-escalation guard if changing role.
 *
 * Error mapping:
 *   UserNotFoundError               → 404
 *   UnsupportedProvisionRoleError   → 400
 *   ForbiddenException              → 403 (privilege-escalation)
 */

import { ForbiddenException } from '@nestjs/common';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { UnsupportedProvisionRoleError, UserNotFoundError } from '../domain/org.errors';
import type { Role } from '@prisma/client';

/** Roles that may be targeted by this use-case. */
const UPDATEABLE_ROLES = new Set<Role>(['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO', 'COORDINADOR']);

/**
 * Management hierarchy rank.
 * Used exclusively for the privilege-escalation check when changing role.
 */
const RANK: Partial<Record<Role, number>> = {
  GERENCIA: 3,
  TALENTO_HUMANO: 2,
  LIDER_OPERATIVO: 1,
  COORDINADOR: 1,
};

export interface UpdateUserInput {
  id: string;
  displayName?: string;
  role?: Role;
}

export interface UpdateUserOutput {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  coordinatedZoneId: string | null;
  displayName: string | null;
  createdAt: string;
}

export class UpdateUserUseCase {
  constructor(
    private readonly orgRepo: OrgRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserOutput> {
    // 1. If changing role, validate it's in the allowed set
    if (input.role !== undefined) {
      if (!UPDATEABLE_ROLES.has(input.role)) {
        throw new UnsupportedProvisionRoleError(input.role);
      }

      // Privilege-escalation guard
      const actorRole = this.scopeHolder.current().role;

      if (actorRole !== 'SYSTEM_ADMIN') {
        const actorRank = RANK[actorRole as Role] ?? 0;
        const targetRank = RANK[input.role] ?? 0;

        if (targetRank > actorRank) {
          throw new ForbiddenException(
            `[org] Privilege escalation denied: actor with role "${actorRole}" ` +
              `cannot assign role "${input.role}" which outranks their own.`,
          );
        }
      }
    }

    // 2. Delegate to repository
    try {
      const result = await this.orgRepo.updateUser(input.id, {
        displayName: input.displayName,
        role: input.role,
      });

      return {
        id: result.id,
        email: result.email,
        role: result.role,
        mustChangePassword: result.mustChangePassword,
        coordinatedZoneId: result.coordinatedZoneId,
        displayName: result.displayName,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        throw err;
      }
      throw err;
    }
  }
}
