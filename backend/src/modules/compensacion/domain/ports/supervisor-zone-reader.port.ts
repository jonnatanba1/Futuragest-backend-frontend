/**
 * SupervisorZoneReaderPort — resolves the zoneId of a supervisor by their id.
 *
 * Used by CloseCompensationPeriodUseCase to obtain the real zoneId for the
 * CompensationPeriod snapshot (Fix 7).
 *
 * W4 rule: the adapter must issue a SEPARATE query to the Supervisor table —
 * NEVER include supervisor relation on the Operario query.
 * Precedent: ScopedOperarioRepository.resolveSupervisorByEmail uses the same pattern.
 */

export const SUPERVISOR_ZONE_READER_PORT = Symbol('SupervisorZoneReaderPort');

export interface SupervisorZoneReaderPort {
  /**
   * Returns the zoneId of the supervisor with the given id.
   * Returns null when the supervisor does not exist.
   */
  findZoneIdBySupervisorId(supervisorId: string): Promise<string | null>;
}
