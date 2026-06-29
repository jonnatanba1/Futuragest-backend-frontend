/**
 * CheckOutAttendanceUseCase — completes an attendance record.
 *
 * Pre-conditions checked in order (spec REQ-07):
 * 1. Record found in scope (scoped findById) → null = 404.
 * 2. If completedAt !== null (record already completed):
 *    a. checkOutClientRef provided AND matches stored → idempotent replay → {record, idempotent:true} (200, no write).
 *    b. Otherwise → ImmutableAttendanceError (structured 409).
 * 3. checkOutPhotoKey != null → else PhotoRequiredError (422).
 *    (The SALIDA/checkout photo must be uploaded before check-out.)
 * 4. GPS validation → InvalidGpsError (400).
 * 5. Update with all checkout fields + completedAt + checkOutClientRef.
 *
 * Return shape: CheckOutResult { record: Attendance; idempotent: boolean }
 * Controller always returns HTTP 200 for both paths.
 */

import type { Attendance, VerificationMethod } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { CompensationDriftMarkerPort } from '../domain/ports/compensation-drift-marker.port';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  InvalidShiftDurationError,
  PhotoRequiredError,
  InvalidGpsError,
} from '../domain/attendance.errors';

/**
 * Sanity bound for shift duration (Fix 6).
 * A shift longer than this is almost certainly a forgotten checkout or a device
 * clock skew event — not a real work shift. This is NOT a labor-law maximum.
 */
export const MAX_SHIFT_HOURS = 20;

export interface CheckOutInput {
  id: string;
  checkOutCapturedAt: string; // ISO 8601 from client
  checkOutLat: number;
  checkOutLng: number;
  checkOutAccuracy?: number;
  checkOutClientRef?: string;
  /**
   * Audit label: how the supervisor verified identity before check-out.
   * Comes from the client — AUDIT LABEL ONLY. No authorization logic may depend on this.
   */
  verification?: VerificationMethod;
}

export interface CheckOutResult {
  record: Attendance;
  /** true when returning an existing completed record (idempotent replay); false when newly completed. */
  idempotent: boolean;
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

export class CheckOutAttendanceUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    /**
     * Optional drift-marker port (Fix 5). When provided, a completed check-out
     * triggers a drift check against closed CompensationPeriods.
     * Failures are absorbed (try/catch) — drift marking must NEVER fail a check-out.
     */
    private readonly driftMarker?: CompensationDriftMarkerPort,
  ) {}

  async execute(input: CheckOutInput): Promise<CheckOutResult> {
    // 1. Scoped lookup — null means not found or out of scope → 404
    const attendance = await this.attendanceRepo.findById(input.id);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.id);
    }

    // 2. Immutability check — record already completed
    if (attendance.completedAt !== null) {
      // 2a. Idempotent replay: same checkOutClientRef → return existing record (no write)
      if (
        input.checkOutClientRef &&
        attendance.checkOutClientRef === input.checkOutClientRef
      ) {
        return { record: attendance, idempotent: true };
      }
      // 2b. Real double-checkout (different or absent ref) → structured 409
      throw new ImmutableAttendanceError(input.id, attendance);
    }

    // 3. Checkout photo required — the SALIDA photo must be uploaded before check-out
    if (!attendance.checkOutPhotoKey) {
      throw new PhotoRequiredError(input.id);
    }

    // 4. GPS validation
    validateGps(input.checkOutLat, input.checkOutLng, input.checkOutAccuracy);

    // 5. Duration sanity guard (Fix 6) — applies only to NEW completions (idempotent
    //    replays already returned above). Protects the fortnight balance from:
    //    a) clock-skew: checkout before checkin → huge negative delta
    //    b) forgotten checkout: shift > MAX_SHIFT_HOURS → implausible overtime credit
    const checkOutDate = new Date(input.checkOutCapturedAt);
    const durationMs = checkOutDate.getTime() - attendance.checkInCapturedAt.getTime();
    if (durationMs <= 0) {
      throw new InvalidShiftDurationError(
        `El check-out no puede ser anterior o igual al check-in del registro "${input.id}". ` +
          `Verifique el reloj del dispositivo.`,
      );
    }
    if (durationMs > MAX_SHIFT_HOURS * 3_600_000) {
      throw new InvalidShiftDurationError(
        `El turno del registro "${input.id}" supera el límite de ${MAX_SHIFT_HOURS} horas ` +
          `(posible checkout olvidado o desfase de reloj).`,
      );
    }

    // 7. Update — set all check-out fields + completedAt (immutability lock) + checkOutClientRef
    // Audit label only — no authorization logic may depend on checkOutVerification.
    const record = await this.attendanceRepo.update(input.id, {
      checkOutCapturedAt: new Date(input.checkOutCapturedAt),
      checkOutReceivedAt: new Date(),
      checkOutLat: input.checkOutLat,
      checkOutLng: input.checkOutLng,
      checkOutAccuracy: input.checkOutAccuracy ?? null,
      checkOutVerification: input.verification ?? null,
      completedAt: new Date(),
      checkOutClientRef: input.checkOutClientRef ?? null,
    });

    // 8. Fix 5 — drift detection: if this attendance date falls inside a closed
    //    CompensationPeriod, mark that period as diverged (snapshot ≠ live data).
    //    Failures are absorbed — drift marking must NEVER fail the check-out.
    if (this.driftMarker) {
      try {
        await this.driftMarker.markDivergedIfClosed(attendance.operarioId, attendance.date);
      } catch {
        // Log is handled by the adapter; swallow here to protect check-out flow.
      }
    }

    return { record, idempotent: false };
  }
}
