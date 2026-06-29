/**
 * Attendance contracts — shared types between backend and frontend.
 *
 * Plain TypeScript interfaces; no decorators. Backend class-validator DTOs
 * in the controller mirror these field-for-field.
 *
 * INV-03 (updated): no raw biometric data is stored — only the verification
 * method label (BIOMETRIC | DEVICE_CREDENTIAL | NONE). The label is an audit
 * trail only; no authorization logic may depend on it.
 * supervisorId/zoneId are NOT in CheckInDto/CheckOutDto — sourced from JWT scope.
 */

/**
 * How the actor verified their identity before performing a sensitive action.
 * BIOMETRIC         = fingerprint or face verification succeeded.
 * DEVICE_CREDENTIAL = PIN/pattern/password (no biometric).
 * NONE              = device could not verify / bypass (hardware unsupported or skipped).
 * Null              = legacy row or old app version (field was absent).
 */
export type VerificationMethod = 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE';

export interface AttendanceDto {
  id: string;
  supervisorId: string;
  operarioId: string;
  zoneId: string;
  /** YYYY-MM-DD, client-computed Colombia local date */
  date: string;
  checkInCapturedAt: string; // ISO 8601
  checkInReceivedAt: string; // ISO 8601 (server clock)
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy: number | null;
  checkOutCapturedAt: string | null;
  checkOutReceivedAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  checkInPhotoKey: string | null;
  checkOutPhotoKey: string | null;
  /** Audit label: verification method used by supervisor at check-in. Null = legacy / old app. */
  checkInVerification: VerificationMethod | null;
  /** Audit label: verification method used by supervisor at check-out. Null = legacy / old app. */
  checkOutVerification: VerificationMethod | null;
  clientRef: string;
  checkOutClientRef: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /asistencia/check-in */
export interface CheckInDto {
  operarioId: string;
  date: string; // YYYY-MM-DD
  checkInCapturedAt: string; // ISO 8601
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy?: number;
  /** Required idempotency token — duplicate clientRef returns existing record (200) */
  clientRef: string;
  /**
   * Optional audit label. How the supervisor verified identity before check-in.
   * Audit trail only — no authorization gate depends on this value.
   */
  verification?: VerificationMethod;
}

/** Body for POST /asistencia/:id/check-out */
export interface CheckOutDto {
  checkOutCapturedAt: string; // ISO 8601
  checkOutLat: number;
  checkOutLng: number;
  checkOutAccuracy?: number;
  /** Optional idempotency token for offline sync — same token returns existing record (200) */
  checkOutClientRef?: string;
  /**
   * Optional audit label. How the supervisor verified identity before check-out.
   * Audit trail only — no authorization gate depends on this value.
   */
  verification?: VerificationMethod;
}

// ─── Conflict response types ──────────────────────────────────────────────────

export type AttendanceConflictType =
  | 'DUPLICATE_ATTENDANCE_DATE'
  | 'DOUBLE_CHECKOUT';

export type NovedadConflictType = 'ACTIVE_NOVEDAD_EXISTS';

export interface ConflictingAttendanceRecord {
  id: string;
  clientRef: string | null;
  checkOutClientRef: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** ISO 8601 timestamp when checked out, or null */
  completedAt: string | null;
  operarioId: string;
  supervisorId: string;
}

export interface ConflictResponseDto {
  error: 'CONFLICT';
  conflictType: AttendanceConflictType | NovedadConflictType;
  message: string;
  conflicting: ConflictingAttendanceRecord;
}

/** Response for POST /asistencia/:id/photo */
export interface PhotoUploadResponseDto {
  attendanceId: string;
  photoKey: string;
}

/** Response for GET /asistencia/:id/photo */
export interface PhotoUrlResponseDto {
  url: string;
}
