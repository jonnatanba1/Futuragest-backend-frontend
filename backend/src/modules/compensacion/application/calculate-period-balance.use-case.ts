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
import type { SurchargeRates } from '../domain/surcharge-value-calculator';

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
  /** The four base surcharge percentage rates. Used for category breakdown display. */
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

/** Resolve the applicable JornadaPolicy for a given attendance record. */
function resolvePolicyForRecord(
  att: AttendanceReaderRecord,
  timeline: JornadaPolicyRecord[],
): JornadaPolicyRecord {
  const attendanceDateStr = att.date;
  const operarioId = att.operarioId;
  const zoneId = att.zoneId ?? null;

  // C-01: 3-level scope precedence — operario override > zone > global.
  // Try each scope tier in order; within each tier, pick the most recent
  // policy with vigenteDesde <= attendance date.
  const scopes = [
    // Tier 1: operario-level override
    (p: JornadaPolicyRecord) => p.operarioId === operarioId,
    // Tier 2: zone-level (no operario override)
    (p: JornadaPolicyRecord) => p.operarioId === null && p.zoneId === zoneId,
    // Tier 3: global fallback
    (p: JornadaPolicyRecord) => p.operarioId === null && p.zoneId === null,
  ];

  for (const scopeFilter of scopes) {
    const scoped = timeline.filter(scopeFilter);
    if (scoped.length === 0) continue;

    const sorted = [...scoped].sort(
      (a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime(),
    );
    for (const policy of sorted) {
      const policyDateStr = policy.vigenteDesde.toISOString().slice(0, 10);
      if (policyDateStr <= attendanceDateStr) {
        return policy;
      }
    }
  }

  throw new NoPolicyForDateError(attendanceDateStr);
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
    let aggDominicales = ZERO;
    let aggFestivas = ZERO;

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

      // GAP-1: When the attendance has been classified by the engine,
      // use breakdown.totalHoras (net, lunch/breakfast deducted) as the
      // authoritative worked hours for delta calculation. horasReales
      // (raw duration) is preserved in perDay for traceability only.
      const horasTrabajadas = att.breakdown
        ? att.breakdown.totalHoras.toDecimalPlaces(2, ROUNDING)
        : horasReales;

      // 2. jornadaDelDia — resolved by attendance record with scope precedence
      const policy = resolvePolicyForRecord(att, policyTimeline);
      const jornadaHoras = policy.horasDiarias;

      // 3. delta, rounded HALF_UP per day before accumulation
      const deltaRaw = horasTrabajadas.minus(jornadaHoras);
      const delta = deltaRaw.toDecimalPlaces(2, ROUNDING);

      // 4. accumulate
      if (delta.greaterThan(ZERO)) {
        creditos = creditos.plus(delta);
      } else if (delta.lessThan(ZERO)) {
        debitos = debitos.plus(delta.negated());
      }

      perDay.push({ date: att.date, horasReales, horasTrabajadas, jornadaHoras, delta });

      // ── T4.2: Aggregate breakdown categories ──────────────────────────
      if (breakdownEnabled && att.breakdown) {
        hasBreakdown = true;
        const b = att.breakdown;
        aggOrdDiurnas = aggOrdDiurnas.plus(b.horasOrdinariasDiurnas);
        aggOrdNocturnas = aggOrdNocturnas.plus(b.horasOrdinariasNocturnas);
        aggExtraDiurnas = aggExtraDiurnas.plus(b.horasExtraDiurnas);
        aggExtraNocturnas = aggExtraNocturnas.plus(b.horasExtraNocturnas);
        if (b.esDominical) {
          aggDominicales = aggDominicales.plus(b.totalHoras);
        }
        if (b.esFestivo) {
          aggFestivas = aggFestivas.plus(b.totalHoras);
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
        horasDominicalesFestivas: aggDominicales.plus(aggFestivas).toDecimalPlaces(2, ROUNDING),
      };
      result.breakdown = breakdown;
    }

    return result;
  }
}
