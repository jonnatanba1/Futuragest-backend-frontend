/**
 * CreateNovedadUseCase — creates an overtime novelty record for an in-scope attendance.
 *
 * Overtime may be PRE-AUTHORIZED while the shift is still open: a supervisor who
 * sees an operario who won't finish on time can request the overtime before the
 * check-out is registered. The attendance therefore need only exist in scope —
 * it may be open (completedAt == null) or completed.
 *
 * Business rules (spec REQ-07, INV-02, INV-04, INV-10):
 * - horasExtra must be > 0 and <= 24 (validated FIRST, before any port call)
 * - Attendance must exist in scope → else 404 (AttendanceNotFoundError)
 * - Attendance may be open OR completed (the completed-only gate was lifted)
 * - supervisorId and zoneId are derived from ScopeContextHolder (NEVER from body)
 * - Catches Prisma P2002 → NovedadAlreadyExistsError (409) — enforced by partial unique index
 * - Creating a novedad NEVER mutates the Attendance row (INV-04)
 * - Does NOT include attendance/supervisor in novedad query (INV-10/W4)
 *
 * REQUEST-scoped: reads ScopeContextHolder per request (populated after AuthGuard runs).
 */

import { Logger } from '@nestjs/common';
import type { Novedad } from '@prisma/client';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { NotificationPort } from '../../notifications/domain/notification.port';
import {
  AttendanceNotFoundError,
  NovedadAlreadyExistsError,
  InvalidHorasExtraError,
} from '../domain/novedad.errors';

export interface CreateNovedadInput {
  attendanceId: string;
  horasExtra: string | number;
  motivo?: string;
  /** Optional client-generated idempotency token. Same token → returns existing record. */
  clientRef?: string;
}

export interface CreateNovedadResult {
  record: Novedad;
  /** true = newly created; false = idempotent replay (existing record returned). */
  created: boolean;
}

/**
 * Validate horasExtra: must be numeric, > 0, and <= 24.
 * Throws InvalidHorasExtraError on any violation.
 */
function validateHorasExtra(value: string | number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(parsed) || !isFinite(parsed)) {
    throw new InvalidHorasExtraError(value);
  }
  if (parsed <= 0) {
    throw new InvalidHorasExtraError(value);
  }
  if (parsed > 24) {
    throw new InvalidHorasExtraError(value);
  }
  return parsed;
}

export class CreateNovedadUseCase {
  private readonly logger = new Logger(CreateNovedadUseCase.name);

  constructor(
    private readonly novedadRepo: NovedadRepositoryPort,
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
    /** Optional: omitting preserves backward compat with existing unit tests. */
    private readonly notificationPort?: NotificationPort,
  ) {}

  async execute(input: CreateNovedadInput): Promise<CreateNovedadResult> {
    // 1. Validate horasExtra FIRST (before any port call — fail fast, SI-28)
    validateHorasExtra(input.horasExtra);

    // 2. clientRef idempotency pre-check (SI-06): if clientRef provided, look up before create
    if (input.clientRef) {
      const existing = await this.novedadRepo.findByClientRef(input.clientRef);
      if (existing) {
        return { record: existing, created: false };
      }
    }

    // 3. Find attendance in scope (SUPERVISOR sees only own via scopedRepo)
    // Null means not found or out of scope → 404 (fail-closed, don't reveal existence).
    // The attendance may be open (completedAt == null) — overtime is allowed to be
    // pre-authorized before check-out, so there is NO completed-state gate here.
    const attendance = await this.attendanceRepo.findById(input.attendanceId);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.attendanceId);
    }

    // 4. Derive supervisorId and zoneId from scope context (NEVER from body — INV-02).
    // The RBAC guard ensures only SUPERVISORs reach this point.
    const ctx = this.scopeHolder.current();
    if (!ctx.supervisorId || !ctx.zoneId) {
      throw new Error('ScopeContext is missing supervisorId or zoneId — RBAC guard must run first.');
    }

    // 5. Create the novedad — catch P2002 and branch on constraint target
    let record: Novedad;
    try {
      record = await this.novedadRepo.create({
        attendanceId: input.attendanceId,
        supervisorId: ctx.supervisorId,
        zoneId: ctx.zoneId,
        horasExtra: input.horasExtra,
        motivo: input.motivo ?? null,
        clientRef: input.clientRef ?? null,
      });
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        const target = (err as { meta?: { target?: string | string[] } }).meta?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');

        if (targetStr.includes('clientRef') && input.clientRef) {
          // Race condition on clientRef unique index — re-fetch and return existing (SI-29)
          const existing = await this.novedadRepo.findByClientRef(input.clientRef);
          if (existing) {
            return { record: existing, created: false };
          }
        }
        // P2002 on partial active-novedad index (or any other constraint) → 409 (SI-08)
        throw new NovedadAlreadyExistsError(input.attendanceId);
      }
      throw err;
    }

    // Fire-and-forget: notify eligible approvers. Runs OUTSIDE the try/catch above so
    // no failure in the dispatch path can be re-routed through the rethrowing catch and
    // surface as a 500 after the novedad is already persisted. Only the genuine-create
    // path reaches here — every replay path (clientRef pre-check, P2002 race) returns
    // early with created: false and never dispatches.
    this.dispatchNovedadCreatedNotification(record);

    return { record, created: true };
  }

  /**
   * Fire-and-forget notification dispatch. This method can NEVER throw:
   * - synchronous throws from the port (or a non-thenable return) are caught here;
   * - asynchronous rejections are caught via the chained .catch.
   * Both paths only log — the persisted novedad result is returned regardless.
   *
   * horasExtra is normalized to a fixed 2-decimal string (e.g. 3 → "3.00") for consistent
   * notification copy, matching the DB Decimal(.,2) precision.
   */
  private dispatchNovedadCreatedNotification(record: Novedad): void {
    if (!this.notificationPort) return;
    try {
      const result = this.notificationPort.notifyNovedadCreated({
        novedadId: record.id,
        tipoNovedad: 'HORAS_EXTRA',
        horasExtra: Number(record.horasExtra).toFixed(2),
        supervisorId: record.supervisorId,
        zoneId: record.zoneId,
      });
      // Promise.resolve guards against ports returning a non-thenable value.
      void Promise.resolve(result).catch((err: unknown) => {
        this.logDispatchFailure(record.id, err);
      });
    } catch (err) {
      this.logDispatchFailure(record.id, err);
    }
  }

  /**
   * Last-resort guard: even a throwing Logger must not be able to escape the
   * fire-and-forget dispatch path and break the response after the novedad persisted.
   */
  private logDispatchFailure(novedadId: string, err: unknown): void {
    try {
      this.logger.error(`notifyNovedadCreated failed for novedad ${novedadId} (non-blocking)`, err as Error);
    } catch {
      // Swallow — a logging failure is strictly less important than the 201 response.
    }
  }
}
