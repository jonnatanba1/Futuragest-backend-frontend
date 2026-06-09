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

export const ATTENDANCE_READER_PORT = Symbol('AttendanceReaderPort');

export interface AttendanceReaderRecord {
  id: string;
  operarioId: string;
  date: string; // YYYY-MM-DD Colombia local
  checkInCapturedAt: Date;
  checkOutCapturedAt: Date | null;
  completedAt: Date | null;
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
