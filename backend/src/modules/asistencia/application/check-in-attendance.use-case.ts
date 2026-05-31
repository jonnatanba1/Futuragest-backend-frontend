/**
 * CheckInAttendanceUseCase — creates a new attendance record for check-in.
 *
 * AT-01: happy path — creates record with supervisorId/zoneId from JWT scope.
 * AT-02: supervisorId/zoneId in body are IGNORED — only scope holder is used.
 * AT-04: clientRef idempotency — duplicate clientRef → return existing record (HTTP 200).
 * AT-05: operario not in supervisor scope → OperarioNotInScopeError (404).
 * AT-07/AT-08: GPS validation → InvalidGpsError (400).
 * AT-03: same operario+date, different clientRef → AttendanceAlreadyExistsError (409).
 *
 * Sequence:
 * 1. Validate GPS ranges (fail fast before any DB access).
 * 2. If clientRef provided: findByClientRef → if found, return existing (idempotent).
 * 3. Verify operario belongs to this supervisor (scoped lookup → null = not in scope).
 * 4. Create; catch P2002:
 *    - target includes 'clientRef' → race-condition idempotency: re-fetch and return existing.
 *    - target includes 'operarioId'/'date' → DuplicateAttendanceError (409).
 */

import type { Attendance } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { OperarioStatusPort } from '../../iam/domain/ports/operario-status.port';
import {
  AttendanceAlreadyExistsError,
  InactiveOperarioError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';

export interface CheckInInput {
  operarioId: string;
  date: string;
  checkInCapturedAt: string; // ISO 8601 from client
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy?: number;
  clientRef: string;
}

// Minimal interface for the scoped operario repo (avoids importing the full class)
interface ScopedOperarioRepo {
  findById(id: string): Promise<{ id: string; supervisorId: string } | null>;
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

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

function getConstraintTarget(err: unknown): string[] {
  if (
    typeof err === 'object' &&
    err !== null &&
    'meta' in err &&
    typeof (err as any).meta === 'object' &&
    (err as any).meta !== null &&
    'target' in (err as any).meta
  ) {
    const target = (err as any).meta.target;
    return Array.isArray(target) ? target : [target];
  }
  return [];
}

export interface CheckInResult {
  record: Attendance;
  /** true when a new row was inserted; false on clientRef idempotent hit (both pre-create and race). */
  created: boolean;
}

export class CheckInAttendanceUseCase {
  constructor(
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly operarioRepo: ScopedOperarioRepo,
    private readonly scopeHolder: ScopeContextHolder,
    private readonly operarioStatus: OperarioStatusPort,
  ) {}

  async execute(input: CheckInInput): Promise<CheckInResult> {
    // 1. GPS validation (fail fast)
    validateGps(input.checkInLat, input.checkInLng, input.checkInAccuracy);

    // 2. clientRef idempotency: if already exists, return without creating (created=false)
    const existing = await this.attendanceRepo.findByClientRef(input.clientRef);
    if (existing) {
      return { record: existing, created: false };
    }

    // 3. Operario ownership check via scoped repo (fail-closed: null = not in scope)
    const operario = await this.operarioRepo.findById(input.operarioId);
    if (!operario) {
      throw new OperarioNotInScopeError(input.operarioId);
    }

    // 3b. Inactive guard — check AFTER ownership (OP-33, REQ-09)
    // isActive === false → operario is deactivated → 409
    // isActive === null  → not found (already handled above by OperarioNotInScopeError)
    // isActive === true  → active, proceed normally
    const active = await this.operarioStatus.isActive(input.operarioId);
    if (active === false) {
      throw new InactiveOperarioError(input.operarioId);
    }

    // supervisorId and zoneId come EXCLUSIVELY from the verified JWT scope
    const ctx = this.scopeHolder.current();
    const supervisorId = ctx.supervisorId!;
    const zoneId = ctx.zoneId!;

    // 4. Create — catch P2002 for both idempotency race and duplicate (operarioId, date)
    try {
      const record = await this.attendanceRepo.create({
        supervisorId,
        operarioId: input.operarioId,
        zoneId,
        date: input.date,
        checkInCapturedAt: new Date(input.checkInCapturedAt),
        checkInReceivedAt: new Date(),
        checkInLat: input.checkInLat,
        checkInLng: input.checkInLng,
        checkInAccuracy: input.checkInAccuracy ?? null,
        clientRef: input.clientRef,
        signatureKey: null,
        completedAt: null,
      });
      return { record, created: true };
    } catch (err) {
      if (isPrismaUniqueError(err)) {
        const target = getConstraintTarget(err);
        // Race on clientRef → idempotency: re-fetch and return existing (created=false)
        if (target.includes('clientRef') || target.join(',').includes('clientRef')) {
          const idempotent = await this.attendanceRepo.findByClientRef(input.clientRef);
          if (idempotent) return { record: idempotent, created: false };
        }
        // Duplicate (operarioId, date) — fetch the conflicting record to carry in the error
        const conflicting = await this.attendanceRepo.findByOperarioAndDate(
          input.operarioId,
          input.date,
        );
        throw new AttendanceAlreadyExistsError(
          input.operarioId,
          input.date,
          conflicting ?? ({ id: 'unknown', operarioId: input.operarioId, date: input.date } as any),
        );
      }
      throw err;
    }
  }
}
