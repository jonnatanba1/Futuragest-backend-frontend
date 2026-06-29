/**
 * CheckInAttendanceUseCase — creates a new attendance record for check-in.
 *
 * AT-01: happy path — creates record with supervisorId/zoneId from JWT scope.
 * AT-02: supervisorId/zoneId in body are IGNORED — only scope holder is used.
 * AT-04: clientRef idempotency — duplicate clientRef → return existing record (HTTP 200).
 * AT-05: operario not in supervisor scope → OperarioNotInScopeError (404).
 * AT-07/AT-08: GPS validation → InvalidGpsError (400).
 * AT-03: same operario+date, different clientRef → AttendanceAlreadyExistsError (409).
 *
 * Sequence:
 * 1. Validate GPS ranges (fail fast before any DB access).
 * 2. If clientRef provided: findByClientRef → if found, return existing (idempotent).
 * 3. Verify operario belongs to this supervisor (scoped lookup → null = not in scope).
 * 4. Create; catch P2002:
 *    - target includes 'clientRef' → race-condition idempotency: re-fetch and return existing.
 *    - target includes 'operarioId'/'date' → DuplicateAttendanceError (409).
 */

import type { Attendance, VerificationMethod } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { OperarioStatusPort } from '../../iam/domain/ports/operario-status.port';
import type { LateArrivalNovedadPort } from '../domain/ports/late-arrival-novedad.port';
import {
  AttendanceAlreadyExistsError,
  AttendanceDateMismatchError,
  InactiveOperarioError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';
import { toBogotaDate } from '../domain/bogota-date';

export interface CheckInInput {
  operarioId: string;
  date: string;
  checkInCapturedAt: string; // ISO 8601 from client
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy?: number;
  clientRef: string;
  /**
   * Audit label: how the supervisor verified identity before check-in.
   * Comes from the client — AUDIT LABEL ONLY. No authorization logic may depend on this.
   */
  verification?: VerificationMethod;
}

// Minimal interface for the scoped operario repo (avoids importing the full class)
interface ScopedOperarioRepo {
  findById(id: string): Promise<{ id: string; supervisorId: string } | null>;
}

function validateGps(lat: number, lng: number, accuracy?: number): void {
  if (lat < -90 || lat > 90) {
    throw new InvalidGpsError('lat', lat);
  }
  if (lng < -180 || lng > 180) {
    throw new InvalidGpsError('lng', lng);
  }
  if (accuracy !== undefined && accuracy !== null && accuracy < 0) {
    throw new InvalidGpsError('accuracy', accuracy);
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

function getConstraintTarget(err: unknown): string[] {
  if (
    typeof err === 'object' &&
    err !== null &&
    'meta' in err
  ) {
    const errWithMeta = err as { meta?: { target?: string | string[] } };
    if (
      typeof errWithMeta.meta === 'object' &&
      errWithMeta.meta !== null &&
      'target' in errWithMeta.meta
    ) {
      const target = errWithMeta.meta.target;
      return Array.isArray(target) ? target : [String(target)];
    }
  }
  return [];
}

export interface CheckInResult {
  record: Attendance;
  /** true when a new row was inserted; false on clientRef idempotent hit (both pre-create and race). */
  created: boolean;
}

export class CheckInAttendanceUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly operarioRepo: ScopedOperarioRepo,
    private readonly scopeHolder: ScopeContextHolder,
    private readonly operarioStatus: OperarioStatusPort,
    /** Optional: fire-and-forget late-arrival detection (PR 3). Omitting preserves backward compat. */
    private readonly lateArrivalPort?: LateArrivalNovedadPort,
  ) {}

  async execute(input: CheckInInput): Promise<CheckInResult> {
    // 1. GPS validation (fail fast)
    validateGps(input.checkInLat, input.checkInLng, input.checkInAccuracy);

    // 2. clientRef idempotency: if already exists, return without creating (created=false).
    //    This early return MUST precede Fix 8's date guard — offline sync replays may arrive
    //    with stale date values that would mismatch against today's server-derived date.
    const existing = await this.attendanceRepo.findByClientRef(input.clientRef);
    if (existing) {
      return { record: existing, created: false };
    }

    // 2b. Fix 8 — server-side date derivation (single point of truth).
    //     Colombia is UTC-5, no DST. Derive the authoritative Bogotá local date from
    //     checkInCapturedAt; validate the client-provided date matches it.
    //     Only fires for NEW records (not idempotent replays, which returned above).
    const checkInDate = new Date(input.checkInCapturedAt);
    const serverDate = toBogotaDate(checkInDate);
    if (input.date !== serverDate) {
      throw new AttendanceDateMismatchError(input.date, serverDate);
    }

    // 3. Operario ownership check via scoped repo (fail-closed: null = not in scope)
    const operario = await this.operarioRepo.findById(input.operarioId);
    if (!operario) {
      throw new OperarioNotInScopeError(input.operarioId);
    }

    // 3b. Inactive guard — check AFTER ownership (OP-33, REQ-09)
    // isActive === false → operario is deactivated → 409
    // isActive === null  → not found (already handled above by OperarioNotInScopeError)
    // isActive === true  → active, proceed normally
    const active = await this.operarioStatus.isActive(input.operarioId);
    if (active === false) {
      throw new InactiveOperarioError(input.operarioId);
    }

    // supervisorId and zoneId come EXCLUSIVELY from the verified JWT scope.
    // The RBAC guard (Roles(Role.SUPERVISOR)) ensures these are always present;
    // the guard below makes that invariant explicit to the type system.
    const ctx = this.scopeHolder.current();
    if (!ctx.supervisorId || !ctx.zoneId) {
      throw new Error('ScopeContext is missing supervisorId or zoneId — RBAC guard must run first.');
    }
    const supervisorId = ctx.supervisorId;
    const zoneId = ctx.zoneId;

    // 4. Create — catch P2002 for both idempotency race and duplicate (operarioId, date).
    //    Use serverDate (server-derived Bogotá local date) — NOT input.date — as the
    //    single point of truth (Fix 8). They are guaranteed equal here by the guard above,
    //    but using serverDate makes the intent explicit and survives future refactors.
    try {
      const record = await this.attendanceRepo.create({
        supervisorId,
        operarioId: input.operarioId,
        zoneId,
        date: serverDate,
        checkInCapturedAt: new Date(input.checkInCapturedAt),
        checkInReceivedAt: new Date(),
        checkInLat: input.checkInLat,
        checkInLng: input.checkInLng,
        checkInAccuracy: input.checkInAccuracy ?? null,
        // Audit label only — no authorization logic may depend on checkInVerification.
        checkInVerification: input.verification ?? null,
        clientRef: input.clientRef,
        checkInPhotoKey: null,
        completedAt: null,
      });

      // Fire-and-forget: late arrival detection (PR 3).
      // Must NOT await — the check-in response must not be delayed.
      // Must NOT throw — a failure here must never fail the check-in.
      if (this.lateArrivalPort) {
        this.dispatchLateArrivalCheck(record.id);
      }

      return { record, created: true };
    } catch (err) {
      if (isPrismaUniqueError(err)) {
        const target = getConstraintTarget(err);
        // Race on clientRef → idempotency: re-fetch and return existing (created=false)
        if (target.includes('clientRef') || target.join(',').includes('clientRef')) {
          const idempotent = await this.attendanceRepo.findByClientRef(input.clientRef);
          if (idempotent) return { record: idempotent, created: false };
        }
        // Duplicate (operarioId, date) — fetch the conflicting record to carry in the error
        const conflicting = await this.attendanceRepo.findByOperarioAndDate(
          input.operarioId,
          input.date,
        );
        throw new AttendanceAlreadyExistsError(
          input.operarioId,
          input.date,
          // conflicting is null only when the duplicate row is outside scope — an extreme edge
          // case. The error object still needs an Attendance reference; we cast a sentinel to
          // satisfy the type without using `any`.
          conflicting ?? ({ id: 'unknown', operarioId: input.operarioId, date: input.date } as Attendance),
        );
      }
      throw err;
    }
  }

  /**
   * Fire-and-forget late-arrival detection dispatch.
   *
   * NEVER throws — a failure in late-arrival detection must NEVER fail the check-in.
   * Both synchronous throws and asynchronous rejections are caught and logged.
   */
  private dispatchLateArrivalCheck(attendanceId: string): void {
    if (!this.lateArrivalPort) return;
    try {
      const result = this.lateArrivalPort.checkAndCreateLateArrivalNovedad(attendanceId);
      void Promise.resolve(result).catch((err: unknown) => {
        this.logLateArrivalFailure(attendanceId, err);
      });
    } catch (err) {
      this.logLateArrivalFailure(attendanceId, err);
    }
  }

  /**
   * Last-resort guard: even a throwing Logger must not break the check-in response.
   */
  private logLateArrivalFailure(attendanceId: string, err: unknown): void {
    try {
      // eslint-disable-next-line no-console
      console.error(
        `[CheckInAttendanceUseCase] LateArrivalNovedadPort failed for attendance ${attendanceId} (non-blocking)`,
        err,
      );
    } catch {
      // Swallow — check-in success is more important than logging this failure.
    }
  }
}
