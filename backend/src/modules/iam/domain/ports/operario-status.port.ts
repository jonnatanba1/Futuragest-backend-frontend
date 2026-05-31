/**
 * PR-3 — OperarioStatusPort
 *
 * Minimal cross-module read port: allows asistencia module to query whether
 * an operario is active WITHOUT importing the full OperarioRepositoryPort
 * (which would risk circular deps if asistencia ever writes operarios).
 *
 * Owned by: iam module (defines + exports token + binding).
 * Consumed by: asistencia module (CheckInAttendanceUseCase).
 *
 * No circular dependency: asistencia → iam (iam does NOT import asistencia).
 *
 * Covers: PR-3 task 6, design §6.
 */

/** Injection token for OperarioStatusPort. */
export const OPERARIO_STATUS = Symbol('OperarioStatusPort');

export interface OperarioStatusPort {
  /**
   * Returns whether the operario is active (deactivatedAt === null).
   * Returns null if the operario does not exist (or is not in scope).
   */
  isActive(operarioId: string): Promise<boolean | null>;
}
