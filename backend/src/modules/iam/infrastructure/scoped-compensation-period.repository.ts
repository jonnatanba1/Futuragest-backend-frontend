/**
 * ScopedCompensationPeriodRepository — the ONLY sanctioned Prisma access point
 * for the CompensationPeriod model (reads AND writes).
 *
 * Design constraint: all CompensationPeriod Prisma calls live here so the
 * scope-meta-guard raw-call scan finds zero violations in non-sanctioned files.
 * This file matches the `scoped-[a-z-]+\.repository` regex and is therefore
 * exempt from the meta-guard scan.
 *
 * Read path (scoped): inherits findManyScoped / findFirstScoped from ScopedRepository
 *   — these automatically apply applyScopeFilter(ctx, 'CompensationPeriod').
 *   SCOPE_MAPS.CompensationPeriod entry MUST exist (added in B3, scope-filter.ts).
 *
 * findOverlappingClosed: GLOBAL (no scope) — called by SetJornadaPolicyUseCase
 *   which runs with TALENTO_HUMANO / SYSTEM_ADMIN authority to check ALL periods.
 *   Uses this.delegate.findFirst directly (not via findFirstScoped).
 *
 * Write path: single immutable INSERT via this.delegate.create — CompensationPeriod
 *   is append-only (never updated). Mirror of ScopedNovedadRepository.create.
 *
 * W4 constraint: do NOT pass include:{operario/approvedBy} — scoped relations.
 *   Return raw scalar rows only.
 *
 * Implements CompensationPeriodRepositoryPort (domain port).
 */

import { Injectable } from '@nestjs/common';
import type { CompensationPeriod } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';
import type {
  CompensationPeriodRepositoryPort,
  CompensationPeriodRecord,
  CreateCompensationPeriodData,
} from '../../compensacion/domain/ports/compensation-period-repository.port';

