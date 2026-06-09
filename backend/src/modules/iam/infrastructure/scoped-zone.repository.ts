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
 *
 * Write methods (create/update/delete/findUniqueForWrite) are defined here
 * because this file is the only sanctioned location for direct prisma.zone.* calls.
 * PrismaOrgRepository delegates to these methods for zone CRUD.
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

  // Keep a reference to the PrismaService for write operations that go through
  // the raw delegate — the delegate is PrismaService['zone'] (the Prisma model
  // delegate), so we store it separately for type-safe writes.
  private readonly prismaZone: PrismaService['zone'];

  constructor(
    private readonly prisma: PrismaService,
    scopeHolder: ScopeContextHolder,
  ) {
    super(prisma.zone, scopeHolder);
    this.prismaZone = prisma.zone;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

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

  // ─── Write (sanctioned — this file is the only allowed caller of prisma.zone.*) ─

  /**
   * Find a zone by id WITHOUT scope restriction — for write-path existence checks.
   * ADMIN writes must target any zone regardless of the caller's scope context.
   */
  findByIdForWrite(id: string): Promise<Zone | null> {
    return this.prismaZone.findUnique({ where: { id } });
  }

  /** Create a new zone. */
  create(data: { name: string }): Promise<Zone> {
    return this.prismaZone.create({ data });
  }

  /** Update a zone. */
  update(id: string, data: { name: string }): Promise<Zone> {
    return this.prismaZone.update({ where: { id }, data });
  }

  /**
   * Check zone dependents for referential guard before delete.
   * Returns counts of related entities that block deletion.
   */
  async countDependents(id: string): Promise<{
    municipios: number;
    supervisors: number;
    coordinador: boolean;
  }> {
    const zone = await this.prismaZone.findUnique({
      where: { id },
      include: {
        _count: { select: { municipios: true, supervisors: true } },
        coordinador: { select: { id: true } },
      },
    });
    if (!zone) return { municipios: 0, supervisors: 0, coordinador: false };
    return {
      municipios: zone._count.municipios,
      supervisors: zone._count.supervisors,
      coordinador: zone.coordinador !== null,
    };
  }

  /** Delete a zone by id. */
  delete(id: string): Promise<Zone> {
    return this.prismaZone.delete({ where: { id } });
  }
}
