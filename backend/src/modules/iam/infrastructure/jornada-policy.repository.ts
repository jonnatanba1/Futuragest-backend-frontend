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
        horasDiarias: data.horasDiarias,
        vigenteDesde: data.vigenteDesde,
        horaInicio: '07:00',
        horaFin: '17:00',
        horasSemanales: data.horasDiarias.mul(5),
        diasLaborales: [1, 2, 3, 4, 5],
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
}
