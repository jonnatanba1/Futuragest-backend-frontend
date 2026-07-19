/**
 * CloseCompensationPeriodUseCase — immutable fortnight snapshot + disposition.
 *
 * Mirrors CheckOutAttendanceUseCase (completedAt lock + clientRef idempotency).
 * Pre-conditions checked in order (spec §5 REQ-EP-04):
 *
 *   1. Scoped operario lookup → null = OperarioNotInScopeError (404).
 *   2. Idempotency: if a CompensationPeriod already exists for (operarioId, periodKey):
 *      a. Same clientRef provided AND matches stored → return existing {period, idempotent:true} (no write).
 *      b. Different or absent clientRef → CompensationPeriodAlreadyClosedError (409).
 *   3. Compute live balance (carryIn from previous CARRY_OVER period if exists).
 *   4. If saldo < 0 and disposition is absent → DispositionRequiredError (422).
 *   5. Single immutable CREATE (catch P2002 → re-fetch + idempotency/conflict race-safety).
 *
 * RBAC: enforced at controller level (TALENTO_HUMANO + SYSTEM_ADMIN only).
 * approvedByUserId MUST be the authenticated user's id (passed from controller).
 *
 * Return shape: CloseCompensationPeriodResult { period, idempotent }
 * Controller returns HTTP 201 for new close, HTTP 200 for idempotent replay.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { derivePeriodKey, deriveFortnightRange, derivePreviousPeriodKey } from './derive-period-key';
import { CalculatePeriodBalanceUseCase } from './calculate-period-balance.use-case';
import type { AttendanceReaderPort } from '../domain/ports/attendance-reader.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { OperarioReaderPort } from '../domain/ports/operario-reader.port';
import type { SupervisorZoneReaderPort } from '../domain/ports/supervisor-zone-reader.port';
import type {
  CompensationPeriodRepositoryPort,
  CompensationPeriodRecord,
  CompensationDisposition,
} from '../domain/ports/compensation-period-repository.port';
import {
  CompensationPeriodAlreadyClosedError,
  DispositionRequiredError,
  NonCanonicalPeriodRangeError,
  NonContiguousCloseError,
  ClientRefConflictError,
  ZoneIdResolutionError,
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';

export interface CloseCompensationPeriodInput {
  operarioId: string;
  desde: string; // YYYY-MM-DD Colombia local (inclusive)
  hasta: string; // YYYY-MM-DD Colombia local (inclusive)
  disposition?: CompensationDisposition | null;
  approvedByUserId: string; // authenticated user id (from JWT)
  clientRef?: string | null; // optional idempotency token
}

export interface CloseCompensationPeriodResult {
  period: CompensationPeriodRecord;
  /** true when returning an existing closed period (idempotent replay); false when newly closed. */
  idempotent: boolean;
}

export class CloseCompensationPeriodUseCase {
  constructor(
    private readonly periodRepo: CompensationPeriodRepositoryPort,
    private readonly attendanceReader: AttendanceReaderPort,
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    private readonly calcUseCase: CalculatePeriodBalanceUseCase,
    private readonly operarioReader: OperarioReaderPort,
    private readonly supervisorZoneReader: SupervisorZoneReaderPort,
  ) {}

