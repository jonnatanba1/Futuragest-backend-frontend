/**
 * T4.1 RED → GREEN → TRIANGULATE → REFACTOR
 * SurchargeValueCalculator — pure function unit tests.
 *
 * Covers REQ-007 (SurchargeRate) and REQ-009 (CompensationPeriod category breakdown).
 *
 * Scenarios:
 *   SC-1: Nocturnal ordinary hours → RECARGO_NOCTURNO applied
 *   SC-2: Extra diurna hours → HORA_EXTRA_DIURNA applied
 *   SC-3: Extra nocturna hours → HORA_EXTRA_NOCTURNA applied
 *   SC-4: Dominical/festivo → RECARGO_DOMINICAL_FESTIVO applied to totalHoras
 *   SC-5: Composite: nocturnal + dominical → both surcharges summed at runtime
 *   SC-6: All categories combined
 *   SC-7: Zero hours → all zeros
 *   SC-8: $0 hourly rate → all zeros
 */

import { Decimal } from '@prisma/client/runtime/client';
import {
  calculateSurchargeValue,
  type SurchargeRates,
  type BreakdownCategories,
} from './surcharge-value-calculator';

function dec(val: number | string): Decimal {
  return new Decimal(val);
}

function makeRates(overrides: Partial<Record<keyof SurchargeRates, number>> = {}): SurchargeRates {
  return {
    RECARGO_NOCTURNO: dec(overrides.RECARGO_NOCTURNO ?? 35),
    HORA_EXTRA_DIURNA: dec(overrides.HORA_EXTRA_DIURNA ?? 25),
    HORA_EXTRA_NOCTURNA: dec(overrides.HORA_EXTRA_NOCTURNA ?? 75),
    RECARGO_DOMINICAL_FESTIVO: dec(overrides.RECARGO_DOMINICAL_FESTIVO ?? 90),
  };
}

function makeBreakdown(
  overrides: Partial<{
    horasOrdinariasNocturnas: number;
    horasExtraDiurnas: number;
    horasExtraNocturnas: number;
    totalHoras: number;
    esDominical: boolean;
    esFestivo: boolean;
  }> = {},
): BreakdownCategories {
  return {
    horasOrdinariasNocturnas: dec(overrides.horasOrdinariasNocturnas ?? 0),
    horasExtraDiurnas: dec(overrides.horasExtraDiurnas ?? 0),
    horasExtraNocturnas: dec(overrides.horasExtraNocturnas ?? 0),
    totalHoras: dec(overrides.totalHoras ?? 0),
    esDominical: overrides.esDominical ?? false,
    esFestivo: overrides.esFestivo ?? false,
  };
}

