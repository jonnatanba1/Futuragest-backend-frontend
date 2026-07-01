/**
 * JornadaPolicyRepository — global (NOT scoped) Prisma adapter for JornadaPolicy.
 *
 * JornadaPolicy is a company-wide setting — no zone/supervisor filtering needed.
 * This adapter does NOT extend ScopedRepository.
 *
 * APPEND-ONLY: only create + read methods. No update/delete.
 * Implements JornadaPolicyRepositoryPort.
 *
 * Lives in iam/infrastructure/ following the convention for all Prisma adapters.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  JornadaPolicyRepositoryPort,
  JornadaPolicyRecord,
  CreateJornadaPolicyData,
} from '../../compensacion/domain/ports/jornada-policy-repository.port';

@Injectable()
export class JornadaPolicyRepository implements JornadaPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  /** INSERT-only — never update. */
  create(data: CreateJornadaPolicyData): Promise<JornadaPolicyRecord> {
    return this.prisma.jornadaPolicy.create({
      data: {
        operarioId: data.operarioId,
        zoneId: data.zoneId,
        horaInicio: data.horaInicio,
        horaFin: data.horaFin,
        diasLaborales: data.diasLaborales,
        almuerzoInicio: data.almuerzoInicio,
        almuerzoFin: data.almuerzoFin,
        toleranciaMin: data.toleranciaMin,
        horasDiarias: data.horasDiarias,
        horasSemanales: data.horasSemanales,
        vigenteDesde: data.vigenteDesde,
      },
    }) as Promise<JornadaPolicyRecord>;
  }

  /** All policies ordered ascending by vigenteDesde. */
  findTimeline(): Promise<JornadaPolicyRecord[]> {
    return this.prisma.jornadaPolicy.findMany({
      orderBy: { vigenteDesde: 'asc' },
    }) as Promise<JornadaPolicyRecord[]>;
  }

  /**
   * Most recent policy with vigenteDesde <= date.
   * Returns null if no policy has vigenteDesde <= date.
   */
  findLatestBefore(date: Date): Promise<JornadaPolicyRecord | null> {
    return this.prisma.jornadaPolicy.findFirst({
      where: { vigenteDesde: { lte: date } },
      orderBy: { vigenteDesde: 'desc' },
    }) as Promise<JornadaPolicyRecord | null>;
  }

  /** DELETE a policy by ID — for removing mistaken/invalid entries. */
  async delete(id: string): Promise<void> {
    await this.prisma.jornadaPolicy.delete({
      where: { id },
    });
  }
}
