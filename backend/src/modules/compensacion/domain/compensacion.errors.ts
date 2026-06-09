/**
 * Compensacion domain errors.
 *
 * Each error carries httpStatus (used by controller to map to HTTP response)
 * and code (machine-readable identifier for API consumers).
 *
 * Error catalog (spec §7):
 *   422 — NoPolicyForDateError              (NO_POLICY_FOR_DATE)
 *   409 — JornadaPolicyOverlapsLiquidatedPeriodError (POLICY_OVERLAPS_LIQUIDATED)
 *   409 — JornadaPolicyDuplicateEffectiveDateError   (POLICY_DUPLICATE_DATE)
 *   400 — JornadaPolicyInvalidHorasError    (POLICY_INVALID_HORAS)
 */

export class NoPolicyForDateError extends Error {
  readonly httpStatus = 422 as const;
  readonly code = 'NO_POLICY_FOR_DATE' as const;

  constructor(date: string) {
    super(
      `No existe una JornadaPolicy vigente para la fecha "${date}". ` +
        `Registre una política con vigenteDesde <= ${date} antes de procesar asistencias.`,
    );
    this.name = 'NoPolicyForDateError';
  }
}

export class JornadaPolicyOverlapsLiquidatedPeriodError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'POLICY_OVERLAPS_LIQUIDATED' as const;

  constructor(vigenteDesde: string) {
    super(
      `La vigenteDesde "${vigenteDesde}" cae dentro de un período ya liquidado. ` +
        `No se puede insertar una política que afecte quincenas cerradas.`,
    );
    this.name = 'JornadaPolicyOverlapsLiquidatedPeriodError';
  }
}

export class JornadaPolicyDuplicateEffectiveDateError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'POLICY_DUPLICATE_DATE' as const;

  constructor(vigenteDesde: string) {
    super(
      `Ya existe una JornadaPolicy con vigenteDesde "${vigenteDesde}". ` +
        `Cada fecha de vigencia debe ser única.`,
    );
    this.name = 'JornadaPolicyDuplicateEffectiveDateError';
  }
}

export class JornadaPolicyInvalidHorasError extends Error {
  readonly httpStatus = 400 as const;
  readonly code = 'POLICY_INVALID_HORAS' as const;

  constructor(horasDiarias: number) {
    super(
      `horasDiarias "${horasDiarias}" está fuera del rango permitido [0.5, 24]. ` +
        `La jornada diaria debe estar entre 0.5 y 24 horas inclusive.`,
    );
    this.name = 'JornadaPolicyInvalidHorasError';
  }
}
