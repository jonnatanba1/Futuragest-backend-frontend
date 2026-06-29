/**
 * CalculatePeriodBalanceUseCase — pure domain use-case (NO DB, NO DI).
 *
 * Accepts completed attendance records and a JornadaPolicy timeline; produces
 * a PeriodBalance value object. The use-case is deliberately free of Prisma
 * providers and NestJS decorators so it can be unit-tested without a DI container.
 *
 * Algorithm (spec §4, REQ-CALC-01–08):
 *   For each attendance with completedAt != null AND checkOutCapturedAt != null:
 *     1. horasReales = (checkOutCapturedAt - checkInCapturedAt) / 3 600 000 (hours)
 *     2. jornadaDelDia = horasDiarias of the MOST RECENT policy with vigenteDesde <= attendance.date
 *        (resolves by RECORD date, not current date — preserves historical accuracy)
 *     3. delta = horasReales - jornadaDelDia  (positive = overtime, negative = undertime)
 *     4. creditos += max(delta, 0); debitos += max(-delta, 0)
 *   saldo = carryIn + creditos - debitos
 *
 * Per-day rounding: each delta is rounded HALF_UP to 2 decimal places before
 * accumulating, so the displayed per-day breakdown reconciles exactly with totals.
 *
 * REQ-NF-01: No Prisma imports. REQ-NF-03: No float arithmetic for the bank.
 * REQ-CALC-04: No lunch/rest deduction (raw duration only).
 * REQ-PAY-BOUNDARY-02: No recargo factor applied here.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { PeriodBalance, DayBreakdown, CategoryBreakdown } from '../domain/period-balance.vo';
import { NoPolicyForDateError } from '../domain/compensacion.errors';
import { calculateSurchargeValue, type SurchargeRates } from '../domain/surcharge-value-calculator';

export interface CalculatePeriodBalanceInput {
  /** Only records with completedAt != null will be processed (caller may pass all). */
  attendances: AttendanceReaderRecord[];
  /** Sorted ascending by vigenteDesde (caller responsibility; safe for unsorted too). */
  policyTimeline: JornadaPolicyRecord[];
  /** Carry-over from a previous CARRY_OVER period. Defaults to 0. */
  carryIn?: Decimal;

  // ── T4.2: Enhanced compensation (REQ-009) ────────────────────────────
  /** When true, aggregate breakdown categories from AttendanceBreakdown data.
   *  Gate: COMPENSATION_BREAKDOWN_ENABLED env var. Default: false. */
  breakdownEnabled?: boolean;
  /** Worker's ordinary hourly wage (monetary). Required when breakdownEnabled=true
   *  to compute valorRecargos. */
  valorHoraOrdinaria?: Decimal;
  /** The four base surcharge percentage rates. Required when breakdownEnabled=true
   *  to compute valorRecargos. */
  surchargeRates?: SurchargeRates;
}

const ZERO = new Decimal(0);
const MS_PER_HOUR = 3_600_000;
const ROUNDING = Decimal.ROUND_HALF_UP;

/**
 * Fix 6 (Layer 2) — defensive skip bound.
 * Rows recorded before the check-out duration guard existed may have negative
 * or implausibly long durations. Skipping them (rather than clamping) is honest:
 * the data is garbage and must not poison the fortnight balance.
 * This constant must match MAX_SHIFT_HOURS in check-out-attendance.use-case.ts.
 */
const MAX_VALID_DURATION_MS = 20 * MS_PER_HOUR;

