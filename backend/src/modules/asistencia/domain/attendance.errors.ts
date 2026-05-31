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
      `[attendance] Attendance already exists for operario "${operarioId}" on date "${date}". ` +
        `Use a different clientRef to retry or query the existing record.`,
    );
    this.name = 'AttendanceAlreadyExistsError';
    this.conflicting = conflicting;
  }
}

export class AttendanceNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(id: string) {
    super(`[attendance] Attendance record "${id}" not found or not accessible in current scope.`);
    this.name = 'AttendanceNotFoundError';
  }
}

export class ImmutableAttendanceError extends Error {
  readonly httpStatus = 409 as const;
  /** The already-completed attendance record (for structured 409 body). */
  readonly conflicting: Attendance;

  constructor(id: string, conflicting: Attendance) {
    super(
      `[attendance] Attendance record "${id}" is immutable (completedAt is set). ` +
        `No further mutations are allowed.`,
    );
    this.name = 'ImmutableAttendanceError';
    this.conflicting = conflicting;
  }
}

export class SignatureRequiredError extends Error {
  readonly httpStatus = 422 as const;

  constructor(id: string) {
    super(
      `[attendance] Attendance record "${id}" cannot be checked out: ` +
        `a signature must be uploaded before check-out.`,
    );
    this.name = 'SignatureRequiredError';
  }
}

export class InvalidGpsError extends Error {
  readonly httpStatus = 400 as const;

  constructor(field: string, value: number) {
    super(
      `[attendance] GPS validation failed: field "${field}" has invalid value ${value}. ` +
        `Expected: lat ∈ [-90, 90], lng ∈ [-180, 180], accuracy >= 0.`,
    );
    this.name = 'InvalidGpsError';
  }
}

export class OperarioNotInScopeError extends Error {
  readonly httpStatus = 404 as const;

  constructor(operarioId: string) {
    super(
      `[attendance] Operario "${operarioId}" not found in current supervisor scope. ` +
        `Check-in is only allowed for operarios under the authenticated supervisor.`,
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
      `[attendance] Operario "${operarioId}" is inactive (deactivatedAt is set). ` +
        `Check-in is only allowed for active operarios. Reactivate the operario first.`,
    );
    this.name = 'InactiveOperarioError';
  }
}
