import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SurchargeRate, SurchargeCategory } from '@prisma/client';
import { Roles } from '../../iam/interface/roles.decorator';
import {
  SURCHARGE_RATE_REPOSITORY_PORT,
  SurchargeRateRepositoryPort,
} from '../domain/ports/surcharge-rate-repository.port';

export class CreateSurchargeRateBody {
  category!: SurchargeCategory;
  percentage!: number;
  vigenteDesde!: string;
  legalRef?: string | null;
}

@ApiTags('recargos')
@Controller('surcharge-rates')
export class SurchargeRatesController {
  constructor(
    @Inject(SURCHARGE_RATE_REPOSITORY_PORT)
    private readonly surchargeRateRepo: SurchargeRateRepositoryPort,
  ) {}

  @Roles('SUPERVISOR', 'COORDINADOR', 'SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO')
  @Get()
  @ApiOkResponse({ description: 'Lista de tasas de recargo vigentes' })
  async list(): Promise<SurchargeRate[]> {
    return this.surchargeRateRepo.findAll();
  }

  @Roles('TALENTO_HUMANO', 'SYSTEM_ADMIN')
  @Post()
  @ApiOkResponse({ description: 'Crea una nueva tasa de recargo' })
  async create(@Body() body: CreateSurchargeRateBody): Promise<SurchargeRate> {
    return this.surchargeRateRepo.create({
      category: body.category,
      percentage: body.percentage,
      vigenteDesde: new Date(body.vigenteDesde),
      legalRef: body.legalRef ?? null,
    });
  }
}
