/**
 * derivePeriodKey — pure helper to compute the canonical fortnight identifier.
 *
 * Colombian payroll standard (decision #174-4):
 *   Q1 = days 1–15  of the month → "YYYY-MM-Q1"
 *   Q2 = days 16–end of the month → "YYYY-MM-Q2"
 *
 * Input: "YYYY-MM-DD" (Colombia local date string — no timezone conversion needed).
 * Output: "YYYY-MM-Q1" | "YYYY-MM-Q2"
 *
 * Pure function — no side effects, no async, no DB.
 * Reused by PR-B (CloseCompensationPeriodUseCase) and any future fortnight logic.
 */

export function derivePeriodKey(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const yearMonth = dateStr.slice(0, 7); // "YYYY-MM"
  const day = parseInt(dateStr.slice(8, 10), 10);
  const half = day <= 15 ? 'Q1' : 'Q2';
  return `${yearMonth}-${half}`;
}
