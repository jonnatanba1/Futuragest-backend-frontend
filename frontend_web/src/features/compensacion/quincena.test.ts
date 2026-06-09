import { describe, expect, it } from 'vitest';
import { quincenaToRange } from './quincena';

describe('quincenaToRange', () => {
  // QR-1: Q1 standard month (31-day)
  it('Q1 returns 01–15 for May 2026', () => {
    const result = quincenaToRange(2026, 5, 'Q1');
    expect(result).toEqual({
      desde: '2026-05-01',
      hasta: '2026-05-15',
      periodKey: '2026-05-Q1',
    });
  });

  // QR-2: Q2 31-day month
  it('Q2 returns 16–31 for May 2026', () => {
    const result = quincenaToRange(2026, 5, 'Q2');
    expect(result).toEqual({
      desde: '2026-05-16',
      hasta: '2026-05-31',
      periodKey: '2026-05-Q2',
    });
  });

  // QR-3: Q2 30-day month
  it('Q2 returns 16–30 for June 2026', () => {
    const result = quincenaToRange(2026, 6, 'Q2');
    expect(result).toEqual({
      desde: '2026-06-16',
      hasta: '2026-06-30',
      periodKey: '2026-06-Q2',
    });
  });

  // QR-4: Q2 February non-leap year
  it('Q2 returns 16–28 for February 2025 (non-leap)', () => {
    const result = quincenaToRange(2025, 2, 'Q2');
    expect(result).toEqual({
      desde: '2025-02-16',
      hasta: '2025-02-28',
      periodKey: '2025-02-Q2',
    });
  });

  // QR-5: Q2 February leap year
  it('Q2 returns 16–29 for February 2024 (leap)', () => {
    const result = quincenaToRange(2024, 2, 'Q2');
    expect(result).toEqual({
      desde: '2024-02-16',
      hasta: '2024-02-29',
      periodKey: '2024-02-Q2',
    });
  });

  // QR-6: Single-digit month zero-padded in periodKey
  it('zero-pads single-digit month in periodKey', () => {
    const result = quincenaToRange(2026, 3, 'Q1');
    expect(result.periodKey).toBe('2026-03-Q1');
    expect(result.desde).toBe('2026-03-01');
    expect(result.hasta).toBe('2026-03-15');
  });

  // QR-7: Q2 28-day February (another non-leap)
  it('Q2 returns 16–28 for February 2023 (non-leap)', () => {
    const result = quincenaToRange(2023, 2, 'Q2');
    expect(result.hasta).toBe('2023-02-28');
  });

  // Extra: Q1 always ends on the 15th regardless of month
  it('Q1 always ends on 15th', () => {
    expect(quincenaToRange(2026, 2, 'Q1').hasta).toBe('2026-02-15');
    expect(quincenaToRange(2026, 12, 'Q1').hasta).toBe('2026-12-15');
  });

  // Extra: December Q2 ends on 31st
  it('Q2 December 2026 ends on 31', () => {
    const result = quincenaToRange(2026, 12, 'Q2');
    expect(result.hasta).toBe('2026-12-31');
    expect(result.periodKey).toBe('2026-12-Q2');
  });
});
