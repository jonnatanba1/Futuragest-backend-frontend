/**
 * PrismaCompensatoryRestRepository — Prisma implementation of CompensatoryRestRepositoryPort.
 *
 * Follows the same pattern as PrismaHolidayRepository and PrismaSurchargeRateRepository:
 * simple Prisma delegation in the jornada infrastructure layer.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  CompensatoryRestRepositoryPort,
  CompensatoryRestRecord,
  CreateCompensatoryRestInput,
} from '../domain/ports/compensatory-rest-repository.port';

@Injectable()
export class PrismaCompensatoryRestRepository implements CompensatoryRestRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async countByOperarioAndMonth(operarioId: string, month: string): Promise<number> {
    return this.prisma.compensatoryRest.count({
      where: { operarioId, month },
    });
  }

  async findByOperarioAndMonth(operarioId: string, month: string): Promise<CompensatoryRestRecord[]> {
    return this.prisma.compensatoryRest.findMany({
      where: { operarioId, month },
      select: {
        id: true,
        operarioId: true,
        attendanceId: true,
        month: true,
        type: true,
        status: true,
      },
    }) as Promise<CompensatoryRestRecord[]>;
  }

  async findByAttendanceId(attendanceId: string): Promise<CompensatoryRestRecord | null> {
    return this.prisma.compensatoryRest.findUnique({
      where: { attendanceId },
      select: {
        id: true,
        operarioId: true,
        attendanceId: true,
        month: true,
        type: true,
        status: true,
      },
    }) as Promise<CompensatoryRestRecord | null>;
  }

  async create(input: CreateCompensatoryRestInput): Promise<CompensatoryRestRecord> {
    return this.prisma.compensatoryRest.create({
      data: {
        operarioId: input.operarioId,
        attendanceId: input.attendanceId,
        month: input.month,
        type: input.type,
        status: input.status as any,
      },
      select: {
        id: true,
        operarioId: true,
        attendanceId: true,
        month: true,
        type: true,
        status: true,
      },
    }) as Promise<CompensatoryRestRecord>;
  }

  async updateType(attendanceId: string, type: 'OCCASIONAL' | 'HABITUAL'): Promise<void> {
    await this.prisma.compensatoryRest.update({
      where: { attendanceId },
      data: { type },
    });
  }
}
