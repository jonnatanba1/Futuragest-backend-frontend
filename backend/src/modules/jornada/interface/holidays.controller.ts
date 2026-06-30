import { Controller, Get, Post, Query, Body, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Holiday, HolidayType, Prisma } from '@prisma/client';
import { Roles } from '../../iam/interface/roles.decorator';
import { HOLIDAY_REPOSITORY_PORT, HolidayRepositoryPort } from '../domain/ports/holiday-repository.port';
import { HolidayCalculator } from '../domain/holiday-calculator';

export class CreateHolidayBody {
  date!: string;
  name!: string;
}

@ApiTags('festivos')
@Controller('holidays')
export class HolidaysController {
  constructor(
    @Inject(HOLIDAY_REPOSITORY_PORT)
    private readonly holidayRepo: HolidayRepositoryPort,
  ) {}

  @Roles('SUPERVISOR', 'COORDINADOR', 'SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO')
  @Get()
  @ApiOkResponse({ description: 'Lista de festivos del año' })
  async listByYear(@Query('year') year: string): Promise<Holiday[]> {
    return this.holidayRepo.findManyByYear(Number(year));
  }

  @Roles('TALENTO_HUMANO', 'SYSTEM_ADMIN')
  @Post('generate')
  @ApiOkResponse({ description: 'Genera y persiste los festivos para un año' })
  async generateYear(@Body('year') year: number): Promise<Holiday[]> {
    const generated = HolidayCalculator.generateYear(year);
    const holidays: Prisma.HolidayCreateManyInput[] = generated.map((h) => ({
      date: h.date,
      name: h.name,
      type: h.type,
      year: h.year,
      isManual: false,
    }));
    await this.holidayRepo.createMany(holidays);
    return this.holidayRepo.findManyByYear(year);
  }

  @Roles('TALENTO_HUMANO', 'SYSTEM_ADMIN')
  @Post()
  @ApiOkResponse({ description: 'Crea un festivo manual' })
  async create(@Body() body: CreateHolidayBody): Promise<Holiday> {
    const year = new Date(body.date + 'T00:00:00Z').getUTCFullYear();
    await this.holidayRepo.createMany([
      {
        date: body.date,
        name: body.name,
        type: HolidayType.MANUAL,
        year,
        isManual: true,
      },
    ]);
    const created = await this.holidayRepo.findByDate(body.date);
    return created!;
  }
}
