import { Decimal } from '@prisma/client/runtime/client';

/**
 * Derives the quincena number in the year (1 to 24).
 * Q1 of Month M -> (M - 1) * 2 + 1
 * Q2 of Month M -> (M - 1) * 2 + 2
 *
 * e.g., "2026-07-06" (July 6) -> Month 7, Day 6 -> Q1 -> (7-1)*2+1 = 13.
 */
export function derivePslPeriodNumber(dateStr: string): number {
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);
  return day <= 15 ? (month - 1) * 2 + 1 : (month - 1) * 2 + 2;
}

/**
 * Converts a YYYY-MM-DD date string to Excel serial number.
 * e.g., "2026-07-01" -> 46206
 */
export function dateToExcelSerial(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const base = Date.UTC(1899, 11, 30);
  const diffMs = d.getTime() - base;
  return Math.floor(diffMs / 86400000);
}

/**
 * Converts decimal hours to H.MM format.
 * e.g., 5.50 -> "5.30", 2.30 (which is 2.50 decimal) -> "2.30"
 */
export function decimalHoursToHMM(hours: Decimal | number): string {
  const num = typeof hours === 'number' ? hours : hours.toNumber();
  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}.${String(m).padStart(2, '0')}`;
}
