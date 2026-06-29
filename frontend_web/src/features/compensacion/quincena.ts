/** Canonical fortnight identifier — Q1 (1st–15th) or Q2 (16th–last day). */
export type Quincena = 'Q1' | 'Q2';

export interface QuincenaRange {
  /** YYYY-MM-DD inclusive start */
  desde: string;
  /** YYYY-MM-DD inclusive end */
  hasta: string;
  /** e.g. "2026-05-Q1" */
  periodKey: string;
}

/**
 * Pure utility: computes the ISO date range and canonical period key for a
 * given year/month/quincena combination.
 *
 * @param year  Full year (e.g. 2026)
 * @param month 1-based month (1 = January … 12 = December)
 * @param q     'Q1' (1st–15th) | 'Q2' (16th–last day of month)
 */
export function quincenaToRange(year: number, month: number, q: Quincena): QuincenaRange {
  const mm = String(month).padStart(2, '0');

  if (q === 'Q1') {
    return {
      desde: `${year}-${mm}-01`,
      hasta: `${year}-${mm}-15`,
      periodKey: `${year}-${mm}-Q1`,
    };
  }

  // Last day of the month: new Date(year, month, 0) gives the 0th day of the
  // next month, which is the last day of the current month.
  const lastDay = new Date(year, month, 0).getDate();
  const dd = String(lastDay).padStart(2, '0');

  return {
    desde: `${year}-${mm}-16`,
    hasta: `${year}-${mm}-${dd}`,
    periodKey: `${year}-${mm}-Q2`,
  };
}
