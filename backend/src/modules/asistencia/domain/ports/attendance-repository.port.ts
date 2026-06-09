/**
 * AttendanceRepositoryPort — domain port for persistence operations.
 *
 * All read operations are scope-enforced (SUPERVISOR sees own, COORDINADOR
 * sees zone, GLOBAL_ROLES see all). The implementation (ScopedAttendanceRepository)
 * delegates reads through ScopedRepository.findManyScoped / findFirstScoped.
 *
 * Writes live inside the same sanctioned file to satisfy the meta-guard.
 */

import type { Attendance } from '@prisma/client';

export const ATTENDANCE_REPOSITORY_PORT = Symbol('AttendanceRepositoryPort');

export interface CreateAttendanceData {
  supervisorId: string;
  operarioId: string;
  zoneId: string;
  date: string;
  checkInCapturedAt: Date;
  checkInReceivedAt: Date;
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy?: number | null;
  clientRef: string;
  signatureKey?: string | null;
  completedAt?: Date | null;
}

export interface UpdateAttendanceData {
  checkOutCapturedAt?: Date | null;
  checkOutReceivedAt?: Date | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutAccuracy?: number | null;
  completedAt?: Date | null;
  signatureKey?: string | null;
  checkOutSignatureKey?: string | null;
  checkOutClientRef?: string | null;
}

export interface AttendanceRepositoryPort {
  /** Create a new attendance record (check-in). May throw Prisma P2002. */
  create(data: CreateAttendanceData): Promise<Attendance>;

  /** Scoped find by id — returns null if not found or out of scope. */
  findById(id: string): Promise<Attendance | null>;

  /**
   * Scoped list — returns records visible to the current principal.
   * Pass `since` to return only records with updatedAt >= since (delta mode).
   */
  findMany(since?: Date): Promise<Attendance[]>;

  /**
   * Scoped find by clientRef — used for idempotency.
   * Returns null if not found or out of scope.
   */
  findByClientRef(clientRef: string): Promise<Attendance | null>;

  /**
   * Scoped find by checkOutClientRef — used for checkout idempotency lookup.
   * Returns null if not found or out of scope.
   * Note: checkOutClientRef is NOT globally unique; this returns the first
   * match within scope (per-row comparison semantics apply at the use-case level).
   */
  findByCheckOutClientRef(ref: string): Promise<Attendance | null>;

  /**
   * Scoped find by operarioId + date — used to locate the conflicting record
   * when a duplicate operario+date P2002 is caught at check-in.
   * Returns null if not found or out of scope.
   */
  findByOperarioAndDate(operarioId: string, date: string): Promise<Attendance | null>;

  /** Partial update (check-out fields, signatureKey). */
  update(id: string, data: UpdateAttendanceData): Promise<Attendance>;
}
