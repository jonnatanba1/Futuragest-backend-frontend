import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Holiday, Prisma } from '@prisma/client';
import { HolidayRepositoryPort } from '../domain/ports/holiday-repository.port';

@Injectable()
export class PrismaHolidayRepository implements HolidayRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByDate(dateStr: string): Promise<Holiday | null> {
    return this.prisma.holiday.findUnique({
      where: { date: dateStr },
    });
  }

  async findManyByYear(year: number): Promise<Holiday[]> {
    return this.prisma.holiday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
    });
  }

  async createMany(holidays: Prisma.HolidayCreateManyInput[]): Promise<void> {
    await this.prisma.holiday.createMany({
      data: holidays,
      skipDuplicates: true,
    });
  }
}
