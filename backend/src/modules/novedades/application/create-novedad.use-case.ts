/**
 * CreateNovedadUseCase — creates an overtime novelty record for a completed attendance.
 *
 * Business rules (spec REQ-07, INV-02, INV-04, INV-10):
 * - horasExtra must be > 0 and <= 24 (validated FIRST, before any port call)
 * - Attendance must exist in scope → else 404 (AttendanceNotFoundError)
 * - Attendance must be completed (completedAt != null) → else 409 (AttendanceNotCompletedError)
 * - supervisorId and zoneId are derived from ScopeContextHolder (NEVER from body)
 * - Catches Prisma P2002 → NovedadAlreadyExistsError (409) — enforced by partial unique index
 * - Creating a novedad NEVER mutates the Attendance row (INV-04)
 * - Does NOT include attendance/supervisor in novedad query (INV-10/W4)
 *
 * REQUEST-scoped: reads ScopeContextHolder per request (populated after AuthGuard runs).
 */

import type { Novedad } from '@prisma/client';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import {
  AttendanceNotFoundError,
  AttendanceNotCompletedError,
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
  constructor(
    private readonly novedadRepo: NovedadRepositoryPort,
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
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
    // Null means not found or out of scope → 404 (fail-closed, don't reveal existence)
    const attendance = await this.attendanceRepo.findById(input.attendanceId);
    if (!attendance) {
      throw new AttendanceNotFoundError(input.attendanceId);
    }

    // 4. Assert attendance is completed (completedAt != null)
    if (!attendance.completedAt) {
      throw new AttendanceNotCompletedError(input.attendanceId);
    }

    // 5. Derive supervisorId and zoneId from scope context (NEVER from body — INV-02)
    const ctx = this.scopeHolder.current();

    // 6. Create the novedad — catch P2002 and branch on constraint target
    try {
      const record = await this.novedadRepo.create({
        attendanceId: input.attendanceId,
        supervisorId: ctx.supervisorId!,
        zoneId: ctx.zoneId!,
        horasExtra: input.horasExtra,
        motivo: input.motivo ?? null,
        clientRef: input.clientRef ?? null,
      });
      return { record, created: true };
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
  }
}
