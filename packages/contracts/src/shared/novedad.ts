/**
 * Novedad contracts — shared between backend and Flutter client.
 *
 * IMPORTANT: horasExtra is typed as string everywhere.
 * Prisma Decimal serializes to JSON as a string (e.g. "2.50").
 * Flutter MUST parse horasExtra with the decimal package, NOT as double.
 *
 * supervisorId, zoneId, approvedByUserId, and decidedAt are ALWAYS
 * server-derived — they must NOT appear in create/approve/reject request bodies.
 */

export type NovedadStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface NovedadDto {
  id: string;
  attendanceId: string;
  supervisorId: string;
  zoneId: string;
  /** Overtime hours. Prisma Decimal serialized as string — parse as decimal in Flutter, NOT double. */
  horasExtra: string;
  motivo: string | null;
  status: NovedadStatus;
  /** Optional idempotency token for offline sync. Null when not provided at creation. */
  clientRef: string | null;
  approvedByUserId: string | null;
  /** ISO 8601 timestamp when approved/rejected. Null while PENDING. */
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNovedadDto {
  /** Client sends as string e.g. "2.50". Must be > 0 and <= 24. */
  horasExtra: string;
  motivo?: string;
  /** Optional client-generated idempotency token (UUID v4). Same token returns existing record (200). */
  clientRef?: string;
  // supervisorId / zoneId / approvedByUserId MUST NOT appear here — server-derived only
}

export interface ApproveRejectNovedadDto {
  // empty body — all fields server-derived (approvedByUserId and decidedAt from JWT + server clock)
}
