/**
 * GetNovedadUseCase — retrieve a single novedad by id (scoped).
 *
 * Cross-scope access → null from repo → 404 (fail-closed).
 * REQUEST-scoped: scope enforced inside ScopedNovedadRepository.
 */

import type { Novedad } from '@prisma/client';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import { NovedadNotFoundError } from '../domain/novedad.errors';

export class GetNovedadUseCase {
  constructor(private readonly novedadRepo: NovedadRepositoryPort) {}

  async execute(novedadId: string): Promise<Novedad> {
    const novedad = await this.novedadRepo.findByIdScoped(novedadId);
    if (!novedad) {
      throw new NovedadNotFoundError(novedadId);
    }
    return novedad;
  }
}
