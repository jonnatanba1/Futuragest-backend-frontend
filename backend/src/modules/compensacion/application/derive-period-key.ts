/**
 * derivePeriodKey — pure helpers for canonical fortnight identifiers.
 *
 * Colombian payroll standard (decision #174-4):
 *   Q1 = days 1–15  of the month → "YYYY-MM-Q1"
 *   Q2 = days 16–end of the month → "YYYY-MM-Q2"
 *
 * All functions are pure — no side effects, no async, no DB.
 * Reused by PR-B (CloseCompensationPeriodUseCase, GetPeriodBalanceUseCase)
 * and any future fortnight logic.
 */

/** Derives the canonical fortnight identifier from a YYYY-MM-DD date string. */
export function derivePeriodKey(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const yearMonth = dateStr.slice(0, 7); // "YYYY-MM"
  const day = parseInt(dateStr.slice(8, 10), 10);
  const half = day <= 15 ? 'Q1' : 'Q2';
  return `${yearMonth}-${half}`;
}

/**
 * deriveFortnightRange — returns the canonical {desde, hasta} for a periodKey.
 *
 * Q1: desde = day 01, hasta = day 15.
 * Q2: desde = day 16, hasta = last day of month.
 *
 * Last day of month is computed with Date.UTC(y, m, 0).getUTCDate()
 * (setting day=0 on month m gives the last day of month m-1).
 *
 * Input: "YYYY-MM-Q1" | "YYYY-MM-Q2"
 * Output: { desde: "YYYY-MM-DD", hasta: "YYYY-MM-DD" }
 */
export function deriveFortnightRange(periodKey: string): { desde: string; hasta: string } {
  // periodKey: "YYYY-MM-Q1" or "YYYY-MM-Q2"
  const parts = periodKey.split('-'); // ["YYYY", "MM", "Q1|Q2"]
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const half = parts[2]; // "Q1" or "Q2"
  const yearMonthPrefix = `${parts[0]}-${parts[1]}`;

  if (half === 'Q1') {
    return {
      desde: `${yearMonthPrefix}-01`,
      hasta: `${yearMonthPrefix}-15`,
    };
  }

  // Q2: hasta = last day of month
  // Date.UTC(year, month, 0) → last day of month `month` (month is 1-based here,
  // JS month is 0-based: month index = month for the previous month trick).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = String(lastDay).padStart(2, '0');
  return {
    desde: `${yearMonthPrefix}-16`,
    hasta: `${yearMonthPrefix}-${lastDayStr}`,
  };
}

/**
 * derivePreviousPeriodKey — returns the immediately preceding fortnight key.
 *
 * "YYYY-MM-Q2" → "YYYY-MM-Q1"
 * "YYYY-MM-Q1" → "YYYY-(MM-1)-Q2" (or previous year December Q2)
 *
 * Returns null only if the period is the conceptual first possible key
 * (this is effectively never reached in practice — guards callers against
 * infinite loops or sentinel values).
 */
export function derivePreviousPeriodKey(periodKey: string): string | null {
  const parts = periodKey.split('-'); // ["YYYY", "MM", "Q1"] or ["YYYY", "MM", "Q2"]
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const half = parts[2]; // "Q1" or "Q2"

  if (half === 'Q2') {
    // Previous is Q1 of the same month
    return `${parts[0]}-${parts[1]}-Q1`;
  }

  // half === "Q1" → previous is Q2 of the previous month
  if (month === 1) {
    // January Q1 → December Q2 of previous year
    return `${year - 1}-12-Q2`;
  }

  const prevMonth = String(month - 1).padStart(2, '0');
  return `${parts[0]}-${prevMonth}-Q2`;
}
