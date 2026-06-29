/**
 * AttendanceReaderPort — read-only port for completed Attendance records.
 *
 * Consumed by GetPeriodBalanceUseCase. Implemented by the scoped
 * ScopedAttendanceRepository (adds findCompletedInRange to the existing
 * sanctioned adapter in iam/infrastructure/).
 *
 * Intentionally narrower than AttendanceRepositoryPort — exposes only the
 * range query needed for balance calculation, keeping compensacion decoupled
 * from the asistencia domain port.
 */

import type { Decimal } from '@prisma/client/runtime/client';

export const ATTENDANCE_READER_PORT = Symbol('AttendanceReaderPort');

/**
 * Optional breakdown data attached to an attendance record.
 * When present, enables category-based aggregation in CalculatePeriodBalanceUseCase
 * instead of the legacy raw-duration (horasReales) calculation.
 */
export interface AttendanceBreakdownData {
  horasOrdinariasDiurnas: Decimal;
  horasOrdinariasNocturnas: Decimal;
  horasExtraDiurnas: Decimal;
  horasExtraNocturnas: Decimal;
  totalHoras: Decimal;
  esDominical: boolean;
  esFestivo: boolean;
  esDiaLaboral: boolean;
}

export interface AttendanceReaderRecord {
  id: string;
  operarioId: string;
  date: string; // YYYY-MM-DD Colombia local
  checkInCapturedAt: Date;
  checkOutCapturedAt: Date | null;
  completedAt: Date | null;
  /** When present, enables category-based breakdown aggregation (REQ-009). */
  breakdown?: AttendanceBreakdownData | null;
}

export interface AttendanceReaderPort {
  /**
   * Returns completed (completedAt != null) attendance records for the given
   * operario in the date range [desde, hasta] inclusive. Scope-enforced.
   */
  findCompletedInRange(
    operarioId: string,
    desde: string,
    hasta: string,
  ): Promise<AttendanceReaderRecord[]>;
}
