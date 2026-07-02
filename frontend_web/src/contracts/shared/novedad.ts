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

import type { VerificationMethod } from './asistencia';

export type NovedadStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type TipoNovedad = 'HORAS_EXTRA' | 'LLEGADA_TARDE';

export interface NovedadDto {
  id: string;
  attendanceId: string;
  supervisorId: string;
  zoneId: string;
  tipoNovedad: TipoNovedad;
  /** Overtime hours. Prisma Decimal serialized as string — parse as decimal in Flutter, NOT double. */
  horasExtra: string;
  /** Minutes late. Only present when tipoNovedad = LLEGADA_TARDE. */
  minutosTarde: number | null;
  motivo: string | null;
  status: NovedadStatus;
  /** Optional idempotency token for offline sync. Null when not provided at creation. */
  clientRef: string | null;
  approvedByUserId: string | null;
  /** ISO 8601 timestamp when approved/rejected. Null while PENDING. */
  decidedAt: string | null;
  /**
   * Audit label: how the líder operativo verified identity when approving/rejecting.
   * Null = web admin decision (no biometrics) or legacy row.
   * Audit trail only — no authorization gate depends on this value.
   */
  decisionVerification: VerificationMethod | null;
  /**
   * Optional reason provided by the líder when REJECTING the novedad.
   * Captured from a dialog in the Flutter app or web modal. Null when APPROVED or PENDING.
   */
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Enriched: operario full name (resolved from attendanceId at query time). */
  operarioName?: string;
  /** Enriched: operario documento (resolved from attendanceId at query time). */
  operarioDocumento?: string;
  /** Enriched: supervisor email (resolved from supervisorId at query time). */
  supervisorEmail?: string;
  /** Enriched: zone name (resolved from zoneId at query time). */
  zoneName?: string;
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
  /**
   * Optional audit label. How the líder operativo verified identity before deciding.
   * Audit trail only — no authorization gate depends on this value.
   * Absent = web admin (no biometrics).
   */
  verification?: VerificationMethod;
  /**
   * Optional reason provided by the líder when REJECTING the novedad.
   * Free-text, captured from a dialog in the Flutter app or web modal.
   */
  reason?: string;
}
