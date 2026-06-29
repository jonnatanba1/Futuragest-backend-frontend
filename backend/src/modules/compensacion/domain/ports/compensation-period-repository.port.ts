/**
 * CompensationPeriodRepositoryPort — read + write contract for CompensationPeriod.
 *
 * PR-B: real adapter is ScopedCompensationPeriodRepository in iam/infrastructure/.
 *
 * Design §6: scoped reads (findFirstScoped / findManyScoped in adapter);
 * writes are immutable CREATE-only (mirror Novedad.create pattern).
 *
 * findOverlappingClosed is intentionally global (no scope) because
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
  /** Set once when HR confirms the payout. Null until confirmed. */
  paidAt: Date | null;
  /** Server-generated UUID for payout idempotency. Null until confirmed. */
  payoutRef: string | null;
  /** Set when attendance data changes inside this already-closed period. */
  divergedAt: Date | null;
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
   * Find the first CompensationPeriod (closed snapshot) that overlaps the given vigenteDesde.
   * A period overlaps if vigenteDesde falls within [desde, hasta] inclusive.
   * Every CompensationPeriod IS a closure (written once, immutable) — the name
   * "Closed" reflects actual semantics (replaces the earlier misleading "Liquidated").
   * GLOBAL read (no scope filtering) — used by SetJornadaPolicyUseCase
   * which runs with TALENTO_HUMANO / SYSTEM_ADMIN authority.
   * Returns null if no overlap found.
   */
  findOverlappingClosed(vigenteDesde: Date): Promise<{ desde: string; hasta: string } | null>;

  /**
   * Create an immutable CompensationPeriod snapshot (single INSERT).
   * Callers must catch Prisma P2002 (unique constraint on operarioId+periodKey
   * or on clientRef) and handle idempotency / conflict at the use-case level.
   */
  create(data: CreateCompensationPeriodData): Promise<CompensationPeriodRecord>;

  /**
   * Mark a period as paid (payout confirmed by HR).
   *
   * SANCTIONED MUTATION: This is the ONE permitted UPDATE on CompensationPeriod.
   * It is guarded at the DB level via WHERE paidAt IS NULL (updateMany) so
   * concurrent confirm-payout calls are safe — only the first writer wins.
   *
   * Returns the count of rows actually updated:
   *   1 = this caller won the race and set paidAt/payoutRef.
   *   0 = concurrent caller already confirmed (re-read and return existing, idempotent).
   *
   * @param id         CompensationPeriod row id.
   * @param paidAt     Timestamp to set.
   * @param payoutRef  UUID idempotency key to set.
   */
  markPaid(id: string, paidAt: Date, payoutRef: string): Promise<number>;

  /**
   * Mark a period as diverged (attendance data changed inside a closed period).
   *
   * Only sets divergedAt when it is currently NULL — idempotent on the DB via
   * WHERE divergedAt IS NULL guard. Safe to call repeatedly; only the first
   * call persists the timestamp.
   *
   * @param id  CompensationPeriod row id.
   */
  markDiverged(id: string, divergedAt: Date): Promise<void>;

  /**
   * Find a closed CompensationPeriod that contains the given date for an operario.
   * Used by the drift detection path to check whether a completed attendance
   * falls inside a frozen snapshot.
   *
   * NOT scoped — the drift check is an internal cross-module concern, not a user-facing
   * filtered query. Returns null if no closed period covers this date.
   *
   * @param operarioId  The operario whose period to look up.
   * @param date        YYYY-MM-DD Colombia local date from the completed attendance.
   */
  findClosedContainingDate(
    operarioId: string,
    date: string,
  ): Promise<CompensationPeriodRecord | null>;
}
