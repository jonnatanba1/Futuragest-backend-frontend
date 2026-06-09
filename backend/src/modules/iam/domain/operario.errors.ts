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
      `Ya existe un operario con el documento "${documento}". ` +
        `El documento debe ser único.`,
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
      `El supervisor con correo "${supervisorEmail}" no fue encontrado. ` +
        `Proporcione un correo de supervisor válido.`,
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
      `El operario "${operarioId}" ya está inactivo. No es posible desactivar un operario que ya está inactivo.`,
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
      `El operario "${operarioId}" ya está activo. No es posible reactivar un operario que ya está activo.`,
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
      `El operario "${operarioId}" no fue encontrado o no es accesible en el ámbito actual.`,
    );
    this.name = 'OperarioNotFoundError';
  }
}
