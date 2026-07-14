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

  async findMany(opts?: { operarioId?: string; month?: string }): Promise<CompensatoryRestRecord[]> {
    const where: any = {};
    if (opts?.operarioId) where.operarioId = opts.operarioId;
    if (opts?.month) where.month = opts.month;
    
    return this.prisma.compensatoryRest.findMany({
      where,
      select: {
        id: true,
        operarioId: true,
        attendanceId: true,
        month: true,
        type: true,
        status: true,
        scheduledDate: true,
        takenDate: true, // we can select it though it wasn't requested strictly, but it's in schema
      },
    }) as any as Promise<CompensatoryRestRecord[]>; // 'any' because takenDate is not in the port type but that's fine
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
        scheduledDate: true,
        takenDate: true,
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
        scheduledDate: true,
        takenDate: true,
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
        scheduledDate: true,
        takenDate: true,
      },
    }) as any as Promise<CompensatoryRestRecord>;
  }

  async update(id: string, data: { status?: string; scheduledDate?: string | null; notes?: string | null }): Promise<CompensatoryRestRecord> {
    return this.prisma.compensatoryRest.update({
      where: { id },
      data: {
        status: data.status as any,
        scheduledDate: data.scheduledDate,
        notes: data.notes ?? undefined,
      },
      select: {
        id: true,
        operarioId: true,
        attendanceId: true,
        month: true,
        type: true,
        status: true,
        scheduledDate: true,
        takenDate: true,
      },
    }) as any as Promise<CompensatoryRestRecord>;
  }

  async updateType(attendanceId: string, type: 'OCCASIONAL' | 'HABITUAL'): Promise<void> {
    await this.prisma.compensatoryRest.update({
      where: { attendanceId },
      data: { type },
    });
  }
}