/** Resolve the applicable JornadaPolicy for a given date string (YYYY-MM-DD). */
function resolvePolicyForDate(
  dateStr: string,
  timeline: JornadaPolicyRecord[],
): JornadaPolicyRecord {
  // Compare as date strings — YYYY-MM-DD sorts lexicographically correctly.
  // We need vigenteDesde (stored as Date) <= attendance.date (string).
  // Convert vigenteDesde to 'YYYY-MM-DD' for comparison.
  const attendanceDateStr = dateStr;

  // Sort descending to find the most-recent policy with vigenteDesde <= date
  const sorted = [...timeline].sort(
    (a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime(),
  );

  for (const policy of sorted) {
    const policyDateStr = policy.vigenteDesde.toISOString().slice(0, 10);
    if (policyDateStr <= attendanceDateStr) {
      return policy;
    }
  }

  throw new NoPolicyForDateError(dateStr);
}

export class CalculatePeriodBalanceUseCase {
  /**
   * Pure synchronous execution — no async, no DB, no DI.
   *
   * Throws NoPolicyForDateError if any completed attendance has no applicable policy.
   */
  execute(input: CalculatePeriodBalanceInput): PeriodBalance {
    const {
      attendances,
      policyTimeline,
      carryIn = ZERO,
      breakdownEnabled = false,
      valorHoraOrdinaria,
      surchargeRates,
    } = input;

    const perDay: DayBreakdown[] = [];
    let creditos = ZERO;
    let debitos = ZERO;

    // T4.2: Aggregated breakdown categories (REQ-009)
    let hasBreakdown = false;
    let aggOrdDiurnas = ZERO;
    let aggOrdNocturnas = ZERO;
    let aggExtraDiurnas = ZERO;
    let aggExtraNocturnas = ZERO;
    let aggDomFestivas = ZERO;

    for (const att of attendances) {
      // Exclude incomplete records (completedAt null OR checkOutCapturedAt null)
      if (!att.completedAt || !att.checkOutCapturedAt) {
        continue;
      }

      // 1. horasReales — raw duration, no lunch deduction (REQ-CALC-04)
      const durationMs = att.checkOutCapturedAt.getTime() - att.checkInCapturedAt.getTime();

      // Fix 6 (Layer 2) — defensive skip
      if (durationMs <= 0 || durationMs > MAX_VALID_DURATION_MS) {
        continue;
      }

      const horasRealesRaw = new Decimal(durationMs).div(MS_PER_HOUR);
      const horasReales = horasRealesRaw.toDecimalPlaces(2, ROUNDING);

      // 2. jornadaDelDia — resolved by attendance date (REQ-CALC-05)
      const policy = resolvePolicyForDate(att.date, policyTimeline);
      const jornadaHoras = policy.horasDiarias;

      // 3. delta, rounded HALF_UP per day before accumulation
      const deltaRaw = horasReales.minus(jornadaHoras);
      const delta = deltaRaw.toDecimalPlaces(2, ROUNDING);

      // 4. accumulate
      if (delta.greaterThan(ZERO)) {
        creditos = creditos.plus(delta);
      } else if (delta.lessThan(ZERO)) {
        debitos = debitos.plus(delta.negated());
      }

      perDay.push({ date: att.date, horasReales, jornadaHoras, delta });

      // ── T4.2: Aggregate breakdown categories ──────────────────────────
      if (breakdownEnabled && att.breakdown) {
        hasBreakdown = true;
        const b = att.breakdown;
        aggOrdDiurnas = aggOrdDiurnas.plus(b.horasOrdinariasDiurnas);
        aggOrdNocturnas = aggOrdNocturnas.plus(b.horasOrdinariasNocturnas);
        aggExtraDiurnas = aggExtraDiurnas.plus(b.horasExtraDiurnas);
        aggExtraNocturnas = aggExtraNocturnas.plus(b.horasExtraNocturnas);
        if (b.esDominical || b.esFestivo) {
          aggDomFestivas = aggDomFestivas.plus(b.totalHoras);
        }
      }
    }

    const saldo = carryIn.plus(creditos).minus(debitos).toDecimalPlaces(2, ROUNDING);

    const result: PeriodBalance = {
      creditos: creditos.toDecimalPlaces(2, ROUNDING),
      debitos: debitos.toDecimalPlaces(2, ROUNDING),
      carryIn,
      saldo,
      perDay,
    };

    // ── T4.2: Attach breakdown aggregation and valorRecargos when enabled and data exists ──
    if (hasBreakdown) {
      const breakdown: CategoryBreakdown = {
        horasOrdinariasDiurnas: aggOrdDiurnas.toDecimalPlaces(2, ROUNDING),
        horasOrdinariasNocturnas: aggOrdNocturnas.toDecimalPlaces(2, ROUNDING),
        horasExtraDiurnas: aggExtraDiurnas.toDecimalPlaces(2, ROUNDING),
        horasExtraNocturnas: aggExtraNocturnas.toDecimalPlaces(2, ROUNDING),
        horasDominicalesFestivas: aggDomFestivas.toDecimalPlaces(2, ROUNDING),
      };
      result.breakdown = breakdown;

      // Compute valorRecargos if surcharge rates and hourly rate are available
      if (valorHoraOrdinaria && surchargeRates) {
        const surchargeDetail = calculateSurchargeValue(
          {
            horasOrdinariasNocturnas: aggOrdNocturnas,
            horasExtraDiurnas: aggExtraDiurnas,
            horasExtraNocturnas: aggExtraNocturnas,
            totalHoras: aggOrdDiurnas.plus(aggOrdNocturnas).plus(aggExtraDiurnas).plus(aggExtraNocturnas),
            esDominical: aggDomFestivas.greaterThan(ZERO),
            esFestivo: aggDomFestivas.greaterThan(ZERO),
          },
          valorHoraOrdinaria,
          surchargeRates,
        );
        result.valorRecargos = surchargeDetail.total;
      }
    }

    return result;
  }
}
