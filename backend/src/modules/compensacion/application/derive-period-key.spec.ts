/**
 * derivePeriodKey unit spec.
 * Q1 = days 1–15, Q2 = days 16–end of month.
 * Decision #174-4: Colombian payroll standard — two quincenas per month.
 *
 * Also covers deriveFortnightRange (Fix 2) and derivePreviousPeriodKey (Fix 3).
 */

import { derivePeriodKey, deriveFortnightRange, derivePreviousPeriodKey } from './derive-period-key';

describe('derivePeriodKey', () => {
  it('day 1 → Q1', () => {
    expect(derivePeriodKey('2026-05-01')).toBe('2026-05-Q1');
  });

  it('day 15 → Q1', () => {
    expect(derivePeriodKey('2026-05-15')).toBe('2026-05-Q1');
  });

  it('day 16 → Q2', () => {
    expect(derivePeriodKey('2026-05-16')).toBe('2026-05-Q2');
  });

  it('day 31 → Q2', () => {
    expect(derivePeriodKey('2026-05-31')).toBe('2026-05-Q2');
  });

  it('day 28 (Feb) → Q2', () => {
    expect(derivePeriodKey('2026-02-28')).toBe('2026-02-Q2');
  });

  it('different month year maintained', () => {
    expect(derivePeriodKey('2025-12-15')).toBe('2025-12-Q1');
  });
});

// ── Fix 2: deriveFortnightRange ───────────────────────────────────────────────

describe('deriveFortnightRange', () => {
  it('Q1 range: desde = day 01, hasta = day 15', () => {
    const range = deriveFortnightRange('2026-05-Q1');
    expect(range.desde).toBe('2026-05-01');
    expect(range.hasta).toBe('2026-05-15');
  });

  it('Q2 range: desde = day 16, hasta = last day of month (May = 31)', () => {
    const range = deriveFortnightRange('2026-05-Q2');
    expect(range.desde).toBe('2026-05-16');
    expect(range.hasta).toBe('2026-05-31');
  });

  it('Q2 February non-leap: hasta = 28', () => {
    const range = deriveFortnightRange('2026-02-Q2');
    expect(range.desde).toBe('2026-02-16');
    expect(range.hasta).toBe('2026-02-28');
  });

  it('Q2 February leap year: hasta = 29', () => {
    const range = deriveFortnightRange('2024-02-Q2');
    expect(range.desde).toBe('2024-02-16');
    expect(range.hasta).toBe('2024-02-29');
  });

  it('Q2 April (30 days): hasta = 30', () => {
    const range = deriveFortnightRange('2026-04-Q2');
    expect(range.desde).toBe('2026-04-16');
    expect(range.hasta).toBe('2026-04-30');
  });

  it('Q1 January: desde = 01, hasta = 15', () => {
    const range = deriveFortnightRange('2026-01-Q1');
    expect(range.desde).toBe('2026-01-01');
    expect(range.hasta).toBe('2026-01-15');
  });
});

// ── Fix 3: derivePreviousPeriodKey ────────────────────────────────────────────

describe('derivePreviousPeriodKey', () => {
  it('Q2 → Q1 same month', () => {
    expect(derivePreviousPeriodKey('2026-05-Q2')).toBe('2026-05-Q1');
  });

  it('Q1 → Q2 previous month', () => {
    expect(derivePreviousPeriodKey('2026-05-Q1')).toBe('2026-04-Q2');
  });

  it('January Q1 → December Q2 of previous year', () => {
    expect(derivePreviousPeriodKey('2026-01-Q1')).toBe('2025-12-Q2');
  });

  it('June Q1 → May Q2 (month boundary)', () => {
    expect(derivePreviousPeriodKey('2026-06-Q1')).toBe('2026-05-Q2');
  });
});