  async execute(input: CloseCompensationPeriodInput): Promise<CloseCompensationPeriodResult> {
    const { operarioId, desde, hasta, disposition, approvedByUserId, clientRef } = input;

    // 1. Scoped operario lookup — null = not found or out of scope → 404 (fail-closed)
    const operario = await this.operarioReader.findById(operarioId);
    if (operario === null) {
      throw new OperarioNotInScopeError(operarioId);
    }

    // Derive periodKey from the `desde` date (Q1 = days 1-15, Q2 = days 16-end)
    const periodKey = derivePeriodKey(desde);

    // Fix 2: Canonical fortnight range validation — hasta must match exactly
    const canonical = deriveFortnightRange(periodKey);
    if (desde !== canonical.desde || hasta !== canonical.hasta) {
      throw new NonCanonicalPeriodRangeError(periodKey, canonical.desde, canonical.hasta);
    }

    // 2. Idempotency check — if period already closed for this operario+periodKey
    const existing = await this.periodRepo.findByOperarioAndPeriod(operarioId, periodKey);
    if (existing !== null) {
      // 2a. Idempotent replay: same clientRef → return existing (no write)
      if (clientRef && existing.clientRef === clientRef) {
        return { period: existing, idempotent: true };
      }
      // 2b. Real double-close attempt (different or absent ref) → structured 409
      throw new CompensationPeriodAlreadyClosedError(operarioId, periodKey);
    }

    // 3. Compute live balance
    //    Fix 3: carryIn applies ONLY from the IMMEDIATE predecessor (exact prevKey match).
    //    If the most-recent earlier closed period is NOT the immediate predecessor AND
    //    it carries unconsumed debt (CARRY_OVER, saldo < 0) → NonContiguousCloseError (409).
    //    If the gap-period has no debt, proceed with carryIn = 0 (harmless gap).
    const prevKey = derivePreviousPeriodKey(periodKey);
    let carryIn = new Decimal(0);
    if (prevKey !== null) {
      // Look up the EXACT immediate predecessor
      const exactPrev = await this.periodRepo.findByOperarioAndPeriod(operarioId, prevKey);
      if (exactPrev !== null && exactPrev.disposition === 'CARRY_OVER' && exactPrev.saldo.isNegative()) {
        carryIn = exactPrev.saldo;
      }

      // Gap-debt check: is there a more-recent-than-prevKey period with unconsumed debt?
      // If the most-recent earlier closed period is NOT prevKey and has CARRY_OVER debt → reject.
      if (exactPrev === null) {
        const mostRecentPrev = await this.periodRepo.findPreviousClosed(operarioId, periodKey);
        if (
          mostRecentPrev !== null &&
          mostRecentPrev.periodKey !== prevKey &&
          mostRecentPrev.disposition === 'CARRY_OVER' &&
          mostRecentPrev.saldo.isNegative()
        ) {
          throw new NonContiguousCloseError(mostRecentPrev.periodKey);
        }
      }
    }

    const attendances = await this.attendanceReader.findCompletedInRange(operarioId, desde, hasta);
    const policyTimeline = await this.policyRepo.findTimeline();

    const balance = await this.calcUseCase.execute({ attendances, policyTimeline, carryIn });

    // 4. If saldo < 0 and disposition is absent → DispositionRequiredError (422)
    if (balance.saldo.isNegative() && !disposition) {
      throw new DispositionRequiredError(periodKey);
    }

    // Fix 7: resolve denormalized scope fields via separate supervisor query (W4 rule).
    // zoneId is NOT a field on Operario — it lives on the Supervisor model.
    // We must issue a separate query (resolveSupervisorByEmail precedent in ScopedOperarioRepository).
    // Fail loudly if the supervisor's zoneId cannot be resolved — a '' default would silently
    // corrupt every snapshot and break COORDINADOR scope filtering.
    const operarioRecord = operario as {
      id: string;
      supervisorId?: string | null;
    };

    const resolvedSupervisorId = operarioRecord.supervisorId ?? null;
    if (!resolvedSupervisorId) {
      throw new ZoneIdResolutionError(operarioId, null);
    }

    const resolvedZoneId = await this.supervisorZoneReader.findZoneIdBySupervisorId(resolvedSupervisorId);
    if (!resolvedZoneId) {
      throw new ZoneIdResolutionError(operarioId, resolvedSupervisorId);
    }

    // 5. Single immutable CREATE
    try {
      const period = await this.periodRepo.create({
        operarioId,
        zoneId: resolvedZoneId,
        supervisorId: resolvedSupervisorId,
        periodKey,
        desde,
        hasta,
        creditos: balance.creditos,
        debitos: balance.debitos,
        carryIn,
        saldo: balance.saldo,
        disposition: disposition ?? null,
        approvedByUserId,
        decidedAt: new Date(),
        clientRef: clientRef ?? null,
      });

      return { period, idempotent: false };
    } catch (err: unknown) {
      // P2002 = unique constraint violation (race: concurrent close request, or cross-operario clientRef collision)
      if (isPrismaP2002(err)) {
        // Re-fetch — another request may have already closed this period
        const raceExisting = await this.periodRepo.findByOperarioAndPeriod(operarioId, periodKey);
        if (raceExisting !== null) {
          // Same operario+periodKey was closed concurrently
          if (clientRef && raceExisting.clientRef === clientRef) {
            return { period: raceExisting, idempotent: true };
          }
          throw new CompensationPeriodAlreadyClosedError(operarioId, periodKey);
        }
        // Fix 10: No period found for THIS operario+key → the constraint was on clientRef
        // from a DIFFERENT operario (cross-operario collision). Throw a clean 409.
        if (clientRef) {
          throw new ClientRefConflictError(clientRef);
        }
        // C-05: clientRef was null but P2002 still fired (edge case — possible
        // with concurrent inserts targeting the same operarioId+periodKey where
        // the race-existing row was simultaneously deleted). Throw a clean 409
        // instead of leaking raw Prisma error → HTTP 500.
        throw new CompensationPeriodAlreadyClosedError(operarioId, periodKey);
      }
      throw err;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Type guard for Prisma P2002 unique constraint violation errors.
 * Mirrors the pattern used in asistencia and novedades modules.
 */
function isPrismaP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
