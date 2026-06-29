/**
 * SupervisorZoneReaderAdapter — resolves a Supervisor's zoneId by supervisorId.
 *
 * Fix 7: CloseCompensationPeriodUseCase needs the real zoneId for the snapshot,
 * but zoneId is NOT a field on Operario (it lives on Supervisor). This adapter
 * issues a SEPARATE query following the W4 rule (no scoped-relation includes).
 *
 * Precedent: ScopedOperarioRepository.resolveSupervisorByEmail is the same pattern.
 *
 * This is a singleton (global, no request scope) — the Supervisor model is not
 * scoped in this query; it's a direct FK lookup by id.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { SupervisorZoneReaderPort } from '../../compensacion/domain/ports/supervisor-zone-reader.port';

@Injectable()
export class SupervisorZoneReaderAdapter implements SupervisorZoneReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the zoneId of the supervisor with the given id.
   * Returns null when the supervisor does not exist.
   *
   * SEPARATE query — never includes supervisor on Operario (W4 rule).
   */
  async findZoneIdBySupervisorId(supervisorId: string): Promise<string | null> {
    const row = await this.prisma.supervisor.findUnique({
      where: { id: supervisorId },
      select: { zoneId: true },
    });
    return row?.zoneId ?? null;
  }
}
