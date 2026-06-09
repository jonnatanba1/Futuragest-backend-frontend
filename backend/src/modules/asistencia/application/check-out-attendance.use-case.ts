/**
 * CheckOutAttendanceUseCase — completes an attendance record.
 *
 * Pre-conditions checked in order (spec REQ-07):
 * 1. Record found in scope (scoped findById) → null = 404.
 * 2. If completedAt !== null (record already completed):
 *    a. checkOutClientRef provided AND matches stored → idempotent replay → {record, idempotent:true} (200, no write).
 *    b. Otherwise → ImmutableAttendanceError (structured 409).
 * 3. checkOutSignatureKey != null → else SignatureRequiredError (422).
 *    (The SALIDA/checkout signature must be uploaded before check-out.)
 * 4. GPS validation → InvalidGpsError (400).
 * 5. Update with all checkout fields + completedAt + checkOutClientRef.
 *
 * Return shape: CheckOutResult { record: Attendance; idempotent: boolean }
 * Controller always returns HTTP 200 for both paths.
 */

import type { Attendance } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  SignatureRequiredError,
  InvalidGpsError,
} from '../domain/attendance.errors';

export interface CheckOutInput {
  id: string;
  checkOutCapturedAt: string; // ISO 8601 from client
  checkOutLat: number;
  checkOutLng: number;
  checkOutAccuracy?: number;
  checkOutClientRef?: string;
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
  constructor(private readonly attendanceRepo: AttendanceRepositoryPort) {}

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

    // 3. Checkout signature required — the SALIDA signature must be uploaded before check-out
    if (!attendance.checkOutSignatureKey) {
      throw new SignatureRequiredError(input.id);
    }

    // 4. GPS validation
    validateGps(input.checkOutLat, input.checkOutLng, input.checkOutAccuracy);

    // 5. Update — set all check-out fields + completedAt (immutability lock) + checkOutClientRef
    const record = await this.attendanceRepo.update(input.id, {
      checkOutCapturedAt: new Date(input.checkOutCapturedAt),
      checkOutReceivedAt: new Date(),
      checkOutLat: input.checkOutLat,
      checkOutLng: input.checkOutLng,
      checkOutAccuracy: input.checkOutAccuracy ?? null,
      completedAt: new Date(),
      checkOutClientRef: input.checkOutClientRef ?? null,
    });

    return { record, idempotent: false };
  }
}
