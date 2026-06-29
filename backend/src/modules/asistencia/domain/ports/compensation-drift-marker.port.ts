/**
 * CompensationDriftMarkerPort — cross-module port defined in the asistencia domain.
 *
 * When a check-out completes an attendance whose `date` falls inside a CLOSED
 * CompensationPeriod for that operario, the frozen snapshot silently diverges
 * from live data. This port allows CheckOutAttendanceUseCase to trigger the
 * drift-marking logic WITHOUT importing the compensacion module directly.
 *
 * Cross-module dependency rule (Fix 5):
 *   asistencia defines the PORT (this file).
 *   compensacion provides the ADAPTER (implementing the interface, injected into
 *   AsistenciaModule via DI export from CompensacionModule).
 *
 * Error handling: the check-out use-case wraps every call in try/catch and
 * swallows errors (logs only) — drift marking must NEVER fail the check-out.
 */

export const COMPENSATION_DRIFT_MARKER_PORT = Symbol('CompensationDriftMarkerPort');

export interface CompensationDriftMarkerPort {
  /**
   * Mark the closed CompensationPeriod containing `date` for this operario as
   * diverged (if any exists and divergedAt is not already set).
   *
   * Idempotent: if no closed period covers this date, or divergedAt is already
   * set, this is a no-op.
   *
   * @param operarioId  The operario whose period to mark.
   * @param date        YYYY-MM-DD Colombia local date from the completed attendance.
   */
  markDivergedIfClosed(operarioId: string, date: string): Promise<void>;
}
