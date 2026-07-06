import { Decimal } from '@prisma/client/runtime/client';
import { derivePslPeriodNumber, dateToExcelSerial } from './psl-utils';

export interface PslMappedRow {
  dateStr: string; // YYYY-MM-DD of the day it actually occurred
  concepto: string; // e.g. "010"
  horas: Decimal;
  horaInicio: string; // "HH:MM"
  horaFinal: string;  // "HH:MM"
}

/**
 * Parses "HH:MM" -> total minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Gets the date string for the next day.
 */
function getNextDayStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Maps a single category's hours and tramo to one or two PslMappedRows.
 * Handles midnight wrap and proportional hours split.
 */
export function mapCategory(
  dateStr: string,
  concepto: string,
  horas: Decimal,
  tramoInicio: string | null,
  tramoFin: string | null,
): PslMappedRow[] {
  if (horas.isZero() || !tramoInicio || !tramoFin) {
    return [];
  }

  const startMin = parseTimeToMinutes(tramoInicio);
  const endMin = parseTimeToMinutes(tramoFin);

  // If it wraps midnight (endMin < startMin or it crosses day)
  if (endMin < startMin) {
    const day1Min = 1440 - startMin;
    const day2Min = endMin;
    const totalMin = day1Min + day2Min;

    if (totalMin <= 0) return [];

    const hoursNum = horas.toNumber();
    const day1Hours = new Decimal(hoursNum * (day1Min / totalMin)).toDecimalPlaces(2);
    const day2Hours = horas.minus(day1Hours).toDecimalPlaces(2); // preserve total exactly

    const rows: PslMappedRow[] = [];
    
    if (day1Hours.greaterThan(0)) {
      rows.push({
        dateStr,
        concepto,
        horas: day1Hours,
        horaInicio: tramoInicio,
        horaFinal: '23:59',
      });
    }

    if (day2Hours.greaterThan(0)) {
      rows.push({
        dateStr: getNextDayStr(dateStr),
        concepto,
        horas: day2Hours,
        horaInicio: '00:00',
        horaFinal: tramoFin,
      });
    }

    return rows;
  }

  // Normal day (no midnight cross)
  return [{
    dateStr,
    concepto,
    horas,
    horaInicio: tramoInicio,
    horaFinal: tramoFin,
  }];
}
