/**
 * Attendance domain errors.
 *
 * Each error carries an httpStatus hint used by AttendanceController to map
 * domain errors to HTTP responses (pattern mirrors org.errors.ts).
 *
 * HTTP status decisions (locked in spec §3):
 *   409 — AttendanceAlreadyExistsError (duplicate operarioId+date, diff clientRef)
 *   404 — AttendanceNotFoundError (out-of-scope or missing)
 *   409 — ImmutableAttendanceError (mutation of completed record)
 *   422 — SignatureRequiredError (check-out precondition not met)
 *   400 — InvalidGpsError (lat/lng/accuracy out of range)
 *   404 — OperarioNotInScopeError (fail-closed: don't leak existence)
 */

import type { Attendance } from '@prisma/client';

export class AttendanceAlreadyExistsError extends Error {
  readonly httpStatus = 409 as const;
  /** The existing conflicting attendance record (for structured 409 body). */
  readonly conflicting: Attendance;

  constructor(operarioId: string, date: string, conflicting: Attendance) {
    super(
      `El operario "${operarioId}" ya tiene un registro de asistencia para la fecha "${date}". ` +
        `Use un clientRef distinto para reintentar o consulte el registro existente.`,
    );
    this.name = 'AttendanceAlreadyExistsError';
    this.conflicting = conflicting;
  }
}

export class AttendanceNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(id: string) {
    super(`El registro de asistencia "${id}" no fue encontrado o no es accesible en el ámbito actual.`);
    this.name = 'AttendanceNotFoundError';
  }
}

export class ImmutableAttendanceError extends Error {
  readonly httpStatus = 409 as const;
  /** The already-completed attendance record (for structured 409 body). */
  readonly conflicting: Attendance;

  constructor(id: string, conflicting: Attendance) {
    super(
      `El registro de asistencia "${id}" ya fue completado (completedAt está establecido). ` +
        `No se permiten más modificaciones.`,
    );
    this.name = 'ImmutableAttendanceError';
    this.conflicting = conflicting;
  }
}

export class SignatureRequiredError extends Error {
  readonly httpStatus = 422 as const;

  constructor(id: string) {
    super(
      `El registro de asistencia "${id}" no puede ser cerrado: ` +
        `se debe subir la firma antes del check-out.`,
    );
    this.name = 'SignatureRequiredError';
  }
}

export class InvalidGpsError extends Error {
  readonly httpStatus = 400 as const;

  constructor(field: string, value: number) {
    super(
      `Validación de GPS fallida: el campo "${field}" tiene un valor inválido (${value}). ` +
        `Se esperaba: lat ∈ [-90, 90], lng ∈ [-180, 180], accuracy >= 0.`,
    );
    this.name = 'InvalidGpsError';
  }
}

export class OperarioNotInScopeError extends Error {
  readonly httpStatus = 404 as const;

  constructor(operarioId: string) {
    super(
      `El operario "${operarioId}" no fue encontrado en el ámbito del supervisor actual.`,
    );
    this.name = 'OperarioNotInScopeError';
  }
}

/**
 * Thrown by CheckInAttendanceUseCase when the operario is deactivated.
 * Maps to HTTP 409 (spec REQ-09, OP-33).
 */
export class InactiveOperarioError extends Error {
  readonly httpStatus = 409 as const;

  constructor(operarioId: string) {
    super(
      `El operario "${operarioId}" está inactivo. El check-in solo está permitido para operarios activos. Reactive el operario primero.`,
    );
    this.name = 'InactiveOperarioError';
  }
}
