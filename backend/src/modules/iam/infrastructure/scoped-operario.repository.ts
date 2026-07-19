/**
 * T4.7 + T-11 — ScopedOperarioRepository.
 *
 * Concrete scoped repository for the Operario model.
 * SUPERVISOR scope: only their own operarios.
 * COORDINADOR scope: operarios whose supervisor is in their zone.
 * Global roles: all operarios.
 *
 * ALL Operario writes MUST go through this file (scope-meta-guard enforces this).
 * W4: No include: { supervisor } on operario queries — supervisor resolved via
 * separate query (resolveSupervisorByEmail).
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Operario } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';

@Injectable()
export class ScopedOperarioRepository
  extends ScopedRepository<PrismaService['operario'], Operario>
  implements OperarioRepositoryPort
{
  protected readonly model = 'Operario';

  /** Allow including area (lookup relation, not a scoped read) on operario queries. */
  protected override get scopedRelations(): string[] {
    const all = super.scopedRelations;
    return all.filter((r) => r !== 'area');
  }

  constructor(
    private readonly prismaService: PrismaService,
    scopeHolder: ScopeContextHolder,
  ) {
    super(prismaService.operario, scopeHolder);
  }

  // ─── Read methods (existing) ───────────────────────────────────────────────

  findMany(where?: Prisma.OperarioWhereInput): Promise<Operario[]> {
    return this.findManyScoped({
      where: where ?? {},
      include: { area: { select: { id: true, name: true } } },
    });
  }

  findById(id: string): Promise<Operario | null> {
    return this.findFirstScoped({
      where: { id },
      include: { area: { select: { id: true, name: true } } },
    });
  }

  // ─── Write methods (T-11) ─────────────────────────────────────────────────

  /**
   * Creates a new operario with deactivatedAt = null (active by default).
   * Caller must handle Prisma P2002 → DuplicateDocumentoError.
   */
  create(data: {
    fullName: string;
    documento: string;
    supervisorId: string;
    cargo: string;
    areaId?: string;
  }): Promise<Operario> {
    return this.prismaService.operario.create({
      data: {
        fullName: data.fullName,
        documento: data.documento,
        supervisorId: data.supervisorId,
        cargo: data.cargo,
        areaId: data.areaId ?? null,
        deactivatedAt: null,
      },
    });
  }

  /**
   * Finds an operario by documento (global, unscoped — for duplicate check on @unique).
   */
  findByDocumento(documento: string): Promise<Operario | null> {
    return this.prismaService.operario.findUnique({ where: { documento } });
  }

  /**
   * Finds an operario by id within the current scope (role-filtered).
   * Returns null if not found or out of scope.
   */
  findByIdScoped(id: string): Promise<Operario | null> {
    return this.findFirstScoped({ where: { id } });
  }

  /**
   * Sets or clears the deactivatedAt timestamp.
   * Pass a Date to deactivate, null to reactivate.
   */
  setDeactivatedAt(id: string, date: Date | null): Promise<Operario> {
    return this.prismaService.operario.update({
      where: { id },
      data: { deactivatedAt: date },
    });
  }

  /** Reassigns an operario to a different supervisor (FK enforced → P2003). */
  setSupervisor(id: string, supervisorId: string): Promise<Operario> {
    return this.prismaService.operario.update({
      where: { id },
      data: { supervisorId },
    });
  }

  /**
   * Bulk-creates operarios in a single $transaction.
   * Returns the count of successfully inserted rows.
   */
  async bulkCreate(
    rows: Array<{ fullName: string; documento: string; supervisorId: string; cargo: string; areaId?: string }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const results = await this.prismaService.$transaction(
      rows.map((r) =>
        this.prismaService.operario.create({
          data: {
            fullName: r.fullName,
            documento: r.documento,
            supervisorId: r.supervisorId,
            cargo: r.cargo,
            areaId: r.areaId ?? null,
            deactivatedAt: null,
          },
        }),
      ),
    );
    return results.length;
  }

  /**
   * Resolves a Supervisor by their user email.
   * Uses a SEPARATE query — never includes supervisor on Operario (W4 guard).
   */
  resolveSupervisorByEmail(email: string): Promise<{ id: string } | null> {
    return this.prismaService.supervisor.findFirst({
      where: { user: { email } },
      select: { id: true },
    });
  }

  /**
   * Checks whether an operario is active (deactivatedAt === null).
   * Returns null if the operario does not exist.
   * Used by cross-module OperarioStatusPort (PR-3).
   */
  async isActive(operarioId: string): Promise<boolean | null> {
    const row = await this.findFirstScoped({ where: { id: operarioId } });
    if (!row) return null;
    return row.deactivatedAt === null;
  }
}
