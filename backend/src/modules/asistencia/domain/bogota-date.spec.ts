/**
 * Fix 8 — toBogotaDate unit tests (RED → GREEN).
 *
 * Colombia is UTC-5, no DST. Boundary cases around midnight Bogotá time:
 *   - 04:59:59Z = 23:59:59 local → previous day
 *   - 05:00:00Z = 00:00:00 local → current day
 */

import { toBogotaDate } from './bogota-date';

describe('toBogotaDate', () => {
  it('F8-boundary-1: 2026-06-02T04:59:59Z → "2026-06-01" (just before Bogotá midnight)', () => {
    const instant = new Date('2026-06-02T04:59:59Z');
    expect(toBogotaDate(instant)).toBe('2026-06-01');
  });

  it('F8-boundary-2: 2026-06-02T05:00:00Z → "2026-06-02" (exactly Bogotá midnight)', () => {
    const instant = new Date('2026-06-02T05:00:00Z');
    expect(toBogotaDate(instant)).toBe('2026-06-02');
  });

  it('F8-midday: 2026-06-09T15:30:00Z → "2026-06-09" (plain midday Bogotá = 10:30 local)', () => {
    const instant = new Date('2026-06-09T15:30:00Z');
    expect(toBogotaDate(instant)).toBe('2026-06-09');
  });
});
