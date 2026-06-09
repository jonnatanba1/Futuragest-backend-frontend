/**
 * GetPeriodBalanceUseCase — live (on-demand) period balance computation.
 *
 * Orchestrates:
 *   1. Scoped operario existence check via OperarioReaderPort (fail-closed 404).
 *   2. Fetch scoped completed attendances in [desde, hasta] via AttendanceReaderPort.
 *   3. Fetch full JornadaPolicy timeline via JornadaPolicyRepositoryPort.
 *   4. Delegate math to CalculatePeriodBalanceUseCase (pure, no DB).
 *
 * PR-A: carryIn = 0 (carry-over read is PR-B).
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
 * Result is NOT persisted — purely derived on demand.
 */

import type { AttendanceReaderPort } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
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
    private readonly operarioReader: OperarioReaderPort,
  ) {}

  async execute(input: GetPeriodBalanceInput): Promise<PeriodBalance> {
    const { operarioId, desde, hasta } = input;

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

    // 4. Delegate math to pure use-case (carryIn = 0 for PR-A)
    return this.calcUseCase.execute({ attendances, policyTimeline });
  }
}
