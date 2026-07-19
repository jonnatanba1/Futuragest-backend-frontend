/**
 * SurchargeValueCalculator — pure function to compute monetary value of surcharges.
 *
 * REQ-007 (SurchargeRate) + REQ-009 (CompensationPeriod category breakdown).
 *
 * Composite rates (e.g., dominical+nocturno) are calculated at runtime by
 * summing the individual percentage components — NOT pre-stored. This follows
 * the architecture decision: "Runtime composition. Only 4 base categories stored."
 *
 * All math uses Prisma Decimal (decimal.js) — NEVER float.
 * Results rounded HALF_UP to 2 decimal places.
 */

import { Decimal } from '@prisma/client/runtime/client';

const ZERO = new Decimal(0);
const ONE_HUNDRED = new Decimal(100);
const ROUNDING = Decimal.ROUND_HALF_UP;

/** The four base surcharge categories. */
export interface SurchargeRates {
  /** Percentage value for nocturnal surcharge (e.g., 35 means 35%). */
  RECARGO_NOCTURNO: Decimal;
  /** Percentage value for daytime overtime (e.g., 25 means 25%). */
  HORA_EXTRA_DIURNA: Decimal;
  /** Percentage value for nocturnal overtime (e.g., 75 means 75%). */
  HORA_EXTRA_NOCTURNA: Decimal;
  /** Percentage value for Sunday/holiday surcharge (e.g., 90 means 90%). */
  RECARGO_DOMINICAL_FESTIVO: Decimal;
}

/** Breakdown category hours from an attendance (or aggregated across a period). */
export interface BreakdownCategories {
  horasOrdinariasNocturnas: Decimal;
  horasExtraDiurnas: Decimal;
  horasExtraNocturnas: Decimal;
  /** Total classified hours across ALL categories (ordinary + extra, diurnal + nocturnal). */
  totalHoras: Decimal;
  esDominical: boolean;
  esFestivo: boolean;
}

/** Monetary value of surcharges, broken out by category. */
export interface SurchargeDetail {
  /** horasOrdinariasNocturnas × valorHora × RECARGO_NOCTURNO / 100 */
  nocturno: Decimal;
  /** horasExtraDiurnas × valorHora × HORA_EXTRA_DIURNA / 100 */
  extraDiurna: Decimal;
  /** horasExtraNocturnas × valorHora × HORA_EXTRA_NOCTURNA / 100 */
  extraNocturna: Decimal;
  /**
   * totalHoras × valorHora × RECARGO_DOMINICAL_FESTIVO / 100.
   * Only computed when esDominical=true or esFestivo=true.
   * Applied to ALL hours (totalHoras) — composite with other surcharges
   * means the same hour can receive both nocturnal AND dominical surcharge.
   */
  dominicalFestivo: Decimal;
  /** Sum of all individual surcharge line items. */
  total: Decimal;
}

/**
 * Calculate the monetary value of all applicable surcharges for a given
 * attendance breakdown.
 *
 * Pure function — same input always produces the same output. No DB, no DI.
 *
 * @param breakdown — category hours from AttendanceBreakdown
 * @param valorHoraOrdinaria — the worker's ordinary hourly wage (monetary value)
 * @param rates — the four base surcharge percentage rates
 * @returns SurchargeDetail with monetary values rounded HALF_UP to 2 dp
 */
export function calculateSurchargeValue(
  breakdown: BreakdownCategories,
  valorHoraOrdinaria: Decimal,
  rates: SurchargeRates,
): SurchargeDetail {
  const nocturno = breakdown.horasOrdinariasNocturnas
    .times(valorHoraOrdinaria)
    .times(rates.RECARGO_NOCTURNO)
    .dividedBy(ONE_HUNDRED)
    .toDecimalPlaces(2, ROUNDING);

  const extraDiurna = breakdown.horasExtraDiurnas
    .times(valorHoraOrdinaria)
    .times(rates.HORA_EXTRA_DIURNA)
    .dividedBy(ONE_HUNDRED)
    .toDecimalPlaces(2, ROUNDING);

  const extraNocturna = breakdown.horasExtraNocturnas
    .times(valorHoraOrdinaria)
    .times(rates.HORA_EXTRA_NOCTURNA)
    .dividedBy(ONE_HUNDRED)
    .toDecimalPlaces(2, ROUNDING);

  let dominicalFestivo = ZERO;
  if (breakdown.esDominical || breakdown.esFestivo) {
    dominicalFestivo = breakdown.totalHoras
      .times(valorHoraOrdinaria)
      .times(rates.RECARGO_DOMINICAL_FESTIVO)
      .dividedBy(ONE_HUNDRED)
      .toDecimalPlaces(2, ROUNDING);
  }

  const total = nocturno
    .plus(extraDiurna)
    .plus(extraNocturna)
    .plus(dominicalFestivo)
    .toDecimalPlaces(2, ROUNDING);

  return { nocturno, extraDiurna, extraNocturna, dominicalFestivo, total };
}
