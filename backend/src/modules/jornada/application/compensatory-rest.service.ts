/**
 * CompensatoryRestService — generates CompensatoryRest records for
 * Sunday/holiday attendances (REQ-006).
 *
 * Classification logic:
 *   - ≤2 dominical/festivo attendances per operario per month → OCCASIONAL
 *   - ≥3 dominical/festivo attendances per operario per month → HABITUAL
 *   - When the 3rd is reached, ALL previous in the same month are reclassified
 *     from OCCASIONAL to HABITUAL in the same transaction.
 *   - Month boundary (YYYY-MM) strictly resets the count per operario.
 *   - Idempotent: if a CompensatoryRest already exists for this attendanceId,
 *     the call is a no-op.
 *
 * Feature-gate: COMPENSATORY_REST_ENABLED env var.
 * When false, generateIfApplicable() returns immediately.
 *
 * Follows the same fire-and-forget contract as LateArrivalNovedadService:
 * errors are caught internally and logged; they MUST NOT propagate to the caller.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ATTENDANCE_BREAKDOWN_REPOSITORY_PORT, type AttendanceBreakdownRepositoryPort } from '../domain/ports/attendance-breakdown-repository.port';
import { COMPENSATORY_REST_REPOSITORY_PORT, type CompensatoryRestRepositoryPort } from '../domain/ports/compensatory-rest-repository.port';
import type { CompensatoryRestPort } from '../../asistencia/domain/ports/compensatory-rest.port';

@Injectable()
export class CompensatoryRestService implements CompensatoryRestPort {
  private readonly logger = new Logger(CompensatoryRestService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(ATTENDANCE_BREAKDOWN_REPOSITORY_PORT)
    private readonly breakdownRepo: AttendanceBreakdownRepositoryPort,
    @Inject(COMPENSATORY_REST_REPOSITORY_PORT)
    private readonly restRepo: CompensatoryRestRepositoryPort,
  ) {
    this.enabled = process.env.COMPENSATORY_REST_ENABLED === 'true';
  }

  async generateIfApplicable(attendanceId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.doGenerate(attendanceId);
    } catch (err) {
      // Fire-and-forget: never propagate errors to the caller (classification)
      this.logger.error(
        `Error generando descanso compensatorio para asistencia ${attendanceId}`,
        (err as Error)?.stack ?? err,
      );
    }
  }

  private async doGenerate(attendanceId: string): Promise<void> {
    // 1. Idempotency check — already exists?
    const existing = await this.restRepo.findByAttendanceId(attendanceId);
    if (existing) {
      return;
    }

    // 2. Get breakdown to verify dominical/festivo and get operarioId + date
    const breakdown = await this.breakdownRepo.findByAttendanceId(attendanceId);
    if (!breakdown) {
      this.logger.warn(`No se encontró breakdown para asistencia ${attendanceId}`);
      return;
    }

    // Only Sunday or holiday triggers compensatory rest
    if (!breakdown.esDominical && !breakdown.esFestivo) {
      return;
    }

    // Extract operarioId and date from the breakdown's attendance relation.
    // The real Prisma model nests these under `breakdown.attendance` when the
    // repository includes the attendance relation in the query.
    const attendanceRelation = (breakdown as any).attendance as
      | { operarioId?: string; date?: string }
      | undefined;

    const operarioId = attendanceRelation?.operarioId;
    if (!operarioId) {
      this.logger.warn(`No se encontró operarioId para asistencia ${attendanceId}`);
      return;
    }

    const dateStr = attendanceRelation?.date ?? '2000-01-01';
    const month = dateStr.slice(0, 7); // "YYYY-MM"

    // 3. Count existing records for this operario + month
    const count = await this.restRepo.countByOperarioAndMonth(operarioId, month);

    // 4. Determine classification
    //    count = existing records (0, 1, or 2+)
    //    After this creation: total = count + 1
    const newTotal = count + 1;

    if (newTotal <= 2) {
      // OCCASIONAL
      await this.restRepo.create({
        operarioId,
        attendanceId,
        month,
        type: 'OCCASIONAL',
        status: 'PENDING',
      });
      this.logger.log(`Descanso compensatorio OCCASIONAL creado para asistencia ${attendanceId}`);
    } else if (newTotal === 3) {
      // Reclassify ALL previous in this month to HABITUAL
      const previous = await this.restRepo.findByOperarioAndMonth(operarioId, month);
      for (const prev of previous) {
        if (prev.type !== 'HABITUAL') {
          await this.restRepo.updateType(prev.attendanceId, 'HABITUAL');
        }
      }
      // Create this one as HABITUAL
      await this.restRepo.create({
        operarioId,
        attendanceId,
        month,
        type: 'HABITUAL',
        status: 'PENDING',
      });
      this.logger.log(
        `Descanso compensatorio HABITUAL (≥3) — ${newTotal} dominicales/festivos ` +
          `en el mes ${month} para operario ${operarioId}`,
      );
    } else {
      // Already reclassified (newTotal > 3)
      await this.restRepo.create({
        operarioId,
        attendanceId,
        month,
        type: 'HABITUAL',
        status: 'PENDING',
      });
      this.logger.log(
        `Descanso compensatorio HABITUAL creado para asistencia ${attendanceId} ` +
          `(${newTotal} dominicales/festivos en ${month})`,
      );
    }
  }
}
