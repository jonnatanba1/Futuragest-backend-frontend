/**
 * RED → GREEN tests for Fix 5 — drift detection on check-out.
 *
 * When a check-out completes an attendance whose `date` falls inside a CLOSED
 * CompensationPeriod for that operario, the snapshot is now stale (diverged).
 * The check-out use-case must call the drift-marker port to set divergedAt.
 *
 * Covers:
 *   F5-1  — check-out with date inside closed period → markDivergedIfClosed called
 *   F5-2  — check-out with no closed period → markDivergedIfClosed still called (port decides noop)
 *   F5-3  — drift-marker throws → check-out still succeeds (error swallowed, logged)
 *   F5-4  — idempotent check-out replay → markDivergedIfClosed NOT called (no real checkout happened)
 */

import { CheckOutAttendanceUseCase } from './check-out-attendance.use-case';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { CompensationDriftMarkerPort } from '../domain/ports/compensation-drift-marker.port';
import type { Attendance } from '@prisma/client';

// Fixed check-in time so VALID_INPUT.checkOutCapturedAt (2026-05-01T17:00Z) is always
// after checkIn and within MAX_SHIFT_HOURS (Fix 6 guard compatibility).
const FIXED_CHECK_IN = new Date('2026-05-01T08:00:00Z');

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-05-01',
    checkInCapturedAt: FIXED_CHECK_IN,
    checkInReceivedAt: FIXED_CHECK_IN,
    checkInLat: 7.5,
    checkInLng: -76.5,
    checkInAccuracy: 10,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    checkInVerification: null,
    checkOutVerification: null,
    checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
    checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png',
    clientRef: 'REF-A',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const VALID_INPUT = {
  id: 'ATT-1',
  checkOutCapturedAt: '2026-05-01T17:00:00Z',
  checkOutLat: 7.5,
  checkOutLng: -76.5,
  checkOutAccuracy: 12,
};

describe('CheckOutAttendanceUseCase — drift detection (Fix 5)', () => {
  function makeRepo(att: Attendance | null): AttendanceRepositoryPort {
    return {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(att),
      findMany: jest.fn(),
      findByClientRef: jest.fn(),
      findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
      findByOperarioAndDate: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation((id, data) =>
        Promise.resolve({ ...(att as Attendance), ...data, completedAt: new Date() }),
      ),
    };
  }

  // ── F5-1: successful checkout → markDivergedIfClosed called ───────────────

  it('F5-1 — successful checkout → drift marker called with operarioId and date', async () => {
    const att = makeAttendance();
    const repo = makeRepo(att);
    const driftMarker: CompensationDriftMarkerPort = {
      markDivergedIfClosed: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CheckOutAttendanceUseCase(repo, driftMarker);
    await useCase.execute(VALID_INPUT);

    expect(driftMarker.markDivergedIfClosed).toHaveBeenCalledWith('O1', '2026-05-01');
  });

  // ── F5-2: drift marker noop (no closed period) ─────────────────────────────

  it('F5-2 — drift marker resolves normally even when no closed period exists', async () => {
    const att = makeAttendance();
    const repo = makeRepo(att);
    const driftMarker: CompensationDriftMarkerPort = {
      markDivergedIfClosed: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CheckOutAttendanceUseCase(repo, driftMarker);
    const result = await useCase.execute(VALID_INPUT);

    expect(result.idempotent).toBe(false);
    expect(driftMarker.markDivergedIfClosed).toHaveBeenCalledTimes(1);
  });

  // ── F5-3: drift marker throws → check-out still succeeds ──────────────────

  it('F5-3 — drift marker throws → check-out still succeeds (error absorbed)', async () => {
    const att = makeAttendance();
    const repo = makeRepo(att);
    const driftMarker: CompensationDriftMarkerPort = {
      markDivergedIfClosed: jest.fn().mockRejectedValue(new Error('DB connection error')),
    };

    const useCase = new CheckOutAttendanceUseCase(repo, driftMarker);

    // Must not throw despite drift marker failure
    const result = await useCase.execute(VALID_INPUT);
    expect(result.idempotent).toBe(false);
    expect(result.record).toBeDefined();
  });

  // ── F5-4: idempotent replay → drift marker NOT called ─────────────────────

  it('F5-4 — idempotent replay (same checkOutClientRef) → drift marker NOT called', async () => {
    const att = makeAttendance({
      completedAt: new Date(),
      checkOutClientRef: 'CREF-Z',
    });
    const repo = makeRepo(att);
    const driftMarker: CompensationDriftMarkerPort = {
      markDivergedIfClosed: jest.fn(),
    };

    const useCase = new CheckOutAttendanceUseCase(repo, driftMarker);
    const result = await useCase.execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-Z' });

    expect(result.idempotent).toBe(true);
    // No real checkout happened — drift marker must NOT be triggered
    expect(driftMarker.markDivergedIfClosed).not.toHaveBeenCalled();
  });
});
