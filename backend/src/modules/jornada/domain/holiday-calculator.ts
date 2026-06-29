import { HolidayType } from '@prisma/client';

export type GeneratedHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
  year: number;
};

export class HolidayCalculator {
  static generateYear(year: number): GeneratedHoliday[] {
    const holidays: GeneratedHoliday[] = [];
    const easter = this.calculateEaster(year);

    // ── FIXED HOLIDAYS (No se trasladan) ──
    const fixed = [
      { month: 0, day: 1, name: 'Año Nuevo' },
      { month: 4, day: 1, name: 'Día del Trabajo' },
      { month: 6, day: 20, name: 'Día de la Independencia' },
      { month: 7, day: 7, name: 'Batalla de Boyacá' },
      { month: 11, day: 8, name: 'Día de la Inmaculada Concepción' },
      { month: 11, day: 25, name: 'Navidad' },
    ];

    fixed.forEach((f) => {
      holidays.push({
        date: this.formatDate(new Date(Date.UTC(year, f.month, f.day))),
        name: f.name,
        type: HolidayType.FIXED,
        year,
      });
    });

    // ── EMILIANI HOLIDAYS (Se trasladan al lunes si caen entre martes y domingo) ──
    const emiliani = [
      { month: 0, day: 6, name: 'Día de los Reyes Magos' },
      { month: 2, day: 19, name: 'Día de San José' },
      { month: 5, day: 29, name: 'San Pedro y San Pablo' },
      { month: 7, day: 15, name: 'La Asunción de la Virgen' },
      { month: 9, day: 12, name: 'Día de la Raza' },
      { month: 10, day: 1, name: 'Día de Todos los Santos' },
      { month: 10, day: 11, name: 'Independencia de Cartagena' },
    ];

    emiliani.forEach((f) => {
      const originalDate = new Date(Date.UTC(year, f.month, f.day));
      const movedDate = this.moveToNextMonday(originalDate);
      holidays.push({
        date: this.formatDate(movedDate),
        name: f.name,
        type: HolidayType.EMILIANI,
        year,
      });
    });

    // ── EASTER BASED HOLIDAYS ──
    const easterBased = [
      { offsetDays: -3, name: 'Jueves Santo', isEmiliani: false },
      { offsetDays: -2, name: 'Viernes Santo', isEmiliani: false },
      { offsetDays: 43, name: 'Día de la Ascensión', isEmiliani: true },
      { offsetDays: 64, name: 'Corpus Christi', isEmiliani: true },
      { offsetDays: 71, name: 'Sagrado Corazón de Jesús', isEmiliani: true },
    ];

    easterBased.forEach((f) => {
      let date = this.addDays(easter, f.offsetDays);
      if (f.isEmiliani) {
        date = this.moveToNextMonday(date);
      }
      holidays.push({
        date: this.formatDate(date),
        name: f.name,
        type: HolidayType.EASTER_BASED,
        year,
      });
    });

    // Ordenar cronológicamente
    holidays.sort((a, b) => a.date.localeCompare(b.date));

    return holidays;
  }

  private static calculateEaster(year: number): Date {
    // Algoritmo de Meeus/Jones/Butcher
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month, day));
  }

  private static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private static moveToNextMonday(date: Date): Date {
    const dayOfWeek = date.getUTCDay();
    // 0: Sunday, 1: Monday, 2: Tuesday ... 6: Saturday
    if (dayOfWeek === 1) {
      return date; // Ya es lunes
    }
    const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    return this.addDays(date, daysToAdd);
  }

  private static formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
