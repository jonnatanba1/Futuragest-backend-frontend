/**
 * ScopedZoneRepository — concrete scoped repository for the Zone model.
 *
 * COORDINADOR scope: sees only the zone whose id matches their zoneId JWT claim
 * (self-id zonePath: `(zoneId) => ({ id: zoneId })`).
 * GLOBAL_ROLES: see all zones (pass-through).
 * SUPERVISOR / unknown roles: structural deny (fail-closed).
 *
 * W3 flip: this class's existence allows scope-meta-guard.spec.ts to include
 * 'Zone' in implementedModels.
 *
 * W4 constraint: must NOT use include:{ municipios } or include:{ supervisors }
 * — those are scoped relations. Issue separate scoped queries if needed.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Zone } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedZoneRepository extends ScopedRepository<
  PrismaService['zone'],
  Zone
> {
  protected readonly model = 'Zone';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.zone, scopeHolder);
  }

  /**
   * List zones visible to the current principal.
   * Optionally accepts extra where conditions (merged with scope).
   */
  findMany(where?: Prisma.ZoneWhereInput): Promise<Zone[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  /**
   * Find a single zone by id — returns null if not found OR out of scope.
   * Controller should return 404 on null.
   */
  findById(id: string): Promise<Zone | null> {
    return this.findFirstScoped({ where: { id } });
  }
}
