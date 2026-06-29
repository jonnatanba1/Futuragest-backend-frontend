/**
 * A3.1 RED → A3.2 GREEN: CalculatePeriodBalanceUseCase unit spec.
 *
 * This use-case is PURE — no DB, no DI, no Prisma calls.
 * All inputs are plain objects; the Decimal import comes from @prisma/client/runtime/library.
 *
 * Covers spec §4: CALC-02a/b, CALC-03a/b/c, CALC-04a, CALC-05a/b,
 *                 CALC-06a, CALC-07a, CALC-08.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { NoPolicyForDateError } from '../domain/compensacion.errors';
import type { AttendanceReaderRecord } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { SurchargeRates } from '../domain/surcharge-value-calculator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAttendance(
  date: string,
  checkInHourUTC: number,
  durationHours: number,
  completed = true,
): AttendanceReaderRecord {
  const checkIn = new Date(`${date}T${String(checkInHourUTC).padStart(2, '0')}:00:00Z`);
  const checkOut = new Date(checkIn.getTime() + durationHours * 3600_000);
  return {
    id: `att-${date}`,
    operarioId: 'O1',
    date,
    checkInCapturedAt: checkIn,
    checkOutCapturedAt: completed ? checkOut : null,
    completedAt: completed ? checkOut : null,
  };
}

function makePolicy(vigenteDesdeStr: string, horasDiarias: number): JornadaPolicyRecord {
  return {
    id: `pol-${vigenteDesdeStr}`,
    horasDiarias: new Decimal(horasDiarias),
    vigenteDesde: new Date(`${vigenteDesdeStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

describe('CalculatePeriodBalanceUseCase', () => {
  let useCase: CalculatePeriodBalanceUseCase;

  beforeEach(() => {
    useCase = new CalculatePeriodBalanceUseCase();
  });

  // ── CALC-02 — Only completed attendances count ─────────────────────────────

  it('CALC-02a — excludes attendance with null completedAt', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const attendances = [
      makeAttendance('2026-05-01', 7, 8, true),
      makeAttendance('2026-05-02', 7, 8, false), // completedAt = null
    ];

    const result = useCase.execute({ attendances, policyTimeline: policies });

    expect(result.perDay).toHaveLength(1);
    expect(result.perDay[0].date).toBe('2026-05-01');
    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
  });

  it('CALC-02b — null checkOutCapturedAt excluded (in-progress attendance)', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const inProgress: AttendanceReaderRecord = {
      id: 'att-inprogress',
      operarioId: 'O1',
      date: '2026-05-03',
      checkInCapturedAt: new Date('2026-05-03T07:00:00Z'),
      checkOutCapturedAt: null,
      completedAt: null,
    };

    const result = useCase.execute({ attendances: [inProgress], policyTimeline: policies });

    expect(result.perDay).toHaveLength(0);
    expect(result.saldo.toNumber()).toBe(0);
  });

  // ── CALC-03 — horasReales = checkOut - checkIn ─────────────────────────────

  it('CALC-03a — exact 8h shift vs 8h policy → delta = 0', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2026-05-01', 7, 8);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay).toHaveLength(1);
    expect(result.perDay[0].horasReales.toNumber()).toBe(8);
    expect(result.perDay[0].delta.toNumber()).toBe(0);
    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(0);
  });

  it('CALC-03b — 8.5h shift vs 8h policy → creditos 0.5, debitos 0', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2026-05-01', 7, 8.5);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay[0].delta.toNumber()).toBe(0.5);
    expect(result.creditos.toNumber()).toBe(0.5);
    expect(result.debitos.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0.5);
  });

  it('CALC-03c — 7h shift vs 8h policy → debitos 1, creditos 0', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2026-05-01', 7, 7);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay[0].delta.toNumber()).toBe(-1);
    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(1);
    expect(result.saldo.toNumber()).toBe(-1);
  });

  // ── CALC-04 — No lunch deduction ──────────────────────────────────────────

  it('CALC-04a — 9h shift → horasReales = 9 (no rest deducted)', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2026-05-01', 7, 9);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay[0].horasReales.toNumber()).toBe(9);
    expect(result.perDay[0].delta.toNumber()).toBe(1);
  });

  // ── CALC-05 — Policy resolved by record date, not current date ────────────

  it('CALC-05a — attendance on 2025-12-31 resolves to P1 (8h), not P2 (7.5h)', () => {
    const policies = [
      makePolicy('2025-01-01', 8),  // P1
      makePolicy('2026-06-01', 7.5), // P2
    ];
    const att = makeAttendance('2025-12-31', 7, 8);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay[0].jornadaHoras.toNumber()).toBe(8);
    expect(result.perDay[0].delta.toNumber()).toBe(0);
  });

  it('CALC-05b — attendance on exact vigenteDesde of P2 resolves to P2 (7.5h)', () => {
    const policies = [
      makePolicy('2025-01-01', 8),
      makePolicy('2026-06-01', 7.5),
    ];
    const att = makeAttendance('2026-06-01', 7, 7.5);

    const result = useCase.execute({ attendances: [att], policyTimeline: policies });

    expect(result.perDay[0].jornadaHoras.toNumber()).toBe(7.5);
    expect(result.perDay[0].delta.toNumber()).toBe(0);
  });

  // ── CALC-06 — No policy covering date → error ─────────────────────────────

  it('CALC-06a — attendance date before earliest policy → NoPolicyForDateError', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2025-12-31', 7, 8);

    expect(() =>
      useCase.execute({ attendances: [att], policyTimeline: policies }),
    ).toThrow(NoPolicyForDateError);
  });

  // ── CALC-07 — saldo = creditos - debitos ─────────────────────────────────

  it('CALC-07a — mixed period: +0.5h, -1h, +0.25h → creditos=0.75, debitos=1.0, saldo=-0.25', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const attendances = [
      makeAttendance('2026-05-01', 7, 8.5), // +0.5
      makeAttendance('2026-05-02', 7, 7),   // -1.0
      makeAttendance('2026-05-03', 7, 8.25),// +0.25
    ];

    const result = useCase.execute({ attendances, policyTimeline: policies });

    expect(result.creditos.toNumber()).toBeCloseTo(0.75, 2);
    expect(result.debitos.toNumber()).toBeCloseTo(1.0, 2);
    expect(result.saldo.toNumber()).toBeCloseTo(-0.25, 2);
  });

  // ── CALC-08 — Deactivated operario: pre-deactivation records included ──────

  it('CALC-08 — completed attendances before deactivation date are included', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    // Attendances with completedAt set (pre-deactivation, period 2026-05-01..09)
    const attendances = [
      makeAttendance('2026-05-01', 7, 8, true),
      makeAttendance('2026-05-02', 7, 8, true),
    ];

    // Should NOT throw — deactivated operario's past records are valid
    const result = useCase.execute({ attendances, policyTimeline: policies });

    expect(result.perDay).toHaveLength(2);
    expect(result.saldo.toNumber()).toBe(0);
  });

  // ── carryIn injected param ────────────────────────────────────────────────

  it('carryIn is added to saldo', () => {
    const policies = [makePolicy('2026-01-01', 8)];
    const att = makeAttendance('2026-05-01', 7, 8); // delta = 0

    const result = useCase.execute({
      attendances: [att],
      policyTimeline: policies,
      carryIn: new Decimal('-0.25'),
    });

    expect(result.carryIn.toNumber()).toBe(-0.25);
    expect(result.saldo.toNumber()).toBe(-0.25); // 0 + (-0.25)
  });

  // ── Empty period ──────────────────────────────────────────────────────────

  it('no completed attendances → zeros across the board', () => {
    const policies = [makePolicy('2026-01-01', 8)];

    const result = useCase.execute({ attendances: [], policyTimeline: policies });

    expect(result.perDay).toHaveLength(0);
    expect(result.creditos.toNumber()).toBe(0);
    expect(result.debitos.toNumber()).toBe(0);
    expect(result.saldo.toNumber()).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T4.2 — Enhanced period balance with breakdown aggregation (REQ-009)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('breakdown-enabled (REQ-009)', () => {
    function makeAttendanceWithBreakdown(
      date: string,
      checkInHourUTC: number,
      durationHours: number,
      breakdown: {
        horasOrdinariasDiurnas: number;
        horasOrdinariasNocturnas: number;
        horasExtraDiurnas: number;
        horasExtraNocturnas: number;
        totalHoras: number;
        esDominical?: boolean;
        esFestivo?: boolean;
        esDiaLaboral?: boolean;
      },
    ): AttendanceReaderRecord {
      const checkIn = new Date(`${date}T${String(checkInHourUTC).padStart(2, '0')}:00:00Z`);
      const checkOut = new Date(checkIn.getTime() + durationHours * 3600_000);
      return {
        id: `att-${date}`,
        operarioId: 'O1',
        date,
        checkInCapturedAt: checkIn,
        checkOutCapturedAt: checkOut,
        completedAt: checkOut,
        breakdown: {
          horasOrdinariasDiurnas: new Decimal(breakdown.horasOrdinariasDiurnas),
          horasOrdinariasNocturnas: new Decimal(breakdown.horasOrdinariasNocturnas),
          horasExtraDiurnas: new Decimal(breakdown.horasExtraDiurnas),
          horasExtraNocturnas: new Decimal(breakdown.horasExtraNocturnas),
          totalHoras: new Decimal(breakdown.totalHoras),
          esDominical: breakdown.esDominical ?? false,
          esFestivo: breakdown.esFestivo ?? false,
          esDiaLaboral: breakdown.esDiaLaboral ?? true,
        },
      };
    }

    it('BREAK-01 — breakdown enabled aggregates categories from all attendances', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      const attendances = [
        makeAttendanceWithBreakdown('2026-05-01', 7, 8, {
          horasOrdinariasDiurnas: 7.5,
          horasOrdinariasNocturnas: 0,
          horasExtraDiurnas: 0.5,
          horasExtraNocturnas: 0,
          totalHoras: 8,
        }),
        makeAttendanceWithBreakdown('2026-05-02', 7, 9.5, {
          horasOrdinariasDiurnas: 5,
          horasOrdinariasNocturnas: 3,
          horasExtraDiurnas: 1.5,
          horasExtraNocturnas: 0,
          totalHoras: 9.5,
        }),
      ];

      const result = useCase.execute({
        attendances,
        policyTimeline: policies,
        breakdownEnabled: true,
      });

      // Aggregated breakdown categories
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown!.horasOrdinariasDiurnas.toNumber()).toBeCloseTo(12.5, 2); // 7.5 + 5
      expect(result.breakdown!.horasOrdinariasNocturnas.toNumber()).toBeCloseTo(3, 2); // 0 + 3
      expect(result.breakdown!.horasExtraDiurnas.toNumber()).toBeCloseTo(2, 2); // 0.5 + 1.5
      expect(result.breakdown!.horasExtraNocturnas.toNumber()).toBeCloseTo(0, 2);
      expect(result.breakdown!.horasDominicalesFestivas.toNumber()).toBeCloseTo(0, 2);
    });

    it('BREAK-02 — breakdown enabled with Sunday adds horasDominicalesFestivas', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      const attendances = [
        makeAttendanceWithBreakdown('2026-05-04', 7, 7.5, {
          horasOrdinariasDiurnas: 7.5,
          horasOrdinariasNocturnas: 0,
          horasExtraDiurnas: 0,
          horasExtraNocturnas: 0,
          totalHoras: 7.5,
          esDominical: true,
          esDiaLaboral: false,
        }),
      ];

      const result = useCase.execute({
        attendances,
        policyTimeline: policies,
        breakdownEnabled: true,
      });

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown!.horasDominicalesFestivas.toNumber()).toBeCloseTo(7.5, 2);
      expect(result.breakdown!.horasOrdinariasDiurnas.toNumber()).toBeCloseTo(7.5, 2);
    });

    it('BREAK-03 — breakdown disabled falls back to legacy calculation', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      const att = makeAttendance('2026-05-01', 7, 8.5);

      const result = useCase.execute({
        attendances: [att],
        policyTimeline: policies,
        breakdownEnabled: false,
      });

      // Legacy behavior: horasReales computed from timestamps
      expect(result.perDay[0].horasReales.toNumber()).toBe(8.5);
      expect(result.perDay[0].delta.toNumber()).toBe(0.5);
      expect(result.breakdown).toBeUndefined();
    });

    it('BREAK-04 — mixed: attendances without breakdown fall back individually, others aggregated', () => {
      // One attendance WITH breakdown (1h overtime), one WITHOUT (0h overtime)
      const policies = [makePolicy('2026-01-01', 8)];
      const withBreakdown = makeAttendanceWithBreakdown('2026-05-01', 7, 9, {
        horasOrdinariasDiurnas: 7,
        horasOrdinariasNocturnas: 0,
        horasExtraDiurnas: 1,
        horasExtraNocturnas: 0,
        totalHoras: 8,
      });
      const withoutBreakdown = makeAttendance('2026-05-02', 7, 8); // no breakdown field: 8h shift = delta 0

      const result = useCase.execute({
        attendances: [withBreakdown, withoutBreakdown],
        policyTimeline: policies,
        breakdownEnabled: true,
      });

      // Only the first attendance's breakdown is aggregated
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown!.horasOrdinariasDiurnas.toNumber()).toBeCloseTo(7, 2);
      expect(result.breakdown!.horasExtraDiurnas.toNumber()).toBeCloseTo(1, 2);
      // Core balance: both attendances counted (9h - 8h = +1h credits from first)
      expect(result.perDay).toHaveLength(2);
      // First attendance: 9h raw vs 8h policy → +1h overtime → 1 credit
      // Second attendance: 8h raw vs 8h policy → delta 0
      expect(result.creditos.toNumber()).toBe(1);
    });

    it('BREAK-05 — valorRecargos computed from aggregated breakdown when rates and valorHora provided', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      // 2h ordinarias nocturnas + 1h extra diurna = matches REQ-009 example
      const attendances = [
        makeAttendanceWithBreakdown('2026-05-01', 7, 10.5, {
          horasOrdinariasDiurnas: 7.5,
          horasOrdinariasNocturnas: 2,
          horasExtraDiurnas: 1,
          horasExtraNocturnas: 0,
          totalHoras: 10.5,
        }),
      ];

      const result = useCase.execute({
        attendances,
        policyTimeline: policies,
        breakdownEnabled: true,
        valorHoraOrdinaria: new Decimal(10000),
        surchargeRates: {
          RECARGO_NOCTURNO: new Decimal(35),
          HORA_EXTRA_DIURNA: new Decimal(25),
          HORA_EXTRA_NOCTURNA: new Decimal(75),
          RECARGO_DOMINICAL_FESTIVO: new Decimal(90),
        },
      });

      // valorRecargos = 2×10000×0.35 + 1×10000×0.25 = 7000 + 2500 = 9500
      expect(result.valorRecargos).toBeDefined();
      expect(result.valorRecargos!.toNumber()).toBeCloseTo(9500, 2);
    });

    it('BREAK-06 — breakdown enabled but no breakdown data → breakdown undefined, valorRecargos undefined', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      const att = makeAttendance('2026-05-01', 7, 8);

      const result = useCase.execute({
        attendances: [att],
        policyTimeline: policies,
        breakdownEnabled: true,
        valorHoraOrdinaria: new Decimal(10000),
        surchargeRates: {
          RECARGO_NOCTURNO: new Decimal(35),
          HORA_EXTRA_DIURNA: new Decimal(25),
          HORA_EXTRA_NOCTURNA: new Decimal(75),
          RECARGO_DOMINICAL_FESTIVO: new Decimal(90),
        },
      });

      expect(result.breakdown).toBeUndefined();
      expect(result.valorRecargos).toBeUndefined();
      // Legacy perDay is still computed
      expect(result.perDay).toHaveLength(1);
    });

    it('BREAK-07 — breakdown disabled ignores all new params (backward compat)', () => {
      const policies = [makePolicy('2026-01-01', 8)];
      const att = makeAttendance('2026-05-01', 7, 8.5);

      // Pass new params but flag OFF
      const result = useCase.execute({
        attendances: [att],
        policyTimeline: policies,
        breakdownEnabled: false,
        valorHoraOrdinaria: new Decimal(10000),
        surchargeRates: {
          RECARGO_NOCTURNO: new Decimal(35),
          HORA_EXTRA_DIURNA: new Decimal(25),
          HORA_EXTRA_NOCTURNA: new Decimal(75),
          RECARGO_DOMINICAL_FESTIVO: new Decimal(90),
        },
      });

      expect(result.breakdown).toBeUndefined();
      expect(result.valorRecargos).toBeUndefined();
      expect(result.perDay[0].horasReales.toNumber()).toBe(8.5);
    });
  });
});
