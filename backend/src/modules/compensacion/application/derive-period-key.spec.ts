/**
 * derivePeriodKey unit spec.
 * Q1 = days 1–15, Q2 = days 16–end of month.
 * Decision #174-4: Colombian payroll standard — two quincenas per month.
 */

import { derivePeriodKey } from './derive-period-key';

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
