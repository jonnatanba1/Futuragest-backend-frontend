/**
 * Payout — pure calculation of the payable amount for a closed fortnight's
 * POSITIVE balance, applying the overtime recargo factor.
 *
 * Decision #174-1: the hour-bank nets in HOURS; the recargo factor (1.25x daytime
 * in Colombia) is applied ONLY when PAYING the positive balance — here, not in the
 * balance calc. A negative or zero saldo yields 0 payable hours (a negative saldo
 * was already handled at close via its disposition: CARRY_OVER / PAYROLL_DEDUCTION).
 *
 * MVP scope (PR-C): a single daytime factor (RECARGO_DIURNO = 1.25). Nocturnal /
 * holiday / Sunday factors (1.75x, 2.0x, etc.) are a future extension — they would
 * require classifying each overtime hour by when it occurred, which the hour-bank
 * does not currently track. The result is expressed in PAYABLE HOURS (saldo *
 * factor); conversion to currency is payroll's responsibility (no hourly rate is
 * modeled here).
 *
 * Decimals are Prisma Decimal (decimal.js) — NEVER float. Rounding HALF_UP to 2 dp.
 */

import { Decimal } from '@prisma/client/runtime/client';

/** Colombia daytime overtime recargo factor (hora extra diurna = 1.25x). */
export const RECARGO_DIURNO = new Decimal('1.25');

const ZERO = new Decimal(0);
const ROUNDING = Decimal.ROUND_HALF_UP;

export interface PayoutResult {
  /** Positive balance in hours (base, no recargo). 0 when the period saldo is <= 0. */
  horasBase: Decimal;
  /** Recargo factor applied (1.25 daytime). */
  factorRecargo: Decimal;
  /** horasBase * factorRecargo, rounded HALF_UP to 2 dp — payable hours to liquidate. */
  horasPagables: Decimal;
}

/**
 * Compute the payout for a closed period's saldo. Pure — no DB, no DI.
 *
 * Only the POSITIVE part of the saldo is paid. saldo <= 0 → all zeros.
 */
export function calculatePayout(
  saldo: Decimal,
  factor: Decimal = RECARGO_DIURNO,
): PayoutResult {
  const horasBase = saldo.greaterThan(ZERO) ? saldo : ZERO;
  const horasPagables = horasBase.times(factor).toDecimalPlaces(2, ROUNDING);

  return {
    horasBase: horasBase.toDecimalPlaces(2, ROUNDING),
    factorRecargo: factor,
    horasPagables,
  };
}
