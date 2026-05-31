/**
 * ScopedAttendanceRepository — the ONLY sanctioned Prisma access point for
 * the Attendance model (reads AND writes).
 *
 * Design constraint R-A: all Attendance Prisma calls live here so the
 * scope-meta-guard raw-call scan finds zero violations in non-sanctioned files.
 * This file matches the `scoped-[a-z-]+\.repository` regex and is therefore
 * exempt from the meta-guard scan.
 *
 * Read path: inherits findManyScoped / findFirstScoped from ScopedRepository
 *   — these automatically apply applyScopeFilter(ctx, 'Attendance').
 *
 * Write path: uses this.delegate (prisma.attendance) directly inside this
 *   sanctioned file — safe because writes are authz-gated at the controller
 *   level (SUPERVISOR-only) and the record already carries supervisorId from JWT.
 *
 * W4 constraint: do NOT pass include:{supervisor}/{operario} — those are scoped
 *   relations. Return raw scalar rows only.
 *
 * Implements AttendanceRepositoryPort (domain port).
 */

import { Injectable } from '@nestjs/common';
import type { Attendance } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';
import type {
  AttendanceRepositoryPort,
  CreateAttendanceData,
  UpdateAttendanceData,
} from '../../asistencia/domain/ports/attendance-repository.port';

@Injectable()
export class ScopedAttendanceRepository
  extends ScopedRepository<PrismaService['attendance'], Attendance>
  implements AttendanceRepositoryPort
{
  protected readonly model = 'Attendance';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.attendance, scopeHolder);
  }

  // ── Scoped reads (enforced by base class) ───────────────────────────────────

  /**
   * List attendance records visible to the current principal.
   * W4: no include — returns scalar rows only.
   */
  findMany(): Promise<Attendance[]> {
    return this.findManyScoped({ where: {} });
  }

  /**
   * Find a single attendance record by id — returns null if not found OR out of scope.
   * Controller should return 404 on null.
   */
  findById(id: string): Promise<Attendance | null> {
    return this.findFirstScoped({ where: { id } });
  }

  /**
   * Find an attendance record by clientRef (idempotency lookup).
   * Scope-enforced: SUPERVISOR sees only their own, etc.
   */
  findByClientRef(clientRef: string): Promise<Attendance | null> {
    return this.findFirstScoped({ where: { clientRef } });
  }

  /**
   * Find an attendance record by checkOutClientRef (checkout idempotency lookup).
   * Scope-enforced. Note: checkOutClientRef is NOT globally unique; this returns
   * the first in-scope match. Per-row comparison happens at the use-case level.
   */
  findByCheckOutClientRef(ref: string): Promise<Attendance | null> {
    return this.findFirstScoped({ where: { checkOutClientRef: ref } });
  }

  /**
   * Find an attendance record by operarioId + date within scope.
   * Used to locate the conflicting record on duplicate (operarioId, date) P2002.
   */
  findByOperarioAndDate(operarioId: string, date: string): Promise<Attendance | null> {
    return this.findFirstScoped({ where: { operarioId, date } });
  }

  // ── Writes (inside sanctioned file — safe from meta-guard scan) ─────────────

  /**
   * Create a new attendance record (check-in).
   * Callers must catch Prisma P2002 and handle:
   *   - constraint 'Attendance_clientRef_key'  → clientRef idempotency (lookup + return existing)
   *   - constraint 'Attendance_operarioId_date_key' → DuplicateAttendanceError (409)
   */
  async create(data: CreateAttendanceData): Promise<Attendance> {
    return this.delegate.create({ data });
  }

  /**
   * Partial update of an attendance record (check-out, signatureKey).
   * Returns the updated record.
   */
  async update(id: string, data: UpdateAttendanceData): Promise<Attendance> {
    return this.delegate.update({ where: { id }, data });
  }
}
