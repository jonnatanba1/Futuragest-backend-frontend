import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SurchargeRate, Prisma } from '@prisma/client';
import { SurchargeRateRepositoryPort } from '../domain/ports/surcharge-rate-repository.port';

@Injectable()
export class PrismaSurchargeRateRepository implements SurchargeRateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SurchargeRate[]> {
    return this.prisma.surchargeRate.findMany({
      orderBy: { vigenteDesde: 'asc' },
    });
  }

  async create(data: Prisma.SurchargeRateCreateInput): Promise<SurchargeRate> {
    return this.prisma.surchargeRate.create({ data });
  }
}
