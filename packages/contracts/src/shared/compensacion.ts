/**
 * Compensación de Horas — shared contract types.
 *
 * Hand-written mirrors of the backend response/request DTOs.
 * All Prisma Decimal fields are serialized as strings by the backend
 * (Decimal.toString()) — consumers must NOT parse them as JS floats.
 */

// ─── Disposition union ────────────────────────────────────────────────────────

export type CompensationDisposition = 'CARRY_OVER' | 'PAYROLL_DEDUCTION';

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Mirrors JornadaPolicyResponseDto from the backend. */
export interface JornadaPolicyDto {
  id: string;
  /** Daily work hours. Prisma Decimal serialized as string. e.g. "8.00" */
  horasDiarias: string;
  /** ISO 8601 effective date (Colombia local midnight stored as UTC). */
  vigenteDesde: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Per-day attendance breakdown entry. Mirrors DayBreakdownDto. */
export interface DayBreakdownDto {
  /** YYYY-MM-DD Colombia local date. */
  date: string;
  /** Raw hours worked (no lunch deduction). Decimal string. e.g. "8.50" */
  horasReales: string;
  /** JornadaPolicy hours for this day. Decimal string. e.g. "8.00" */
  jornadaHoras: string;
  /** horasReales − jornadaHoras. Decimal string (can be negative). e.g. "0.50" */
  delta: string;
}

/**
 * Live period balance. Mirrors PeriodBalanceResponseDto.
 * carryIn is the carry-over amount from the previous CARRY_OVER fortnight;
 * saldoHoras = carryIn + creditosHoras − debitosHoras.
 */
export interface PeriodBalanceDto {
  operarioId: string;
  /** YYYY-MM-DD range start (inclusive). */
  desde: string;
  /** YYYY-MM-DD range end (inclusive). */
  hasta: string;
  /** Σ positive deltas (hours). Decimal string. */
  creditosHoras: string;
  /** Σ |negative deltas| (hours). Decimal string. */
  debitosHoras: string;
  /** carryIn from previous CARRY_OVER period (≤ 0). Decimal string. */
  carryIn: string;
  /** carryIn + creditosHoras − debitosHoras. Decimal string. */
  saldoHoras: string;
  breakdown: DayBreakdownDto[];
}

/**
 * Closed compensation period snapshot. Mirrors CompensationPeriodResponseDto.
 * Returned by POST /compensacion/:operarioId/close.
 */
export interface CompensationPeriodDto {
  id: string;
  operarioId: string;
  /** Canonical fortnight identifier. e.g. "2026-05-Q1" */
  periodKey: string;
  desde: string;
  hasta: string;
  creditosHoras: string;
  debitosHoras: string;
  /** carryIn from previous CARRY_OVER period (≤ 0). Decimal string. */
  carryIn: string;
  saldoHoras: string;
  /** Disposition decision at close. null when saldo >= 0 (no action needed). */
  disposition: CompensationDisposition | null;
  approvedByUserId: string | null;
  /** ISO 8601 timestamp — when the close decision was made. */
  decidedAt: string | null;
  /** ISO 8601 timestamp — immutability lock (server time at close). */
  closedAt: string;
  /** Client-provided idempotency token. */
  clientRef: string | null;
  createdAt: string;
}

/** Payout calculation for a closed period. Mirrors PeriodPayoutResponseDto. */
export interface PeriodPayoutDto {
  operarioId: string;
  /** Canonical fortnight identifier. e.g. "2026-05-Q1" */
  periodKey: string;
  /** Frozen saldo of the closed period (can be ≤ 0). Decimal string. */
  saldoHoras: string;
  /** Payable base hours (positive saldo only; 0 if saldo ≤ 0). Decimal string. */
  horasBase: string;
  /** Recargo factor applied (1.25 daytime). Decimal string. */
  factorRecargo: string;
  /** horasBase × factorRecargo — payable hours to liquidate. Decimal string. */
  horasPagables: string;
}

// ─── Request types ────────────────────────────────────────────────────────────

/** Body for POST /compensacion/jornada-policy. */
export interface CreateJornadaPolicyRequest {
  /** Daily work hours as a number (backend validates range [0.5, 24]). */
  horasDiarias: number;
  /** Effective date — YYYY-MM-DD. */
  vigenteDesde: string;
}

/** Body for POST /compensacion/:operarioId/close. */
export interface ClosePeriodRequest {
  desde: string;
  hasta: string;
  /** Required when saldoHoras < 0. */
  disposition?: CompensationDisposition | null;
  /** Client-provided idempotency token. */
  clientRef?: string | null;
}
