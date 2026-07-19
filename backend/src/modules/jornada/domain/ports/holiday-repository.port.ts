import { Holiday, Prisma } from '@prisma/client';

export const HOLIDAY_REPOSITORY_PORT = Symbol('HolidayRepositoryPort');

export interface HolidayRepositoryPort {
  /**
   * Find holiday by exact date (format: YYYY-MM-DD).
   */
  findByDate(dateStr: string): Promise<Holiday | null>;

  /**
   * Find all holidays for a given year.
   */
  findManyByYear(year: number): Promise<Holiday[]>;

  /**
   * Bulk insert holidays.
   */
  createMany(holidays: Prisma.HolidayCreateManyInput[]): Promise<void>;
}
