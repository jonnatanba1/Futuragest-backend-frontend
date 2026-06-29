import { HolidayCalculator } from './holiday-calculator';
import { HolidayType } from '@prisma/client';

describe('HolidayCalculator', () => {
  it('should generate exactly 18 holidays for 2026', () => {
    const holidays = HolidayCalculator.generateYear(2026);
    expect(holidays).toHaveLength(18);
  });

  it('should verify fixed holidays in 2026', () => {
    const holidays = HolidayCalculator.generateYear(2026);
    const fixedHolidays = holidays.filter((h) => h.type === HolidayType.FIXED);
    expect(fixedHolidays).toHaveLength(6);

    // Año Nuevo
    expect(holidays.find((h) => h.name === 'Año Nuevo')?.date).toBe('2026-01-01');
    // Día del Trabajo
    expect(holidays.find((h) => h.name === 'Día del Trabajo')?.date).toBe('2026-05-01');
    // Navidad
    expect(holidays.find((h) => h.name === 'Navidad')?.date).toBe('2026-12-25');
  });

  it('should verify emiliani holidays are moved to Monday in 2026', () => {
    const holidays = HolidayCalculator.generateYear(2026);
    
    // Día de los Reyes Magos: Jan 6 (Tuesday) -> moved to Monday Jan 12
    const reyes = holidays.find((h) => h.name === 'Día de los Reyes Magos');
    expect(reyes?.date).toBe('2026-01-12');
    expect(reyes?.type).toBe(HolidayType.EMILIANI);

    // Día de San José: March 19 (Thursday) -> moved to Monday March 23
    const sanJose = holidays.find((h) => h.name === 'Día de San José');
    expect(sanJose?.date).toBe('2026-03-23');
  });

  it('should calculate Easter based holidays for 2026', () => {
    // Easter 2026 is April 5
    // Jueves Santo: Easter - 3 days = April 2
    // Viernes Santo: Easter - 2 days = April 3
    const holidays = HolidayCalculator.generateYear(2026);

    expect(holidays.find((h) => h.name === 'Jueves Santo')?.date).toBe('2026-04-02');
    expect(holidays.find((h) => h.name === 'Viernes Santo')?.date).toBe('2026-04-03');

    // Ascensión: Easter + 43 days (May 18, Monday)
    expect(holidays.find((h) => h.name === 'Día de la Ascensión')?.date).toBe('2026-05-18');
  });
});
