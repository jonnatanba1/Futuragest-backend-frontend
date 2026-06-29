/**
 * ConfirmPeriodPayoutUseCase — marks a closed period as paid (Fix 4).
 *
 * This is the WRITE half of the payout flow. It stamps `paidAt` and `payoutRef`
 * onto an already-closed CompensationPeriod, making it permanently liquidated.
 *
 * Idempotency contract (mirrors close's clientRef pattern):
 *   - If paidAt is already set → return the existing payout result + paid metadata
 *     WITHOUT mutating again (same-result idempotency). Do NOT error — the HR user
 *     may retry on network issues.
 *   - If markPaid returns count 0 → a concurrent confirm won the race → re-read and
 *     return the existing confirmed state (idempotent).
 *
 * Guard: saldo <= 0 → NothingToPayError (422). A zero/negative balance has nothing
 * to liquidate; the HR flow should not reach confirm for such periods.
 *
 * The sanctioned mutation:
 *   CompensationPeriod is otherwise immutable (Design §6, PR-B). paidAt/payoutRef
 *   are the ONE permitted mutation — guarded via updateMany WHERE paidAt IS NULL
 *   in the repository adapter so only the first writer wins.
 *
 * RBAC: enforced at controller level (same CLOSE_PERIOD_ROLES: TALENTO_HUMANO + SYSTEM_ADMIN).
 */

import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/client';
import type { CompensationPeriodRepositoryPort } from '../domain/ports/compensation-period-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import { calculatePayout, type PayoutResult } from '../domain/payout.vo';
import { NothingToPayError, PeriodNotClosedError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';

export interface ConfirmPeriodPayoutInput {
  operarioId: string;
  periodKey: string;
  confirmedByUserId: string; // JWT subject — required for audit
}

export interface ConfirmedPayout extends PayoutResult {
  operarioId: string;
  periodKey: string;
  /** The frozen saldo of the closed period (can be <= 0). */
  saldoHoras: Decimal;
  /** Timestamp when the payout was confirmed (set by this call or a previous one). */
  paidAt: Date;
  /** Server-generated UUID — idempotency key for this payout confirmation. */
  payoutRef: string;
}

export class ConfirmPeriodPayoutUseCase {
  constructor(
    private readonly periodRepo: Pick<
      CompensationPeriodRepositoryPort,
      'findByOperarioAndPeriod' | 'markPaid'
    >,
    private readonly operarioReader: OperarioReaderPort,
  ) {}

  async execute(input: ConfirmPeriodPayoutInput): Promise<ConfirmedPayout> {
    const { operarioId, periodKey } = input;

    // 1. Scope check — operario must be visible to the caller (fail-closed 404)
    const operario = await this.operarioReader.findById(operarioId);
    if (!operario) {
      throw new OperarioNotInScopeError(operarioId);
    }

    // 2. Load the closed snapshot — only a closed period can be liquidated
    const period = await this.periodRepo.findByOperarioAndPeriod(operarioId, periodKey);
    if (!period) {
      throw new PeriodNotClosedError(operarioId, periodKey);
    }

    // 3. Idempotency — if already confirmed, return existing state (no mutation)
    if (period.paidAt !== null) {
      const payout = calculatePayout(period.saldo);
      return {
        operarioId,
        periodKey,
        saldoHoras: period.saldo,
        paidAt: period.paidAt,
        payoutRef: period.payoutRef as string, // non-null when paidAt is set
        ...payout,
      };
    }

    // 4. Guard: saldo <= 0 → nothing to pay
    const ZERO = new Decimal(0);
    if (!period.saldo.greaterThan(ZERO)) {
      throw new NothingToPayError(operarioId, periodKey);
    }

    // 5. Stamp paidAt + payoutRef (guarded WHERE paidAt IS NULL)
    const paidAt = new Date();
    const payoutRef = randomUUID();
    const updatedCount = await this.periodRepo.markPaid(period.id, paidAt, payoutRef);

    if (updatedCount === 0) {
      // Concurrent confirm won the race — re-read the now-confirmed period.
      // confirmed cannot be null: we read it just above and the period exists.
      const confirmed = await this.periodRepo.findByOperarioAndPeriod(operarioId, periodKey);
      if (!confirmed) {
        throw new Error(`Race-condition re-read returned null for period ${periodKey} — unexpected state.`);
      }
      // paidAt and payoutRef are non-null: the concurrent confirm set them.
      if (!confirmed.paidAt || !confirmed.payoutRef) {
        throw new Error(`paidAt or payoutRef unexpectedly null after concurrent confirm for period ${periodKey}`);
      }
      const payout = calculatePayout(confirmed.saldo);
      return {
        operarioId,
        periodKey,
        saldoHoras: confirmed.saldo,
        paidAt: confirmed.paidAt,
        payoutRef: confirmed.payoutRef,
        ...payout,
      };
    }

    // 6. Return the newly confirmed payout
    const payout = calculatePayout(period.saldo);
    return {
      operarioId,
      periodKey,
      saldoHoras: period.saldo,
      paidAt,
      payoutRef,
      ...payout,
    };
  }
}
