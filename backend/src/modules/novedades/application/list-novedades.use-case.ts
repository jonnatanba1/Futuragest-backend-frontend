/**
 * ListNovedadesUseCase — list novedades visible to the current principal (scoped).
 *
 * Scope is enforced inside ScopedNovedadRepository:
 * - SUPERVISOR: sees only own novedades (supervisorId filter)
 * - COORDINADOR: sees all in zone (zoneId filter)
 * - GLOBAL_ROLES (LIDER_OPERATIVO, SYSTEM_ADMIN, etc.): sees all
 *
 * REQUEST-scoped: scope context read per request.
 */

import type { Novedad } from '@prisma/client';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';

export class ListNovedadesUseCase {
  constructor(private readonly novedadRepo: NovedadRepositoryPort) {}

  /**
   * Returns novedades visible to the current principal.
   * Pass `since` to return only records with updatedAt >= since (delta mode).
   */
  async execute(since?: Date): Promise<Novedad[]> {
    const filter = since ? { updatedAt: { gte: since } } : {};
    return this.novedadRepo.findManyScoped(filter);
  }
}
