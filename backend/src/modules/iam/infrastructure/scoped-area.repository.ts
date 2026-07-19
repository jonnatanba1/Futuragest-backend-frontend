/**
 * ScopedAreaRepository — concrete scoped repository for the Area model.
 *
 * COORDINADOR scope: sees only áreas in their zone (via SCOPE_MAPS.Area.zonePath).
 * GLOBAL_ROLES: see all áreas (pass-through).
 * SUPERVISOR: structural deny (SCOPE_MAPS.Area.supervisorPath → impossible predicate).
 * Unknown roles: structural deny (fail-closed, INV-01).
 *
 * W3 flip: this class's existence allows scope-meta-guard.spec.ts to include
 * 'Area' in implementedModels.
 *
 * W4 constraint: must NOT use include:{ zone } — zone is a scoped relation.
 * Issue separate scoped queries if needed.
 *
 * Write methods (create/update/delete/findUniqueForWrite) are defined here
 * because this file is the only sanctioned location for direct prisma.area.* calls.
 * PrismaOrgRepository delegates to these methods for área CRUD.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Area } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedAreaRepository extends ScopedRepository<
  PrismaService['area'],
  Area
> {
  protected readonly model = 'Area';

  // Keep a reference to the PrismaService for write operations that go through
  // the raw delegate — the delegate is PrismaService['area'] (the Prisma model
  // delegate), so we store it separately for type-safe writes.
  private readonly prismaArea: PrismaService['area'];

  constructor(
    private readonly prisma: PrismaService,
    scopeHolder: ScopeContextHolder,
  ) {
    super(prisma.area, scopeHolder);
    this.prismaArea = prisma.area;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * List áreas visible to the current principal.
   * Optionally accepts extra where conditions (merged with scope).
   */
  findMany(where?: Prisma.AreaWhereInput): Promise<Area[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  /**
   * Find a single área by id — returns null if not found OR out of scope.
   * Controller should return 404 on null.
   */
  findById(id: string): Promise<Area | null> {
    return this.findFirstScoped({ where: { id } });
  }

  // ─── Write (sanctioned — this file is the only allowed caller of prisma.area.*) ─

  /**
   * Find an área by id WITHOUT scope restriction — for write-path existence checks.
   * ADMIN writes must target any área regardless of the caller's scope context.
   */
  findByIdForWrite(id: string): Promise<Area | null> {
    return this.prismaArea.findUnique({ where: { id } });
  }

  /** Create a new área. */
  create(data: { name: string; horaInicio: string; horaFin: string; zoneId: string }): Promise<Area> {
    return this.prismaArea.create({ data });
  }

  /** Update an área. */
  update(id: string, data: { name?: string; horaInicio?: string; horaFin?: string; zoneId?: string }): Promise<Area> {
    return this.prismaArea.update({ where: { id }, data });
  }

  /**
   * Check área dependents for referential guard before delete.
   * Returns counts of related entities that block deletion.
   * Currently: no operario link exists in this change, so returns empty counts.
   * Future: will check operarios count when FK is added.
   */
  async checkDependents(_id: string): Promise<{ operarios?: number }> {
    // No Operario → Area link in this change. Always returns empty.
    // When the FK is added, implement: count operarios where areaId = id.
    return {};
  }

  /** Delete an área by id. */
  delete(id: string): Promise<Area> {
    return this.prismaArea.delete({ where: { id } });
  }
}