@Injectable()
export class ScopedCompensationPeriodRepository
  extends ScopedRepository<PrismaService['compensationPeriod'], CompensationPeriod>
  implements CompensationPeriodRepositoryPort
{
  protected readonly model = 'CompensationPeriod';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.compensationPeriod, scopeHolder);
  }

  // ── Scoped reads ─────────────────────────────────────────────────────────────

  /**
   * Find a closed period for this operario + periodKey (scoped).
   * Returns null when not found or out of scope (fail-closed).
   */
  findByOperarioAndPeriod(
    operarioId: string,
    periodKey: string,
  ): Promise<CompensationPeriodRecord | null> {
    return this.findFirstScoped({
      where: { operarioId, periodKey },
    }) as Promise<CompensationPeriodRecord | null>;
  }

  /**
   * Find the most recent closed period for an operario with periodKey
   * strictly less than `beforePeriodKey` (lexicographic — "YYYY-MM-Q1/Q2" sorts correctly).
   * Used to read carryIn from the previous CARRY_OVER fortnight.
   * Scoped — returns null when none found or out of scope.
   */
  async findPreviousClosed(
    operarioId: string,
    beforePeriodKey: string,
  ): Promise<CompensationPeriodRecord | null> {
    // Using findFirstScoped to enforce scope — then apply periodKey lt filter.
    // We can't rely on findFirstScoped's `where` alone for `lt`, but we pass it
    // as the where argument — the base class merges it with the scope predicate.
    return this.findFirstScoped({
      where: {
        operarioId,
        periodKey: { lt: beforePeriodKey },
      },
      orderBy: { periodKey: 'desc' },
    }) as Promise<CompensationPeriodRecord | null>;
  }

  /**
   * Find a period by clientRef (idempotency key, scoped).
   * Returns null when not found or out of scope.
   */
  findByClientRef(clientRef: string): Promise<CompensationPeriodRecord | null> {
    return this.findFirstScoped({
      where: { clientRef },
    }) as Promise<CompensationPeriodRecord | null>;
  }

  /**
   * Find the first CompensationPeriod that overlaps the given vigenteDesde.
   * A period overlaps when desde <= vigenteDesde <= hasta (string comparison —
   * YYYY-MM-DD sorts lexicographically correctly).
   *
   * GLOBAL read (no scope filter) — SetJornadaPolicyUseCase runs with
   * TALENTO_HUMANO / SYSTEM_ADMIN authority and needs to see ALL periods.
   * Uses this.delegate.findFirst directly (bypassing findFirstScoped intentionally).
   */
  async findOverlappingClosed(vigenteDesde: Date): Promise<{ desde: string; hasta: string } | null> {
    // Convert Date to YYYY-MM-DD Colombia local string for string comparison.
    // We compare against the string columns `desde` and `hasta`.
    // Colombia is UTC-5; stored dates already use YYYY-MM-DD Colombia local.
    // We format vigenteDesde as a YYYY-MM-DD string (UTC date to string — the
    // JornadaPolicy stores vigenteDesde as UTC midnight, matching Colombia local midnight).
    const dateStr = vigenteDesde.toISOString().slice(0, 10);

    const period = await this.delegate.findFirst({
      where: {
        AND: [
          { desde: { lte: dateStr } },
          { hasta: { gte: dateStr } },
        ],
      },
      select: { desde: true, hasta: true },
    } as Parameters<typeof this.delegate.findFirst>[0]) as { desde: string; hasta: string } | null;

    return period;
  }

  // ── Write (immutable CREATE — sanctioned file, safe from meta-guard scan) ────

  /**
   * Create an immutable CompensationPeriod snapshot (single INSERT).
   * Callers must catch Prisma P2002 (operarioId+periodKey unique index or
   * clientRef unique) and handle idempotency / conflict at the use-case level.
   */
  async create(data: CreateCompensationPeriodData): Promise<CompensationPeriodRecord> {
    return this.delegate.create({
      data: {
        operarioId: data.operarioId,
        zoneId: data.zoneId,
        supervisorId: data.supervisorId,
        periodKey: data.periodKey,
        desde: data.desde,
        hasta: data.hasta,
        creditos: data.creditos,
        debitos: data.debitos,
        carryIn: data.carryIn,
        saldo: data.saldo,
        disposition: data.disposition ?? null,
        approvedByUserId: data.approvedByUserId ?? null,
        decidedAt: data.decidedAt ?? null,
        clientRef: data.clientRef ?? null,
      },
    }) as Promise<CompensationPeriodRecord>;
  }

  // ── SANCTIONED MUTATIONS (Fix 4 + Fix 5) ─────────────────────────────────────
  //
  // CompensationPeriod is otherwise immutable (Design §6). The two methods below
  // are the ONLY permitted UPDATEs, each guarded at the DB level via updateMany
  // with a WHERE clause ensuring idempotency.

  /**
   * Mark a period as paid (payout confirmed by HR). Fix 4.
   *
   * Guarded UPDATE WHERE paidAt IS NULL — only the first concurrent confirm wins.
   * Returns the count of rows actually updated (1 = won, 0 = already paid by concurrent call).
   * Callers must re-read and return existing when count = 0.
   */
  async markPaid(id: string, paidAt: Date, payoutRef: string): Promise<number> {
    const result = await this.delegate.updateMany({
      where: {
        id,
        paidAt: null,
      } as Parameters<typeof this.delegate.updateMany>[0]['where'],
      data: {
        paidAt,
        payoutRef,
      } as Parameters<typeof this.delegate.updateMany>[0]['data'],
    });
    return result.count;
  }

  /**
   * Mark a period as diverged (attendance data changed inside a closed period). Fix 5.
   *
   * Guarded UPDATE WHERE divergedAt IS NULL — idempotent; only first call sets the timestamp.
   */
  async markDiverged(id: string, divergedAt: Date): Promise<void> {
    await this.delegate.updateMany({
      where: {
        id,
        divergedAt: null,
      } as Parameters<typeof this.delegate.updateMany>[0]['where'],
      data: {
        divergedAt,
      } as Parameters<typeof this.delegate.updateMany>[0]['data'],
    });
  }

  /**
   * Find a closed period that covers the given YYYY-MM-DD date for an operario. Fix 5.
   *
   * GLOBAL read (no scope filter) — used by drift detection which is an internal
   * cross-module concern, not a user-facing filtered query.
   */
  async findClosedContainingDate(
    operarioId: string,
    date: string,
  ): Promise<CompensationPeriodRecord | null> {
    return this.delegate.findFirst({
      where: {
        operarioId,
        desde: { lte: date },
        hasta: { gte: date },
      },
    } as Parameters<typeof this.delegate.findFirst>[0]) as Promise<CompensationPeriodRecord | null>;
  }
}
