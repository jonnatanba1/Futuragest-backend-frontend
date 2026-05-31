/**
 * Novedad domain errors.
 *
 * Each error carries an httpStatus hint used by NovedadController to map
 * domain errors to HTTP responses.
 *
 * HTTP status decisions (locked in spec §3):
 *   404 — NovedadNotFoundError (out-of-scope or missing — fail-closed)
 *   404 — AttendanceNotFoundError (out-of-scope or missing — fail-closed)
 *   409 — NovedadAlreadyExistsError (active novedad already exists for attendance)
 *   409 — AttendanceNotCompletedError (attendance is not in COMPLETED state)
 *   409 — ImmutableNovedadError (mutation of APPROVED/REJECTED novedad)
 *   400 — InvalidHorasExtraError (horasExtra <= 0, > 24, or non-numeric)
 */

export class NovedadNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(id: string) {
    super(`[novedad] Novedad "${id}" not found or not accessible in current scope.`);
    this.name = 'NovedadNotFoundError';
  }
}

export class AttendanceNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(id: string) {
    super(
      `[novedad] Attendance record "${id}" not found or not accessible in current scope. ` +
        `Cannot create a novedad for an attendance that is out of scope.`,
    );
    this.name = 'AttendanceNotFoundError';
  }
}

export class NovedadAlreadyExistsError extends Error {
  readonly httpStatus = 409 as const;

  constructor(attendanceId: string) {
    super(
      `[novedad] An active novedad (PENDING or APPROVED) already exists for attendance "${attendanceId}". ` +
        `Only one active novedad per attendance is allowed. ` +
        `The existing novedad must be rejected or cancelled before creating a new one.`,
    );
    this.name = 'NovedadAlreadyExistsError';
  }
}

export class AttendanceNotCompletedError extends Error {
  readonly httpStatus = 409 as const;

  constructor(attendanceId: string) {
    super(
      `[novedad] Attendance record "${attendanceId}" is not yet completed (completedAt is null). ` +
        `A novedad can only be created for a completed (checked-out) attendance record.`,
    );
    this.name = 'AttendanceNotCompletedError';
  }
}

export class ImmutableNovedadError extends Error {
  readonly httpStatus = 409 as const;

  constructor(id: string) {
    super(
      `[novedad] Novedad "${id}" has already been decided (status is APPROVED or REJECTED). ` +
        `No further mutations are allowed on a decided novedad.`,
    );
    this.name = 'ImmutableNovedadError';
  }
}

export class InvalidHorasExtraError extends Error {
  readonly httpStatus = 400 as const;

  constructor(value: string | number) {
    super(
      `[novedad] Invalid horasExtra value "${value}". ` +
        `horasExtra must be a positive number greater than 0 and at most 24 (representing hours worked).`,
    );
    this.name = 'InvalidHorasExtraError';
  }
}
