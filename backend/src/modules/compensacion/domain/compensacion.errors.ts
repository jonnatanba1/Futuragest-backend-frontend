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
 *
 * PR-B additions:
 *   409 — CompensationPeriodAlreadyClosedError       (PERIOD_ALREADY_CLOSED)
 *   422 — DispositionRequiredError                   (DISPOSITION_REQUIRED)
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

// ── PR-B error classes ────────────────────────────────────────────────────────

/**
 * Thrown when a CompensationPeriod already exists for this operario + periodKey
 * AND the clientRef does not match (immutability violation — cannot re-close a
 * period with different parameters).
 * HTTP 409 — PERIOD_ALREADY_CLOSED.
 */
export class CompensationPeriodAlreadyClosedError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'PERIOD_ALREADY_CLOSED' as const;

  constructor(operarioId: string, periodKey: string) {
    super(
      `El período "${periodKey}" del operario "${operarioId}" ya fue cerrado y es inmutable. ` +
        `Para reutilizar el resultado existente envíe el mismo clientRef del cierre original.`,
    );
    this.name = 'CompensationPeriodAlreadyClosedError';
  }
}

/**
 * Thrown when saldo < 0 at fortnight close and no disposition was provided.
 * A negative balance requires an explicit decision: CARRY_OVER or PAYROLL_DEDUCTION.
 * HTTP 422 — DISPOSITION_REQUIRED.
 */
export class DispositionRequiredError extends Error {
  readonly httpStatus = 422 as const;
  readonly code = 'DISPOSITION_REQUIRED' as const;

  constructor(periodKey: string) {
    super(
      `El saldo del período "${periodKey}" es negativo. ` +
        `Se requiere indicar "disposition" (CARRY_OVER o PAYROLL_DEDUCTION) para cerrar el período.`,
    );
    this.name = 'DispositionRequiredError';
  }
}

// ── PR-C error classes ──────────────────────────────────────────────────────────

/**
 * Thrown when a payout is requested for a period that was never closed
 * (no CompensationPeriod snapshot for operario + periodKey). Only a closed
 * period can be liquidated.
 * HTTP 404 — PERIOD_NOT_CLOSED.
 */
export class PeriodNotClosedError extends Error {
  readonly httpStatus = 404 as const;
  readonly code = 'PERIOD_NOT_CLOSED' as const;

  constructor(operarioId: string, periodKey: string) {
    super(
      `El período "${periodKey}" del operario "${operarioId}" no fue cerrado. ` +
        `Solo se puede liquidar un período cerrado (cierre de quincena).`,
    );
    this.name = 'PeriodNotClosedError';
  }
}
