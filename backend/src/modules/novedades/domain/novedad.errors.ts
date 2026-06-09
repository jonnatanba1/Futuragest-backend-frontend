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
    super(`La novedad "${id}" no fue encontrada o no es accesible en el ámbito actual.`);
    this.name = 'NovedadNotFoundError';
  }
}

export class AttendanceNotFoundError extends Error {
  readonly httpStatus = 404 as const;

  constructor(id: string) {
    super(
      `El registro de asistencia "${id}" no fue encontrado o no es accesible en el ámbito actual.`,
    );
    this.name = 'AttendanceNotFoundError';
  }
}

export class NovedadAlreadyExistsError extends Error {
  readonly httpStatus = 409 as const;

  constructor(attendanceId: string) {
    super(
      `Ya existe una novedad activa (PENDING o APPROVED) para la asistencia "${attendanceId}". ` +
        `Solo se permite una novedad activa por asistencia. ` +
        `La novedad existente debe ser rechazada o cancelada antes de crear una nueva.`,
    );
    this.name = 'NovedadAlreadyExistsError';
  }
}

export class AttendanceNotCompletedError extends Error {
  readonly httpStatus = 409 as const;

  constructor(attendanceId: string) {
    super(
      `El registro de asistencia "${attendanceId}" aún no ha sido completado. ` +
        `Solo se puede crear una novedad para una asistencia completada (con check-out).`,
    );
    this.name = 'AttendanceNotCompletedError';
  }
}

export class ImmutableNovedadError extends Error {
  readonly httpStatus = 409 as const;

  constructor(id: string) {
    super(
      `La novedad "${id}" ya fue decidida (estado APPROVED o REJECTED). ` +
        `No se permiten más modificaciones sobre una novedad decidida.`,
    );
    this.name = 'ImmutableNovedadError';
  }
}

export class InvalidHorasExtraError extends Error {
  readonly httpStatus = 400 as const;

  constructor(value: string | number) {
    super(
      `Valor de horasExtra inválido: "${value}". ` +
        `horasExtra debe ser un número positivo mayor que 0 y como máximo 24.`,
    );
    this.name = 'InvalidHorasExtraError';
  }
}
