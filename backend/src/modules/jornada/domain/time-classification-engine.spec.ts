import { TimeClassificationEngine, TimeClassificationInput } from './time-classification-engine';
import { Decimal } from '@prisma/client/runtime/client';

/**
 * Builder for v2 classification input — reduces boilerplate for the 12+ test scenarios.
 * Defaults represent a standard Monday shift 6:00–14:00 with lunch 12:00–13:00,
 * 7.5h daily limit, 5-day workweek (Mon–Fri).
 */
function makeInput(overrides: Partial<TimeClassificationInput> = {}): TimeClassificationInput {
  const defaults: TimeClassificationInput = {
    checkIn: new Date('2026-06-29T06:00:00.000Z'),   // Monday 6:00 local
    checkOut: new Date('2026-06-29T14:00:00.000Z'),  // Monday 14:00 local
    isSunday: false,
    isHoliday: false,
    jornadaHorasDiarias: new Decimal(7.5),
    horaInicio: '06:00',
    horaFin: '14:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: '12:00',
    almuerzoFin: '13:00',
    isoWeekday: 1, // Monday
  };
  return { ...defaults, ...overrides };
}

describe('TimeClassificationEngine v2', () => {
  // ──────────────────────────────────────────────────────────────
  // T2.1 — L1: Standard 6:00–14:00 with lunch → 7.0h ordinary diurnal
  // ──────────────────────────────────────────────────────────────
  it('L1: standard 6:00–14:00 with 1h lunch → 7h ordinary diurnal', () => {
    const result = TimeClassificationEngine.classify(makeInput());

    // 8h total, 1h lunch skipped → 7h worked, all within schedule + working day
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(7.0);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(7.0);
    expect(result.esDominical).toBe(false);
    expect(result.esFestivo).toBe(false);
    expect(result.esDiaLaboral).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — L2: Extended 6:00–15:00 → 8.5h (7.5h ordinary + 1h extra)
  // ──────────────────────────────────────────────────────────────
  it('L2: extended 6:00–15:00 → 7.5h ordinary + 1h extra diurnal', () => {
    const input = makeInput({
      checkOut: new Date('2026-06-29T15:00:00.000Z'), // 9h total
      horaFin: '15:00', // schedule now ends at 15:00
      almuerzoInicio: '23:00', // no lunch for simplicity
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    // 9h total, limit 7.5h → 7.5h ordinary, 1.5h extra
    // All diurnal (within 6:00-19:00)
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(7.5);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(1.5);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(9.0);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — L3: Custom lunch window 11:30–12:30
  // ──────────────────────────────────────────────────────────────
  it('L3: custom lunch window 11:30–12:30 → lunch minutes skipped', () => {
    const input = makeInput({
      almuerzoInicio: '11:30',
      almuerzoFin: '12:30',
    });

    const result = TimeClassificationEngine.classify(input);

    // 8h total, 1h lunch → 7h ordinary diurnal
    expect(result.totalHoras.toNumber()).toBe(7.0);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(7.0);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — L4: Check-in within lunch window (12:15–14:00)
  // ──────────────────────────────────────────────────────────────
  it('L4: check-in at 12:15 (inside lunch 12:00–13:00) → lunch minutes skipped', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T12:15:00.000Z'),
      checkOut: new Date('2026-06-29T14:00:00.000Z'),
    });

    const result = TimeClassificationEngine.classify(input);

    // 12:15–13:00 = 45 min skipped (inside lunch)
    // 13:00–14:00 = 60 min ordinary diurnal
    expect(result.totalHoras.toNumber()).toBe(1.0);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(1.0);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — L5: Lunch in nocturnal shift (check-in partly before lunch)
  // Shift: 11:00–13:30, lunch 12:00–13:00 → 1h lunch skip
  // ──────────────────────────────────────────────────────────────
  it('L5: lunch at 12:00–13:00 eaten during shift 11:00–13:30', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T11:00:00.000Z'),
      checkOut: new Date('2026-06-29T13:30:00.000Z'),
    });

    const result = TimeClassificationEngine.classify(input);

    // 11:00–12:00 = 1h ordinary diurnal
    // 12:00–13:00 = lunch → skipped
    // 13:00–13:30 = 0.5h ordinary diurnal
    expect(result.totalHoras.toNumber()).toBe(1.5);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(1.5);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Standard diurnal (no lunch, full within schedule)
  // ──────────────────────────────────────────────────────────────
  it('standard diurnal: 7:00–17:00 (10h) with 8.4h limit, no lunch', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T07:00:00.000Z'),
      checkOut: new Date('2026-06-29T17:00:00.000Z'),
      jornadaHorasDiarias: new Decimal(8.4),
      horaInicio: '07:00',
      horaFin: '17:00',
      almuerzoInicio: '23:00', // no lunch
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(8.4);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(1.6);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(10);
    expect(result.esDominical).toBe(false);
    expect(result.esFestivo).toBe(false);
    expect(result.esDiaLaboral).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Nocturnal cross (14:00–22:00, 8h, split at 19:00)
  // ──────────────────────────────────────────────────────────────
  it('nocturnal cross: 14:00–22:00 splits at 19:00 (5h diurnal + 3h nocturnal)', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T14:00:00.000Z'),
      checkOut: new Date('2026-06-29T22:00:00.000Z'),
      jornadaHorasDiarias: new Decimal(8.4),
      horaInicio: '14:00',
      horaFin: '22:00',
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(5);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(3);
    expect(result.horasExtraDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(8);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Cross 19:00 with excess (14:00–23:00, 9h, 8h limit)
  // ──────────────────────────────────────────────────────────────
  it('cross 7PM with excess: 14:00–23:00 (5h ord diur + 3h ord noct + 1h extra noct)', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T14:00:00.000Z'),
      checkOut: new Date('2026-06-29T23:00:00.000Z'),
      jornadaHorasDiarias: new Decimal(8.0),
      horaInicio: '14:00',
      horaFin: '23:00',
      almuerzoInicio: '23:30',
      almuerzoFin: '23:45',
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(5);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(3);
    expect(result.horasExtraDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraNocturnas.toNumber()).toBe(1);
    expect(result.totalHoras.toNumber()).toBe(9);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Midnight cross (22:00–02:00, 4h nocturnal)
  // ──────────────────────────────────────────────────────────────
  it('midnight cross: 22:00–02:00 → 4h all ordinary nocturnal', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-29T22:00:00.000Z'),
      checkOut: new Date('2026-06-30T02:00:00.000Z'),
      jornadaHorasDiarias: new Decimal(8.0),
      horaInicio: '22:00',
      horaFin: '02:00', // crosses midnight in schedule
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    // 22:00–02:00 = 4h, lunch 23:00–23:30 skipped → 3.5h
    // All nocturnal (all after 19:00)
    // But wait: 00:00-02:00 is also nocturnal (0-6 is nocturnal)
    // Within schedule? 22:00-02:00 should all be within, as it wraps.
    // Actually, isOrdinary check: cursor within horaInicio-horaFin
    // horaFin "02:00" < horaInicio "22:00" as numbers, so need wrap handling.
    // For simplicity, let's expect the current logic to handle midnight correctly.
    // All minutes between 22:00 and 02:00:
    // 22:00-23:00 = 1h, 23:00-23:30 lunch skipped, 23:30-00:00=0.5h, 00:00-02:00=2h
    // Total = 3.5h, all nocturnal, all ordinary
    expect(result.totalHoras.toNumber()).toBe(3.5);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(3.5);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Sunday: all hours are extra
  // ──────────────────────────────────────────────────────────────
  it('Sunday: 7:00–15:00 → all 8h extra diurnal (not a working day)', () => {
    const input = makeInput({
      checkIn: new Date('2026-06-28T07:00:00.000Z'), // Sunday
      checkOut: new Date('2026-06-28T15:00:00.000Z'),
      isSunday: true,
      jornadaHorasDiarias: new Decimal(8.0),
      horaInicio: '07:00',
      horaFin: '15:00',
      diasLaborales: [1, 2, 3, 4, 5],
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
      isoWeekday: 7, // Sunday
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.esDominical).toBe(true);
    expect(result.esDiaLaboral).toBe(false);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(0);
    expect(result.horasOrdinariasNocturnas.toNumber()).toBe(0);
    // All minutes are extra because it's not a working day
    expect(result.horasExtraDiurnas.toNumber()).toBe(8);
    expect(result.horasExtraNocturnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(8);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Holiday: all hours are extra
  // ──────────────────────────────────────────────────────────────
  it('Holiday: 6:00–14:00 → all extra diurnal (not a working day)', () => {
    const input = makeInput({
      isHoliday: true,
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.esFestivo).toBe(true);
    expect(result.esDiaLaboral).toBe(false);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(8);
    expect(result.totalHoras.toNumber()).toBe(8);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — Non-working day (Saturday when Mon-Fri policy)
  // ──────────────────────────────────────────────────────────────
  it('non-working day (Saturday): 6:00–14:00 → all extra diurnal', () => {
    const input = makeInput({
      isoWeekday: 6, // Saturday
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    expect(result.esDiaLaboral).toBe(false);
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(8);
    expect(result.totalHoras.toNumber()).toBe(8);
  });

  // ──────────────────────────────────────────────────────────────
  // T2.1 — 42h weekly schedule (separate test for larger limit)
  // ──────────────────────────────────────────────────────────────
  it('42h schedule: shift within range, all ordinary', () => {
    const input = makeInput({
      jornadaHorasDiarias: new Decimal(8.4), // 42h / 5 = 8.4
      almuerzoInicio: '23:00',
      almuerzoFin: '23:30',
    });

    const result = TimeClassificationEngine.classify(input);

    // 8h all within 8.4h limit, all diurnal, working day
    expect(result.horasOrdinariasDiurnas.toNumber()).toBe(8.0);
    expect(result.horasExtraDiurnas.toNumber()).toBe(0);
    expect(result.totalHoras.toNumber()).toBe(8.0);
  });
});
