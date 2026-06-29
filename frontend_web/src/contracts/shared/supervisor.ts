/**
 * Supervisor contract types.
 *
 * Plain TypeScript interfaces — no framework decorators.
 * Shape returned by GET /iam/supervisors and GET /iam/supervisors/:id.
 */

/**
 * Supervisor row enriched with the related user's email (the supervisor model
 * itself has no display name; email is the human-identifiable handle).
 */
export interface SupervisorDto {
  id: string;
  userId: string;
  municipioId: string;
  zoneId: string;
  /** SupervisorArea: BARRIDO | RECOLECCION | SUPERNUMERARIO */
  area: string;
  /** Email of the supervisor's user account. */
  email: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}
