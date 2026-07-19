/**
 * JornadaPolicyRepository — SCOPE-AWARE Prisma adapter for JornadaPolicy.
 *
 * JornadaPolicy is keyed by (operarioId, zoneId, vigenteDesde):
 *   - operarioId === null AND zoneId === null → global policy
 *   - zoneId !== null → per-zone policy
 *   - operarioId !== null → per-operario override
 * This adapter does NOT extend ScopedRepository (no tenant isolation).
 *
 * APPEND-ONLY: only create + read + delete methods. No update.
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
  FindByScopeOptions,
} from '../../compensacion/domain/ports/jornada-policy-repository.port';

/**
 * Builds the Prisma `where` clause for `findByScope`.
 *
 *   - opts absent       → `{}` (all rows)
 *   - operarioId === undefined  → operarioId clause omitted
 *   - operarioId === null       → operarioId: { equals: null }
 *   - operarioId non-null       → operarioId: { equals: value }
 *   - zoneId: undefined         → clause omitted
 *   - zoneId: null | ''         → zoneId: { equals: null } (GLOBAL)
 *   - zoneId non-empty          → zoneId: { equals: value }
 */
function buildScopeWhere(opts?: FindByScopeOptions): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (opts === undefined) return where;

  if (opts.operarioId !== undefined) {
    where.operarioId = { equals: opts.operarioId };
  }
  if (opts.zoneId !== undefined) {
    // empty string is treated as "global" (IS NULL)
    where.zoneId = { equals: opts.zoneId === '' ? null : opts.zoneId };
  }
  return where;
}

@Injectable()
export class JornadaPolicyRepository implements JornadaPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  /** INSERT-only — never update. Field set unchanged from PR-A. */
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
   * Scope-aware read (R1.1). Uses `buildScopeWhere` to assemble the Prisma
   * `where` clause and orders ascending by `vigenteDesde`.
   */
  findByScope(opts?: FindByScopeOptions): Promise<JornadaPolicyRecord[]> {
    return this.prisma.jornadaPolicy.findMany({
      where: buildScopeWhere(opts),
      orderBy: { vigenteDesde: 'asc' },
    }) as Promise<JornadaPolicyRecord[]>;
  }

  /**
   * Scope-aware duplicate probe (R1.2). Returns true when at least one row
   * matches the exact (operarioId, zoneId, vigenteDesde) tuple.
   *
   * Gotcha: `vigenteDesde` is stored as UTC-midnight Date (sole writer is
   * SetJornadaPolicyUseCase). Equality check works because of this — do NOT
   * normalize the date differently here.
   */
  async existsByOperarioZoneVigente(
    operarioId: string | null,
    zoneId: string | null,
    vigenteDesde: Date,
  ): Promise<boolean> {
    const count = await this.prisma.jornadaPolicy.count({
      where: { operarioId, zoneId, vigenteDesde },
    });
    return count > 0;
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
