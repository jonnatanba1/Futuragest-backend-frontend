/**
 * GetPeriodBalanceUseCase — live (on-demand) period balance computation.
 *
 * Orchestrates:
 *   1. Fetch scoped completed attendances in [desde, hasta] via AttendanceReaderPort.
 *   2. Fetch full JornadaPolicy timeline via JornadaPolicyRepositoryPort.
 *   3. Delegate math to CalculatePeriodBalanceUseCase (pure, no DB).
 *
 * PR-A: carryIn = 0 (carry-over read is PR-B).
 * PR-B: inject CompensationPeriodRepositoryPort to read previous CARRY_OVER period.
 *
 * Scope / RBAC (spec §6 REQ-RBAC-04):
 *   - The AttendanceReaderPort is scoped: returns null when operario is out of scope.
 *   - null → throw OperarioNotInScopeError (HTTP 404, fail-closed).
 *
 * Result is NOT persisted — purely derived on demand.
 */

import type { AttendanceReaderPort } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { PeriodBalance } from '../domain/period-balance.vo';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';

export interface GetPeriodBalanceInput {
  operarioId: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

export class GetPeriodBalanceUseCase {
  constructor(
    private readonly attendanceReader: AttendanceReaderPort,
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    private readonly calcUseCase: CalculatePeriodBalanceUseCase,
  ) {}

  async execute(input: GetPeriodBalanceInput): Promise<PeriodBalance> {
    const { operarioId, desde, hasta } = input;

    // 1. Fetch scoped attendances — null means operario out of scope (fail-closed)
    const attendances = await this.attendanceReader.findCompletedInRange(
      operarioId,
      desde,
      hasta,
    );
    if (attendances === null) {
      throw new OperarioNotInScopeError(operarioId);
    }

    // 2. Fetch full policy timeline
    const policyTimeline = await this.policyRepo.findTimeline();

    // 3. Delegate math to pure use-case (carryIn = 0 for PR-A)
    return this.calcUseCase.execute({ attendances, policyTimeline });
  }
}
