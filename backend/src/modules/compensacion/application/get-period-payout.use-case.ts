/**
 * GetPeriodPayoutUseCase — computes the payable liquidation for a CLOSED fortnight.
 *
 * Flow (PR-C):
 *   1. Scoped operario existence check → OperarioNotInScopeError (404 fail-closed),
 *      same guard as GetPeriodBalanceUseCase (REQ-RBAC-04).
 *   2. Load the immutable CompensationPeriod snapshot (operarioId + periodKey).
 *      If none exists → PeriodNotClosedError (404): only a CLOSED period can be paid.
 *   3. Apply the recargo factor to the positive saldo (pure calculatePayout).
 *
 * The payout reads from the FROZEN snapshot, not the live balance — liquidation
 * must use the audited closed figures, not recomputed numbers.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import type { CompensationPeriodRepositoryPort } from '../domain/ports/compensation-period-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import { calculatePayout, type PayoutResult } from '../domain/payout.vo';
import { PeriodNotClosedError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';

export interface GetPeriodPayoutInput {
  operarioId: string;
  periodKey: string;
}

export interface PeriodPayout extends PayoutResult {
  operarioId: string;
  periodKey: string;
  /** The frozen saldo of the closed period (can be <= 0). */
  saldoHoras: Decimal;
}

export class GetPeriodPayoutUseCase {
  constructor(
    private readonly periodRepo: Pick<
      CompensationPeriodRepositoryPort,
      'findByOperarioAndPeriod'
    >,
    private readonly operarioReader: OperarioReaderPort,
  ) {}

  async execute(input: GetPeriodPayoutInput): Promise<PeriodPayout> {
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

    // 3. Apply recargo to the positive saldo (pure)
    const payout = calculatePayout(period.saldo);

    return {
      operarioId,
      periodKey,
      saldoHoras: period.saldo,
      ...payout,
    };
  }
}
