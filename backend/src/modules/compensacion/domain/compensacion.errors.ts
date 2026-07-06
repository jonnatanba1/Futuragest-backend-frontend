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

/**
 * Builds the human-readable scope token for a JornadaPolicy duplicate error.
 *
 *   - operarioId !== null → "operario {operarioId}"
 *   - zoneId   !== null   → "zona {zoneId}"
 *   - neither  (global)    → "ámbito global"
 *
 * If BOTH are set, per-operario takes precedence (operario override is the
 * most specific scope). Pure function — easy to test.
 */
export function describeJornadaPolicyScope(
  operarioId: string | null,
  zoneId: string | null,
): string {
  if (operarioId !== null) return `operario ${operarioId}`;
  if (zoneId !== null) return `zona ${zoneId}`;
  return 'ámbito global';
}

export interface JornadaPolicyDuplicateScope {
  vigenteDesde: string;
  operarioId: string | null;
  zoneId: string | null;
}

export class JornadaPolicyDuplicateEffectiveDateError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'POLICY_DUPLICATE_DATE' as const;

  /**
   * Backward-compatible: `new JornadaPolicyDuplicateEffectiveDateError('2026-07-01')`
   * still works (legacy call sites). When scope info is available, prefer the
   * object form `new JornadaPolicyDuplicateEffectiveDateError({ vigenteDesde, operarioId, zoneId })`
   * for a contextual message.
   */
  constructor(vigenteDesde: string | JornadaPolicyDuplicateScope) {
    const scope =
      typeof vigenteDesde === 'string'
        ? { vigenteDesde, operarioId: null, zoneId: null }
        : vigenteDesde;
    super(
      `Ya existe una política vigente desde ${scope.vigenteDesde} para ` +
        `${describeJornadaPolicyScope(scope.operarioId, scope.zoneId)}.`,
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

// ── Audit fix error classes ───────────────────────────────────────────────────

/**
 * Thrown when the requested [desde, hasta] dates do not match the canonical
 * fortnight range for the derived periodKey.
 * Q1 canonical: desde = day 01, hasta = day 15.
 * Q2 canonical: desde = day 16, hasta = last day of month.
 * HTTP 422 — NON_CANONICAL_PERIOD_RANGE.
 */
export class NonCanonicalPeriodRangeError extends Error {
  readonly httpStatus = 422 as const;
  readonly code = 'NON_CANONICAL_PERIOD_RANGE' as const;

  constructor(periodKey: string, expectedDesde: string, expectedHasta: string) {
    super(
      `El rango de fechas no corresponde a la quincena canónica "${periodKey}". ` +
        `Se esperaba desde="${expectedDesde}" hasta="${expectedHasta}".`,
    );
    this.name = 'NonCanonicalPeriodRangeError';
  }
}

/**
 * Thrown when attempting to close a fortnight (Q3) while a gap period (Q2)
 * with unconsumed debt (CARRY_OVER, saldo < 0) exists between the last closed
 * period and the one being closed.
 * HTTP 409 — NON_CONTIGUOUS_CLOSE.
 */
export class NonContiguousCloseError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'NON_CONTIGUOUS_CLOSE' as const;

  constructor(gapPeriodKey: string) {
    super(
      `Existe una quincena anterior con deuda arrastrada sin cerrar las quincenas intermedias. ` +
        `La quincena "${gapPeriodKey}" tiene saldo negativo (CARRY_OVER) pendiente. ` +
        `Cierre primero las quincenas intermedias antes de continuar.`,
    );
    this.name = 'NonContiguousCloseError';
  }
}

/**
 * Thrown when a P2002 unique constraint violation occurs on clientRef but
 * no CompensationPeriod exists for this operario+periodKey (cross-operario collision).
 * HTTP 409 — CLIENT_REF_CONFLICT.
 */
export class ClientRefConflictError extends Error {
  readonly httpStatus = 409 as const;
  readonly code = 'CLIENT_REF_CONFLICT' as const;

  constructor(clientRef: string) {
    super(
      `El clientRef "${clientRef}" ya está en uso por otra quincena. ` +
        `Utilice un clientRef único para cada cierre de quincena.`,
    );
    this.name = 'ClientRefConflictError';
  }
}

// ── Audit fix error classes (Fix 7) ───────────────────────────────────────────

/**
 * Thrown when the supervisor's zoneId cannot be resolved during period close.
 * Closing a period without a real zoneId corrupts the snapshot for COORDINADOR
 * scope filtering — fail loudly instead of defaulting to an empty string.
 * HTTP 422 — ZONE_ID_RESOLUTION_FAILED.
 */
export class ZoneIdResolutionError extends Error {
  readonly httpStatus = 422 as const;
  readonly code = 'ZONE_ID_RESOLUTION_FAILED' as const;

  constructor(operarioId: string, supervisorId: string | null) {
    super(
      `No se pudo resolver el zoneId del supervisor "${supervisorId ?? '(sin supervisorId)'}" ` +
        `para el operario "${operarioId}". ` +
        `El cierre de quincena requiere un zoneId válido para el filtrado de COORDINADOR.`,
    );
    this.name = 'ZoneIdResolutionError';
  }
}

// ── Fix 4 error classes ─────────────────────────────────────────────────────────

/**
 * Thrown when a payout confirmation is requested for a period whose saldo <= 0.
 * A period with zero or negative saldo has nothing to pay.
 * HTTP 422 — NOTHING_TO_PAY.
 */
export class NothingToPayError extends Error {
  readonly httpStatus = 422 as const;
  readonly code = 'NOTHING_TO_PAY' as const;

  constructor(operarioId: string, periodKey: string) {
    super(
      `El período "${periodKey}" del operario "${operarioId}" tiene saldo cero o negativo. ` +
        `No hay horas positivas para liquidar.`,
    );
    this.name = 'NothingToPayError';
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
