import { Decimal } from '@prisma/client/runtime/client';

export type TimeClassificationInput = {
  checkIn: Date;
  checkOut: Date;
  isSunday: boolean;
  isHoliday: boolean;
  jornadaHorasDiarias: Decimal;
  /** Schedule start time (HH:MM) in local time */
  horaInicio: string;
  /** Schedule end time (HH:MM) in local time */
  horaFin: string;
  /** ISO weekday numbers when the shift applies (1=Monday, 7=Sunday) */
  diasLaborales: number[];
  /** Lunch start time (HH:MM). Non-null — already resolved by caller. */
  almuerzoInicio: string;
  /** Lunch end time (HH:MM). Non-null — already resolved by caller. */
  almuerzoFin: string;
  /** Breakfast start time (HH:MM). Non-null — already resolved by caller. */
  desayunoInicio: string;
  /** Breakfast end time (HH:MM). Non-null — already resolved by caller. */
  desayunoFin: string;
  /** ISO weekday of the shift date (1=Monday, 7=Sunday) */
  isoWeekday: number;
  /**
   * Set of holiday dates (YYYY-MM-DD) for per-day flag computation.
   * When provided, the engine recomputes isSunday/isHoliday/esDiaLaboral
   * each time the cursor crosses midnight — fixing overnight shift
   * misclassification (A-05 / A-12).
   */
  holidayDates?: Set<string>;
};

export type TimeClassificationResult = {
  horasOrdinariasDiurnas: Decimal;
  horasOrdinariasNocturnas: Decimal;
  horasExtraDiurnas: Decimal;
  horasExtraNocturnas: Decimal;
  totalHoras: Decimal;
  esDominical: boolean;
  esFestivo: boolean;
  esDiaLaboral: boolean;

  // ── Tramos horarios (HH:MM) ──
  tramoInicioOrdDiurna: string | null;
  tramoFinOrdDiurna: string | null;
  tramoInicioOrdNocturno: string | null;
  tramoFinOrdNocturno: string | null;
  tramoInicioExtraDiurna: string | null;
  tramoFinExtraDiurna: string | null;
  tramoInicioExtraNocturna: string | null;
  tramoFinExtraNocturna: string | null;
};

/**
 * Parses a "HH:MM" string into total minutes from midnight.
 * E.g., "06:00" → 360, "23:30" → 1410.
 */
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true if `cursorMinutes` (minutes from midnight of the CURRENT day)
 * falls within [start, end] accounting for midnight wrap.
 *
 * Midnight wrap: if end < start, the interval wraps past midnight.
 * cursor is relative to the day of the start.
 */
function isWithinInterval(
  cursorMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes <= endMinutes) {
    // Normal interval: e.g., 06:00–14:00
    return cursorMinutes >= startMinutes && cursorMinutes < endMinutes;
  } else {
    // Wrapped interval: e.g., 22:00–02:00
    return cursorMinutes >= startMinutes || cursorMinutes < endMinutes;
  }
}

export class TimeClassificationEngine {
  // En Colombia (Ley 1846 de 2017):
  // Diurno: 6:00 AM - 7:00 PM (19:00)
  // Nocturno: 7:00 PM (19:00) - 6:00 AM
  private static readonly DIURNO_START_HOUR = 6;
  private static readonly DIURNO_END_HOUR = 19;

