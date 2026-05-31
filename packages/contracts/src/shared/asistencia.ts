/**
 * Attendance contracts — shared types between backend and frontend.
 *
 * Plain TypeScript interfaces; no decorators. Backend class-validator DTOs
 * in the controller mirror these field-for-field.
 *
 * INV-03: no biometric fields.
 * supervisorId/zoneId are NOT in CheckInDto/CheckOutDto — sourced from JWT scope.
 */

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
  signatureKey: string | null;
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
}

/** Body for POST /asistencia/:id/check-out */
export interface CheckOutDto {
  checkOutCapturedAt: string; // ISO 8601
  checkOutLat: number;
  checkOutLng: number;
  checkOutAccuracy?: number;
  /** Optional idempotency token for offline sync — same token returns existing record (200) */
  checkOutClientRef?: string;
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

/** Response for POST /asistencia/:id/signature */
export interface SignatureUploadResponseDto {
  attendanceId: string;
  signatureKey: string;
}

/** Response for GET /asistencia/:id/signature */
export interface SignatureUrlResponseDto {
  url: string;
}
