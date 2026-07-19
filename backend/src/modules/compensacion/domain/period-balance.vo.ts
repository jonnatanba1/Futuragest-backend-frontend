/**
 * PeriodBalance — value object produced by CalculatePeriodBalanceUseCase.
 *
 * Decimals are Prisma Decimal (decimal.js) — NEVER float.
 * saldo = carryIn + creditos - debitos.
 *
 * perDay[] rows represent the per-day breakdown. Each entry corresponds to
 * one completed Attendance record that fell inside the requested date range.
 */

import type { Decimal } from '@prisma/client/runtime/client';

export interface DayBreakdown {
  /** YYYY-MM-DD Colombia local — the Attendance.date field. */
  date: string;
  /** Raw duration = checkOutCapturedAt - checkInCapturedAt (no lunch deduction). */
  horasReales: Decimal;
  /**
   * Net hours worked (lunch/breakfast deducted). Populated when the attendance
   * has been classified by TimeClassificationEngine and a breakdown exists.
   * When absent, equals horasReales (raw duration).
   * This is the authoritative figure for delta calculation (GAP-1 fix).
   */
  horasTrabajadas?: Decimal;
  /** jornadaDelDia from the applicable JornadaPolicy (resolved by record date). */
  jornadaHoras: Decimal;
  /** horasReales - jornadaHoras (positive = overtime, negative = undertime). */
  delta: Decimal;
}

/**
 * Aggregated category breakdown from AttendanceBreakdown records (REQ-009).
 * Only populated when breakdownEnabled=true and at least one attendance has breakdown data.
 */
export interface CategoryBreakdown {
  horasOrdinariasDiurnas: Decimal;
  horasOrdinariasNocturnas: Decimal;
  horasExtraDiurnas: Decimal;
  horasExtraNocturnas: Decimal;
  /** Σ totalHoras from attendances with esDominical=true or esFestivo=true. */
  horasDominicalesFestivas: Decimal;
}

export interface PeriodBalance {
  /** Σ max(delta, 0) across all completed days. Always >= 0. */
  creditos: Decimal;
  /** Σ max(-delta, 0) across all completed days. Always >= 0. */
  debitos: Decimal;
  /** Injected carry-over from a previous CARRY_OVER period. Default: 0. */
  carryIn: Decimal;
  /** carryIn + creditos - debitos. Can be negative. */
  saldo: Decimal;
  /** Per-day breakdown — one entry per completed Attendance in range. */
  perDay: DayBreakdown[];

  // ── T4.2: Enhanced compensation (REQ-009) ─────────────────────────────────
  /** Aggregated category breakdown. Undefined when breakdownEnabled=false or no data. */
  breakdown?: CategoryBreakdown;

  // Closed period metadata resolved on-demand during getBalance read.
  isClosed?: boolean;
  disposition?: 'CARRY_OVER' | 'PAYROLL_DEDUCTION' | null;
  paidAt?: Date | null;
  payoutRef?: string | null;
  /**
   * When attendance data changed inside this already-closed period,
   * making the live recomputation diverge from the frozen snapshot.
   */
  divergedAt?: Date | null;
}