describe('calculateSurchargeValue', () => {
  // ── SC-1: Nocturnal ordinary hours ──────────────────────────────────────

  it('SC-1 — recargo nocturno (35%) applied to horasOrdinariasNocturnas', () => {
    // 3h nocturnas ordinarias × $10k/h × 35% = $10.5k
    const breakdown = makeBreakdown({
      horasOrdinariasNocturnas: 3,
      totalHoras: 8,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    // 3 × 10000 × 0.35 = 10500
    expect(result.nocturno.toNumber()).toBeCloseTo(10500, 2);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(10500, 2);
  });

  // ── SC-2: Extra diurna hours ────────────────────────────────────────────

  it('SC-2 — extra diurna (25%) applied to horasExtraDiurnas', () => {
    // 2h extra diurna × $10k/h × 25% = $5k
    const breakdown = makeBreakdown({
      horasExtraDiurnas: 2,
      totalHoras: 10,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.extraDiurna.toNumber()).toBeCloseTo(5000, 2);
    expect(result.nocturno.toNumber()).toBe(0);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(5000, 2);
  });

  // ── SC-3: Extra nocturna hours ──────────────────────────────────────────

  it('SC-3 — extra nocturna (75%) applied to horasExtraNocturnas', () => {
    // 1.5h extra nocturna × $10k/h × 75% = $11.25k
    const breakdown = makeBreakdown({
      horasExtraNocturnas: 1.5,
      totalHoras: 9.5,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    // 1.5 × 10000 × 0.75 = 11250
    expect(result.extraNocturna.toNumber()).toBeCloseTo(11250, 2);
    expect(result.nocturno.toNumber()).toBe(0);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(11250, 2);
  });

  // ── SC-4: Dominical/Festivo surcharge ───────────────────────────────────

  it('SC-4 — dominical (90%) applied to totalHoras on Sunday', () => {
    // 7.5h total on Sunday × $10k/h × 90% = $67.5k
    const breakdown = makeBreakdown({
      totalHoras: 7.5,
      esDominical: true,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    // 7.5 × 10000 × 0.90 = 67500
    expect(result.dominicalFestivo.toNumber()).toBeCloseTo(67500, 2);
    expect(result.nocturno.toNumber()).toBe(0);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(67500, 2);
  });

  it('SC-4b — festivo surcharge same as dominical (90%)', () => {
    // 8h total on holiday × $10k/h × 90% = $72k
    const breakdown = makeBreakdown({
      totalHoras: 8,
      esFestivo: true,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.dominicalFestivo.toNumber()).toBeCloseTo(72000, 2);
    expect(result.total.toNumber()).toBeCloseTo(72000, 2);
  });

  it('SC-4c — not Sunday nor holiday → no dominical surcharge', () => {
    const breakdown = makeBreakdown({
      totalHoras: 8,
      esDominical: false,
      esFestivo: false,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBe(0);
  });

  // ── SC-5: Composite rates — nocturnal + dominical ───────────────────────

  it('SC-5 — composite: dominical + nocturno surcharges summed at runtime', () => {
    // Sunday night shift: 3h ordinarias nocturnas + 5h ordinarias diurnas = 8h total
    // Recargo nocturno: 3 × $10k × 35% = $10.5k
    // Recargo dominical: 8 × $10k × 90% = $72k
    // Total: $82.5k (runtime sum of percentages: 35% + 90% = 125%)
    const breakdown = makeBreakdown({
      horasOrdinariasNocturnas: 3,
      totalHoras: 8,
      esDominical: true,
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.nocturno.toNumber()).toBeCloseTo(10500, 2);
    expect(result.dominicalFestivo.toNumber()).toBeCloseTo(72000, 2);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(82500, 2);
  });

  // ── SC-6: All categories combined ───────────────────────────────────────

  it('SC-6 — all surcharges combined (REQ-009 example: 2h noct + 1h extra diur, $10k/h)', () => {
    // From REQ-009 spec table: "2h nocturna + 1h extra diurna, $10k/h | valorRecargos = 2×10k×0.35 + 1×10k×0.25 = $9.5k"
    // But REQ-009 example didn't mention dominical/festivo, so those are 0.
    // Nocturno: 2 × 10000 × 0.35 = 7000
    // Extra diurna: 1 × 10000 × 0.25 = 2500
    // Total: 9500
    const breakdown = makeBreakdown({
      horasOrdinariasNocturnas: 2,
      horasExtraDiurnas: 1,
      totalHoras: 10.5, // 7.5 ordinary diurnal + 2 ordinary nocturnal + 1 extra diurnal
    });
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.nocturno.toNumber()).toBeCloseTo(7000, 2);
    expect(result.extraDiurna.toNumber()).toBeCloseTo(2500, 2);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBeCloseTo(9500, 2);
  });

  // ── SC-7: Edge cases ────────────────────────────────────────────────────

  it('SC-7a — zero hours → all zeros', () => {
    const breakdown = makeBreakdown();
    const rates = makeRates();
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.nocturno.toNumber()).toBe(0);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.extraNocturna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBe(0);
  });

  it('SC-7b — zero valorHora → all zeros', () => {
    const breakdown = makeBreakdown({
      horasOrdinariasNocturnas: 5,
      horasExtraDiurnas: 2,
      totalHoras: 15,
      esDominical: true,
    });
    const rates = makeRates();
    const valorHora = dec(0);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.total.toNumber()).toBe(0);
    expect(result.nocturno.toNumber()).toBe(0);
    expect(result.extraDiurna.toNumber()).toBe(0);
    expect(result.dominicalFestivo.toNumber()).toBe(0);
  });

  // ── SC-8: Effective-dated rates (different values) ──────────────────────

  it('SC-8a — 80% dominical rate (pre-July 2026)', () => {
    // 7.5h Sunday × $10k/h × 80% = $60k
    const breakdown = makeBreakdown({
      totalHoras: 7.5,
      esDominical: true,
    });
    const rates = makeRates({ RECARGO_DOMINICAL_FESTIVO: 80 });
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.dominicalFestivo.toNumber()).toBeCloseTo(60000, 2);
    expect(result.total.toNumber()).toBeCloseTo(60000, 2);
  });

  it('SC-8b — 100% dominical rate (post-July 2027)', () => {
    // 7.5h Sunday × $10k/h × 100% = $75k
    const breakdown = makeBreakdown({
      totalHoras: 7.5,
      esDominical: true,
    });
    const rates = makeRates({ RECARGO_DOMINICAL_FESTIVO: 100 });
    const valorHora = dec(10000);

    const result = calculateSurchargeValue(breakdown, valorHora, rates);

    expect(result.dominicalFestivo.toNumber()).toBeCloseTo(75000, 2);
    expect(result.total.toNumber()).toBeCloseTo(75000, 2);
  });
});
