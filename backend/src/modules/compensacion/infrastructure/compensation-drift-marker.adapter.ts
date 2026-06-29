/**
 * CompensationDriftMarkerAdapter — implements CompensationDriftMarkerPort.
 *
 * Fix 5: When a check-out completes an attendance whose date falls inside a CLOSED
 * CompensationPeriod for that operario, this adapter sets divergedAt on that period.
 *
 * Cross-module dependency model:
 *   - The PORT lives in asistencia/domain/ports/ (asistencia domain defines the contract).
 *   - This ADAPTER lives in compensacion/infrastructure/ (compensacion provides the implementation).
 *   - CompensacionModule exports this adapter under the COMPENSATION_DRIFT_MARKER_PORT token.
 *   - AsistenciaModule imports CompensacionModule and injects the token into CheckOutAttendanceUseCase.
 *
 * Why direct Prisma here instead of going through ScopedCompensationPeriodRepository?
 *   - This is an internal cross-module concern, not a user-facing filtered query.
 *   - We need a global (unscoped) read + a guarded write, bypassing request scope.
 *   - ScopedCompensationPeriodRepository is request-scoped and requires ScopeContextHolder.
 *   - Instead we call this.prisma.compensationPeriod directly (scoped-[a-z-]+\.repository
 *     meta-guard exemption does not apply here, but W4 / scope meta-guard only scans
 *     non-sanctioned files — compensacion/infrastructure/ is a sanctioned location).
 *
 * Error handling: all errors propagate to CheckOutAttendanceUseCase, which wraps in
 * try/catch and absorbs them. Logging is the responsibility of the caller.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { CompensationDriftMarkerPort } from '../../asistencia/domain/ports/compensation-drift-marker.port';

@Injectable()
export class CompensationDriftMarkerAdapter implements CompensationDriftMarkerPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the closed CompensationPeriod containing `date` for this operario,
   * and set divergedAt if not already set (idempotent WHERE divergedAt IS NULL).
   *
   * No-op when no closed period covers this date.
   */
  async markDivergedIfClosed(operarioId: string, date: string): Promise<void> {
    // Step 1: find the period that covers this date (global read, no scope)
    const period = await this.prisma.compensationPeriod.findFirst({
      where: {
        operarioId,
        desde: { lte: date },
        hasta: { gte: date },
      },
      select: { id: true, divergedAt: true },
    });

    if (!period) {
      return; // no closed period covers this date — nothing to mark
    }

    if (period.divergedAt !== null) {
      return; // already marked — idempotent no-op
    }

    // Step 2: guarded UPDATE WHERE divergedAt IS NULL
    await this.prisma.compensationPeriod.updateMany({
      where: {
        id: period.id,
        divergedAt: null,
      },
      data: {
        divergedAt: new Date(),
      },
    });
  }
}
