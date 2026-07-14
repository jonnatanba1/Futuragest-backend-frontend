/**
 * GetPeriodBalanceUseCase — live (on-demand) period balance computation.
 *
 * Orchestrates:
 *   1. Scoped operario existence check via OperarioReaderPort (fail-closed 404).
 *   2. Fetch scoped completed attendances in [desde, hasta] via AttendanceReaderPort.
 *   3. Fetch full JornadaPolicy timeline via JornadaPolicyRepositoryPort.
 *   4. Read carryIn from previous CARRY_OVER period via CompensationPeriodRepositoryPort (PR-B).
 *   5. Delegate math to CalculatePeriodBalanceUseCase (pure, no DB).
 *
 * PR-A: periodRepo is optional (default null → carryIn = 0, backward-compatible).
 * PR-B: inject CompensationPeriodRepositoryPort to read previous CARRY_OVER period.
 *
 * Scope / RBAC (spec §6 REQ-RBAC-04):
 *   - OperarioReaderPort.findById returns null when the operario does not exist
 *     OR is outside the caller's scope (SUPERVISOR sees only their own operarios;
 *     COORDINADOR sees all in their zone; global roles are unrestricted).
 *   - null → throw OperarioNotInScopeError (HTTP 404, fail-closed).
 *   - This mirrors the pattern used by CheckInAttendanceUseCase (asistencia module).
 *
 * Empty-vs-missing semantics:
 *   - Operario exists in scope but has zero completed attendances in range → 200 zeros (valid).
 *   - Operario not in scope or nonexistent → OperarioNotInScopeError → 404 (fail-closed).
 *
 * Carry-over read path (PR-B):
 *   - Derive the periodKey for `desde` and look up the PREVIOUS closed period.
 *   - If it has disposition = CARRY_OVER and saldo < 0, use its saldo as carryIn.
 *   - PAYROLL_DEDUCTION periods do NOT carry (debt was settled in payroll).
 *
 * Result is NOT persisted — purely derived on demand.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { AttendanceReaderPort } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type { CompensationPeriodRepositoryPort } from '../domain/ports/compensation-period-repository.port';
import type { PeriodBalance } from '../domain/period-balance.vo';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { derivePeriodKey, derivePreviousPeriodKey } from './derive-period-key';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';

export interface GetPeriodBalanceInput {
  operarioId: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  /** When true, compute category breakdown from AttendanceBreakdown data (REQ-009). */
  breakdownEnabled?: boolean;
}

export class GetPeriodBalanceUseCase {
  constructor(
    private readonly attendanceReader: AttendanceReaderPort,
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    private readonly calcUseCase: CalculatePeriodBalanceUseCase,
    private readonly operarioReader: OperarioReaderPort,
    /** Optional (PR-B): when provided, reads carryIn from previous CARRY_OVER period. */
    private readonly periodRepo?: CompensationPeriodRepositoryPort | null,
  ) {}

  async execute(input: GetPeriodBalanceInput): Promise<PeriodBalance> {
    const { operarioId, desde, hasta, breakdownEnabled = false } = input;

    // 1. Scoped existence check — null means operario not in scope or nonexistent (fail-closed)
    const operario = await this.operarioReader.findById(operarioId);
    if (operario === null) {
      throw new OperarioNotInScopeError(operarioId);
    }

    // 2. Fetch scoped completed attendances in range
    //    Returns [] when operario is in scope but has no completed attendances — valid empty result.
    const attendances = await this.attendanceReader.findCompletedInRange(
      operarioId,
      desde,
      hasta,
    );

    // 3. Fetch full policy timeline
    const policyTimeline = await this.policyRepo.findTimeline();

    // 4. Resolve carryIn from previous CARRY_OVER period (PR-B / Fix 3)
    //    Fix 3: carryIn applies ONLY from the IMMEDIATE predecessor (exact prevKey match).
    //    Live balance never throws NonContiguousCloseError — it's a read; the UI must not break.
    let carryIn = new Decimal(0);
    if (this.periodRepo) {
      const currentPeriodKey = derivePeriodKey(desde);
      const prevKey = derivePreviousPeriodKey(currentPeriodKey);
      if (prevKey !== null) {
        const exactPrev = await this.periodRepo.findByOperarioAndPeriod(operarioId, prevKey);
        if (exactPrev !== null && exactPrev.disposition === 'CARRY_OVER' && exactPrev.saldo.isNegative()) {
          carryIn = exactPrev.saldo;
        }
      }
    }

    // 5. Delegate math to pure use-case with resolved carryIn
    const balance = await this.calcUseCase.execute({
      attendances,
      policyTimeline,
      carryIn,
      breakdownEnabled,
    });

    // 6. Resolve current period closed status and metadata
    if (this.periodRepo) {
      const currentPeriodKey = derivePeriodKey(desde);
      const exactCurrent = await this.periodRepo.findByOperarioAndPeriod(operarioId, currentPeriodKey);
      if (exactCurrent !== null) {
        balance.isClosed = true;
        balance.disposition = exactCurrent.disposition;
        balance.paidAt = exactCurrent.paidAt;
        balance.payoutRef = exactCurrent.payoutRef;
        balance.divergedAt = exactCurrent.divergedAt;

        // C-10: When the period is closed, the frozen snapshot is the
        // authoritative source of truth — not the live recomputation.
        // Returning live values while isClosed=true creates a confusing
        // UX where the balance display contradicts the payout panel.
        balance.creditos = exactCurrent.creditos;
        balance.debitos = exactCurrent.debitos;
        balance.saldo = exactCurrent.saldo;
      }
    }

    return balance;
  }
}
