/**
 * Operario domain error classes.
 *
 * Pure domain errors — no framework dependencies.
 * The interface layer maps them to HTTP status codes via httpStatus hint.
 *
 * HTTP status decisions (locked in spec):
 *   409 — DuplicateDocumentoError  (documento @unique conflict)
 *   400 — OperarioSupervisorNotFoundError  (supervisor email not resolved)
 *   409 — AlreadyInactiveError  (deactivate on already-inactive — NOT idempotent)
 *   409 — AlreadyActiveError    (reactivate on already-active — NOT idempotent)
 *   404 — OperarioNotFoundError (scoped lookup returned null)
 */

/**
 * Thrown when creating an operario with a documento that already exists.
 */
export class DuplicateDocumentoError extends Error {
  readonly httpStatus = 409 as const;

  constructor(documento: string) {
    super(
      `[operario] An operario with documento "${documento}" already exists. ` +
        `documento must be unique across all operarios.`,
    );
    this.name = 'DuplicateDocumentoError';
  }
}

/**
 * Thrown when the provided supervisor email cannot be resolved to a Supervisor record.
 */
export class OperarioSupervisorNotFoundError extends Error {
  readonly httpStatus = 400 as const;

  constructor(supervisorEmail: string) {
    super(
      `[operario] Supervisor with email "${supervisorEmail}" not found. ` +
        `Provide a valid supervisor email address.`,
    );
    this.name = 'OperarioSupervisorNotFoundError';
  }
}

/**
 * Thrown when attempting to deactivate an operario who is already inactive.
 * Per spec: 409, NOT idempotent 200.
 */
export class AlreadyInactiveError extends Error {
  readonly httpStatus = 409 as const;

  constructor(operarioId: string) {
    super(
      `[operario] Operario "${operarioId}" is already inactive. ` +
        `Cannot deactivate an already-inactive operario.`,
    );
    this.name = 'AlreadyInactiveError';
  }
}

/**
 * Thrown when attempting to reactivate an operario who is already active.
 * Per spec: 409, NOT idempotent 200.
 */
export class AlreadyActiveError extends Error {
  readonly httpStatus = 409 as const;

  constructor(operarioId: string) {
    super(
      `[operario] Operario "${operarioId}" is already active. ` +
        `Cannot reactivate an already-active operario.`,
    );
    this.name = 'AlreadyActiveError';
  }
}

/**
 * Thrown when an operario lookup by id returns no record (not found or out of scope).
 */
export class OperarioNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(operarioId: string) {
    super(
      `[operario] Operario "${operarioId}" not found or not accessible in current scope.`,
    );
    this.name = 'OperarioNotFoundError';
  }
}
