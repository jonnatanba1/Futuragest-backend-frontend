/**
 * CompensationPeriodRepositoryPort — read + write contract for CompensationPeriod.
 *
 * PR-B: real adapter is ScopedCompensationPeriodRepository in iam/infrastructure/.
 *
 * Design §6: scoped reads (findFirstScoped / findManyScoped in adapter);
 * writes are immutable CREATE-only (mirror Novedad.create pattern).
 *
 * findOverlappingLiquidated is intentionally global (no scope) because
 * SetJornadaPolicyUseCase runs with TALENTO_HUMANO / SYSTEM_ADMIN authority
 * and needs to check ALL periods across all operarios.
 */

import type { Decimal } from '@prisma/client/runtime/client';

export const COMPENSATION_PERIOD_REPOSITORY_PORT = Symbol('CompensationPeriodRepositoryPort');

/** Subset of CompensationDisposition enum values used in domain logic. */
export type CompensationDisposition = 'CARRY_OVER' | 'PAYROLL_DEDUCTION';

/** Shape of a persisted CompensationPeriod (scalar fields only — no relations). */
export interface CompensationPeriodRecord {
  id: string;
  operarioId: string;
  zoneId: string;
  supervisorId: string;
  periodKey: string; // e.g. "2026-05-Q1"
  desde: string;     // YYYY-MM-DD Colombia local
  hasta: string;     // YYYY-MM-DD Colombia local
  creditos: Decimal;
  debitos: Decimal;
  carryIn: Decimal;
  saldo: Decimal;
  disposition: CompensationDisposition | null;
  approvedByUserId: string | null;
  decidedAt: Date | null;
  closedAt: Date;
  clientRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data required to create an immutable CompensationPeriod snapshot. */
export interface CreateCompensationPeriodData {
  operarioId: string;
  zoneId: string;
  supervisorId: string;
  periodKey: string;
  desde: string;
  hasta: string;
  creditos: Decimal;
  debitos: Decimal;
  carryIn: Decimal;
  saldo: Decimal;
  disposition: CompensationDisposition | null;
  approvedByUserId: string | null;
  decidedAt: Date | null;
  clientRef: string | null;
}

export interface CompensationPeriodRepositoryPort {
  /**
   * Find a closed period for this operario + periodKey (scoped).
   * Returns null when not found or out of scope (fail-closed).
   */
  findByOperarioAndPeriod(
    operarioId: string,
    periodKey: string,
  ): Promise<CompensationPeriodRecord | null>;

  /**
   * Find the most recent closed CompensationPeriod for an operario whose
   * periodKey sorts strictly before `beforePeriodKey`.
   * Used to read carryIn from the previous CARRY_OVER fortnight.
   * Scoped — returns null when none found or out of scope.
   */
  findPreviousClosed(
    operarioId: string,
    beforePeriodKey: string,
  ): Promise<CompensationPeriodRecord | null>;

  /**
   * Find a period by clientRef (idempotency key, scoped).
   * Returns null when not found or out of scope.
   */
  findByClientRef(clientRef: string): Promise<CompensationPeriodRecord | null>;

  /**
   * Find the first CompensationPeriod that overlaps the given vigenteDesde.
   * A period overlaps if vigenteDesde falls within [desde, hasta] inclusive.
   * GLOBAL read (no scope filtering) — used by SetJornadaPolicyUseCase
   * which runs with TALENTO_HUMANO / SYSTEM_ADMIN authority.
   * Returns null if no overlap found.
   */
  findOverlappingLiquidated(vigenteDesde: Date): Promise<{ desde: string; hasta: string } | null>;

  /**
   * Create an immutable CompensationPeriod snapshot (single INSERT).
   * Callers must catch Prisma P2002 (unique constraint on operarioId+periodKey
   * or on clientRef) and handle idempotency / conflict at the use-case level.
   */
  create(data: CreateCompensationPeriodData): Promise<CompensationPeriodRecord>;
}
