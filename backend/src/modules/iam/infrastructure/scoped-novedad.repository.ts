/**
 * ScopedNovedadRepository — the ONLY sanctioned Prisma access point for
 * the Novedad model (reads AND writes).
 *
 * Design constraint (meta-guard): all Novedad Prisma calls live here so the
 * scope-meta-guard raw-call scan finds zero violations in non-sanctioned files.
 * This file matches the `scoped-[a-z-]+\.repository` regex and is therefore
 * exempt from the meta-guard scan.
 *
 * Read path: inherits findManyScoped / findFirstScoped from ScopedRepository
 *   — these automatically apply applyScopeFilter(ctx, 'Novedad').
 *
 * Write path: uses this.delegate (prisma.novedad) directly inside this
 *   sanctioned file — safe because writes are authz-gated at the controller
 *   level and the record already carries supervisorId/zoneId from JWT.
 *
 * W4 constraint: do NOT pass include:{attendance/supervisor/approvedBy} —
 *   those are scoped relations. Return raw scalar rows only.
 *
 * Implements NovedadRepositoryPort (domain port).
 */

import { Injectable } from '@nestjs/common';
import type { Novedad } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';
import type {
  NovedadRepositoryPort,
  CreateNovedadData,
  UpdateNovedadStatusData,
} from '../../novedades/domain/ports/novedad-repository.port';

@Injectable()
export class ScopedNovedadRepository
  extends ScopedRepository<PrismaService['novedad'], Novedad>
  implements NovedadRepositoryPort
{
  protected readonly model = 'Novedad';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.novedad, scopeHolder);
  }

  // ── Scoped reads (enforced by base class) ───────────────────────────────────

  /**
   * Find a single novedad by id — returns null if not found OR out of scope.
   * W4: no include — returns scalar rows only.
   */
  findByIdScoped(id: string): Promise<Novedad | null> {
    return this.findFirstScoped({ where: { id } });
  }

  /**
   * Find a novedad by clientRef within the current principal's scope.
   * Returns null if not found or out of scope (fail-closed, scope-enforced).
   * W4: no include — returns scalar rows only.
   */
  findByClientRef(clientRef: string): Promise<Novedad | null> {
    return this.findFirstScoped({ where: { clientRef } });
  }

  /**
   * List novedades visible to the current principal.
   * W4: no include — returns scalar rows only.
   */
  findManyScoped(filter: object = {}): Promise<Novedad[]> {
    return super.findManyScoped({ where: filter });
  }

  // ── Writes (inside sanctioned file — safe from meta-guard scan) ─────────────

  /**
   * Create a new novedad record.
   * Callers must catch Prisma P2002 and map to NovedadAlreadyExistsError.
   */
  async create(data: CreateNovedadData): Promise<Novedad> {
    return this.delegate.create({
      data: {
        attendanceId: data.attendanceId,
        supervisorId: data.supervisorId,
        zoneId: data.zoneId,
        horasExtra: data.horasExtra,
        motivo: data.motivo ?? null,
        clientRef: data.clientRef ?? null,
        status: 'PENDING',
        approvedByUserId: null,
        decidedAt: null,
      },
    });
  }

  /**
   * Update novedad status (approve/reject).
   * Returns the updated record.
   */
  async updateStatus(id: string, data: UpdateNovedadStatusData): Promise<Novedad> {
    return this.delegate.update({
      where: { id },
      data: {
        status: data.status,
        approvedByUserId: data.approvedByUserId,
        decidedAt: data.decidedAt,
        decisionVerification: data.decisionVerification,
      },
    });
  }

  /**
   * Hard delete a novedad row (cancel while PENDING).
   */
  async delete(id: string): Promise<void> {
    await this.delegate.delete({ where: { id } });
  }
}
