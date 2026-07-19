/**
 * CompensatoryRestPort — fire-and-forget port for compensatory rest generation.
 *
 * Defined in asistencia/domain/ports/ following the same consumer-side pattern
 * as LateArrivalNovedadPort and AttendanceClassificationPort.
 *
 * Invoked by ClassifyAttendanceUseCase after classification completes
 * when the attendance is dominical or festivo (REQ-006).
 */
export const COMPENSATORY_REST_PORT = Symbol('CompensatoryRestPort');

export interface CompensatoryRestPort {
  /**
   * Generate compensatory rest record if the attendance is dominical or festivo.
   * Fire-and-forget: must not throw, must not block classification.
   *
   * Classification logic (REQ-006):
   *   - ≤2 dominical/festivo per month → OCCASIONAL
   *   - ≥3 dominical/festivo per month → HABITUAL (reclassify all previous)
   *   - Per-operario, per-month counting (boundary resets)
   *   - Idempotent: no duplicate for same attendanceId
   *
   * @param attendanceId — the classified attendance
   */
  generateIfApplicable(attendanceId: string): Promise<void>;
}
