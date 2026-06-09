/**
 * ScopedMunicipioRepository — concrete scoped repository for the Municipio model.
 *
 * COORDINADOR scope: sees only municipios in their zone (via SCOPE_MAPS.Municipio.zonePath).
 * GLOBAL_ROLES: see all municipios (pass-through).
 * SUPERVISOR: structural deny (SCOPE_MAPS.Municipio.supervisorPath → impossible predicate).
 * Unknown roles: structural deny (fail-closed, INV-01).
 *
 * W3 flip: this class's existence closes the W3 gap — scope-meta-guard.spec.ts
 * can now include 'Municipio' in implementedModels.
 *
 * W4 constraint: must NOT use include:{ zone } or include:{ supervisors }
 * — those are scoped relations. Issue separate scoped queries if needed.
 *
 * Write methods (create/update/delete/findUniqueForWrite) are defined here
 * because this file is the only sanctioned location for direct prisma.municipio.* calls.
 * PrismaOrgRepository delegates to these methods for municipio CRUD.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Municipio } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedMunicipioRepository extends ScopedRepository<
  PrismaService['municipio'],
  Municipio
> {
  protected readonly model = 'Municipio';

  private readonly prismaMunicipio: PrismaService['municipio'];

  constructor(
    private readonly prisma: PrismaService,
    scopeHolder: ScopeContextHolder,
  ) {
    super(prisma.municipio, scopeHolder);
    this.prismaMunicipio = prisma.municipio;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * List municipios visible to the current principal.
   * Optionally accepts extra where conditions (merged with scope).
   */
  findMany(where?: Prisma.MunicipioWhereInput): Promise<Municipio[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  /**
   * Find a single municipio by id — returns null if not found OR out of scope.
   * Controller should return 404 on null.
   */
  findById(id: string): Promise<Municipio | null> {
    return this.findFirstScoped({ where: { id } });
  }

  // ─── Write (sanctioned — this file is the only allowed caller of prisma.municipio.*) ─

  /**
   * Find a municipio by id WITHOUT scope restriction — for write-path existence checks.
   */
  findByIdForWrite(id: string): Promise<Municipio | null> {
    return this.prismaMunicipio.findUnique({ where: { id } });
  }

  /** Create a new municipio. */
  create(data: { name: string; zoneId: string }): Promise<Municipio> {
    return this.prismaMunicipio.create({ data });
  }

  /** Update a municipio. */
  update(id: string, data: { name?: string; zoneId?: string }): Promise<Municipio> {
    return this.prismaMunicipio.update({ where: { id }, data });
  }

  /**
   * Count supervisors in this municipio — used for referential guard before delete.
   */
  async countSupervisors(id: string): Promise<number> {
    const result = await this.prismaMunicipio.findUnique({
      where: { id },
      include: { _count: { select: { supervisors: true } } },
    });
    return result?._count.supervisors ?? 0;
  }

  /** Delete a municipio by id. */
  delete(id: string): Promise<Municipio> {
    return this.prismaMunicipio.delete({ where: { id } });
  }
}