  static classify(input: TimeClassificationInput): TimeClassificationResult {
    const current = new Date(input.checkIn.getTime());
    const end = input.checkOut;

    let ordDiurnas = 0;
    let ordNocturnas = 0;
    let extraDiurnas = 0;
    let extraNocturnas = 0;
    let totalOrd = 0;

    const limitOrd = input.jornadaHorasDiarias.toNumber() * 60; // minutes

    const scheduleStart = parseTime(input.horaInicio);
    const scheduleEnd = parseTime(input.horaFin);
    const lunchStart = parseTime(input.almuerzoInicio);
    const lunchEnd = parseTime(input.almuerzoFin);
    const breakfastStart = parseTime(input.desayunoInicio);
    const breakfastEnd = parseTime(input.desayunoFin);

    // A-05 / A-12: Per-day flag tracking for overnight shifts.
    // When holidayDates is provided, recompute isSunday, isHoliday, and
    // esDiaLaboral each time the cursor crosses midnight. Otherwise,
    // use the fixed check-in-day flags (backward compat).
    const holidayDates = input.holidayDates;
    let sawSunday = input.isSunday;
    let sawHoliday = input.isHoliday;
    let sawDiaLaboral = input.diasLaborales.includes(input.isoWeekday) && !input.isHoliday;
    let esDiaLaboral = sawDiaLaboral;
    let lastDateStr = '';

    let firstOrdDiurna: Date | null = null;
    let lastOrdDiurna: Date | null = null;
    let firstOrdNocturna: Date | null = null;
    let lastOrdNocturna: Date | null = null;
    let firstExtraDiurna: Date | null = null;
    let lastExtraDiurna: Date | null = null;
    let firstExtraNocturna: Date | null = null;
    let lastExtraNocturna: Date | null = null;

    // Iterate minute by minute
    while (current < end) {
      // ── Per-day flag recomputation ──
      if (holidayDates) {
        const y = current.getUTCFullYear();
        const mo = String(current.getUTCMonth() + 1).padStart(2, '0');
        const d = String(current.getUTCDate()).padStart(2, '0');
        const cursorDateStr = `${y}-${mo}-${d}`;
        if (cursorDateStr !== lastDateStr) {
          lastDateStr = cursorDateStr;
          const cursorWeekday = current.getUTCDay();
          const isSunday = cursorWeekday === 0;
          const adjustedWeekday = isSunday ? 7 : cursorWeekday;
          const isHoliday = holidayDates.has(cursorDateStr);
          sawSunday = sawSunday || isSunday;
          sawHoliday = sawHoliday || isHoliday;
          esDiaLaboral = input.diasLaborales.includes(adjustedWeekday) && !isHoliday;
          if (esDiaLaboral) sawDiaLaboral = true;
        }
      }

      // Extract the minute-of-day from the current cursor.
      // We use getUTCHours() / getUTCMinutes() because the dates are
      // already adjusted to represent local Colombia time via UTC fields.
      const cursorMinutes = current.getUTCHours() * 60 + current.getUTCMinutes();

      // ── Breakfast skip ──
      if (isWithinInterval(cursorMinutes, breakfastStart, breakfastEnd)) {
        current.setUTCMinutes(current.getUTCMinutes() + 1);
        continue;
      }

      // ── Lunch skip ──
      if (isWithinInterval(cursorMinutes, lunchStart, lunchEnd)) {
        current.setUTCMinutes(current.getUTCMinutes() + 1);
        continue;
      }

      const isDiurno = this.isDiurno(current);

      // ── Ordinary vs Extra ──
      const withinSchedule = isWithinInterval(cursorMinutes, scheduleStart, scheduleEnd);
      const isOrdinary = withinSchedule && esDiaLaboral && totalOrd < limitOrd;

      if (isOrdinary) {
        if (isDiurno) {
          ordDiurnas += 1;
          if (firstOrdDiurna === null) firstOrdDiurna = new Date(current);
          lastOrdDiurna = new Date(current);
        } else {
          ordNocturnas += 1;
          if (firstOrdNocturna === null) firstOrdNocturna = new Date(current);
          lastOrdNocturna = new Date(current);
        }
        totalOrd += 1;
      } else {
        if (isDiurno) {
          extraDiurnas += 1;
          if (firstExtraDiurna === null) firstExtraDiurna = new Date(current);
          lastExtraDiurna = new Date(current);
        } else {
          extraNocturnas += 1;
          if (firstExtraNocturna === null) firstExtraNocturna = new Date(current);
          lastExtraNocturna = new Date(current);
        }
      }

      current.setUTCMinutes(current.getUTCMinutes() + 1);
    }

    const totalMinutes = ordDiurnas + ordNocturnas + extraDiurnas + extraNocturnas;

    const formatTime = (d: Date | null): string | null => {
      if (!d) return null;
      const h = String(d.getUTCHours()).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    };

    const formatEndTime = (d: Date | null, start: Date | null): string | null => {
      if (!d || !start) return null;
      const nextMin = new Date(d.getTime() + 60000);
      const h = nextMin.getUTCHours();
      const m = nextMin.getUTCMinutes();
      if (h === 0 && m === 0 && nextMin.getUTCDate() !== start.getUTCDate()) {
        return '23:59';
      }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    return {
      horasOrdinariasDiurnas: new Decimal(ordDiurnas).dividedBy(60).toDecimalPlaces(2),
      horasOrdinariasNocturnas: new Decimal(ordNocturnas).dividedBy(60).toDecimalPlaces(2),
      horasExtraDiurnas: new Decimal(extraDiurnas).dividedBy(60).toDecimalPlaces(2),
      horasExtraNocturnas: new Decimal(extraNocturnas).dividedBy(60).toDecimalPlaces(2),
      totalHoras: new Decimal(totalMinutes).dividedBy(60).toDecimalPlaces(2),
      esDominical: holidayDates ? sawSunday : input.isSunday,
      esFestivo: holidayDates ? sawHoliday : input.isHoliday,
      esDiaLaboral: holidayDates ? sawDiaLaboral : esDiaLaboral,
      tramoInicioOrdDiurna: formatTime(firstOrdDiurna),
      tramoFinOrdDiurna: formatEndTime(lastOrdDiurna, firstOrdDiurna),
      tramoInicioOrdNocturno: formatTime(firstOrdNocturna),
      tramoFinOrdNocturno: formatEndTime(lastOrdNocturna, firstOrdNocturna),
      tramoInicioExtraDiurna: formatTime(firstExtraDiurna),
      tramoFinExtraDiurna: formatEndTime(lastExtraDiurna, firstExtraDiurna),
      tramoInicioExtraNocturna: formatTime(firstExtraNocturna),
      tramoFinExtraNocturna: formatEndTime(lastExtraNocturna, firstExtraNocturna),
    };
  }

  private static isDiurno(date: Date): boolean {
    const h = date.getUTCHours();
    return h >= this.DIURNO_START_HOUR && h < this.DIURNO_END_HOUR;
  }
}
