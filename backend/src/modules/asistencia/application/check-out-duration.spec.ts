/**
 * Fix 6 — Duration sanity guards (RED → GREEN).
 *
 * Covers:
 *   F6-1  — checkOutCapturedAt before checkInCapturedAt → InvalidShiftDurationError
 *   F6-2  — checkOutCapturedAt equal to checkInCapturedAt → InvalidShiftDurationError
 *   F6-3  — shift exactly 21h → InvalidShiftDurationError (exceeds MAX_SHIFT_HOURS=20)
 *   F6-4  — shift exactly 19h → succeeds (below MAX_SHIFT_HOURS)
 *   F6-5  — idempotent replay of already-completed attendance → succeeds (no guard on replay)
 *   F6-6  — balance calc: negative-duration (poisoned) row → skipped; valid row same day counts
 *   F6-7  — balance calc: >20h legacy row → skipped
 */

import { CheckOutAttendanceUseCase, MAX_SHIFT_HOURS } from './check-out-attendance.use-case';
import { InvalidShiftDurationError } from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { CalculatePeriodBalanceUseCase } from '../../compensacion/application/calculate-period-balance.use-case';
import type { AttendanceReaderRecord } from '../../compensacion/domain/ports/attendance-reader.port';
import type { JornadaPolicyRecord } from '../../compensacion/domain/ports/jornada-policy-repository.port';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHECK_IN_TIME = new Date('2026-06-09T08:00:00Z');

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-06-09',
    checkInCapturedAt: CHECK_IN_TIME,
    checkInReceivedAt: CHECK_IN_TIME,
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
    createdAt: CHECK_IN_TIME,
    updatedAt: CHECK_IN_TIME,
    ...overrides,
  };
}

function makeRepo(att: Attendance | null): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(att),
    findMany: jest.fn(),
    findByClientRef: jest.fn(),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockImplementation((_id, data) =>
      Promise.resolve({ ...(att as Attendance), ...data, completedAt: new Date() }),
    ),
  };
}

function makeBalanceAttendance(
  date: string,
  checkInMs: number,
  checkOutMs: number,
  completed = true,
): AttendanceReaderRecord {
  const checkIn = new Date(checkInMs);
  const checkOut = new Date(checkOutMs);
  return {
    id: `att-${date}`,
    operarioId: 'O1',
    date,
    checkInCapturedAt: checkIn,
    checkOutCapturedAt: completed ? checkOut : null,
    completedAt: completed ? checkOut : null,
  };
}

function makePolicy(vigenteDesdeStr: string, horasDiarias: number): JornadaPolicyRecord {
  return {
    id: `pol-${vigenteDesdeStr}`,
    horasDiarias: new Decimal(horasDiarias),
    vigenteDesde: new Date(`${vigenteDesdeStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

// ─── Check-out duration guard tests ───────────────────────────────────────────

describe('CheckOutAttendanceUseCase — duration sanity guard (Fix 6)', () => {
  describe('MAX_SHIFT_HOURS constant', () => {
    it('is exported and equals 20', () => {
      expect(MAX_SHIFT_HOURS).toBe(20);
    });
  });

  describe('F6-1 — checkout before checkin → InvalidShiftDurationError', () => {
    it('throws when checkOutCapturedAt is 1ms before checkInCapturedAt', async () => {
      const att = makeAttendance();
      const repo = makeRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      // checkout 1ms BEFORE checkin
      const earlyCheckOut = new Date(CHECK_IN_TIME.getTime() - 1).toISOString();
      await expect(
        useCase.execute({ id: 'ATT-1', checkOutCapturedAt: earlyCheckOut, checkOutLat: 7.5, checkOutLng: -76.5 }),
      ).rejects.toThrow(InvalidShiftDurationError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('F6-2 — checkout equal to checkin → InvalidShiftDurationError', () => {
    it('throws when checkOutCapturedAt equals checkInCapturedAt (zero duration)', async () => {
      const att = makeAttendance();
      const repo = makeRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const sameTime = CHECK_IN_TIME.toISOString();
      await expect(
        useCase.execute({ id: 'ATT-1', checkOutCapturedAt: sameTime, checkOutLat: 7.5, checkOutLng: -76.5 }),
      ).rejects.toThrow(InvalidShiftDurationError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('F6-3 — shift exactly 21h → InvalidShiftDurationError', () => {
    it('throws when duration is exactly 21 hours (exceeds MAX_SHIFT_HOURS)', async () => {
      const att = makeAttendance();
      const repo = makeRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const checkOut21h = new Date(CHECK_IN_TIME.getTime() + 21 * 3600 * 1000).toISOString();
      await expect(
        useCase.execute({ id: 'ATT-1', checkOutCapturedAt: checkOut21h, checkOutLat: 7.5, checkOutLng: -76.5 }),
      ).rejects.toThrow(InvalidShiftDurationError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('F6-4 — shift exactly 19h → succeeds', () => {
    it('does NOT throw when duration is 19 hours (below MAX_SHIFT_HOURS)', async () => {
      const att = makeAttendance();
      const repo = makeRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const checkOut19h = new Date(CHECK_IN_TIME.getTime() + 19 * 3600 * 1000).toISOString();
      await expect(
        useCase.execute({ id: 'ATT-1', checkOutCapturedAt: checkOut19h, checkOutLat: 7.5, checkOutLng: -76.5 }),
      ).resolves.toBeDefined();
      expect(repo.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('F6-5 — idempotent replay of already-completed attendance → succeeds', () => {
    it('returns existing record without error even though no duration is revalidated', async () => {
      // The completed attendance has a checkOutCapturedAt = checkInCapturedAt (would be invalid)
      // but since it's an idempotent replay, the guard must NOT fire
      const att = makeAttendance({
        completedAt: new Date('2026-06-09T08:00:00Z'),
        checkOutClientRef: 'CREF-REPLAY',
        checkOutCapturedAt: CHECK_IN_TIME, // same as checkIn — would fail guard if applied
      });
      const repo = makeRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const result = await useCase.execute({
        id: 'ATT-1',
        checkOutCapturedAt: CHECK_IN_TIME.toISOString(),
        checkOutLat: 7.5,
        checkOutLng: -76.5,
        checkOutClientRef: 'CREF-REPLAY',
      });

      expect(result.idempotent).toBe(true);
      expect(result.record).toBe(att);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});

// ─── Balance calc defensive skip tests ────────────────────────────────────────

describe('CalculatePeriodBalanceUseCase — defensive skip for poisoned rows (Fix 6)', () => {
  let useCase: CalculatePeriodBalanceUseCase;

  beforeEach(() => {
    useCase = new CalculatePeriodBalanceUseCase();
  });

  const BASE_MS = new Date('2026-06-09T08:00:00Z').getTime();
  const HOUR_MS = 3_600_000;
  const policies = [makePolicy('2026-01-01', 8)];

  describe('F6-6 — negative-duration row is skipped; valid row same day counts', () => {
    it('skips the poisoned row and accumulates only the valid row', () => {
      // Poisoned: checkOut before checkIn (negative duration)
      const poisoned = makeBalanceAttendance(
        '2026-06-09',
        BASE_MS + 8 * HOUR_MS,  // checkIn at 16:00
        BASE_MS,                  // checkOut at 08:00 → negative
      );
      // Valid: normal 8.5h shift
      const valid = makeBalanceAttendance(
        '2026-06-10',
        BASE_MS,
        BASE_MS + 8.5 * HOUR_MS,
      );

      const result = useCase.execute({ attendances: [poisoned, valid], policyTimeline: policies });

      // poisoned row must be absent from perDay
      expect(result.perDay.map((d) => d.date)).not.toContain('2026-06-09');
      // valid row must be counted
      expect(result.perDay.map((d) => d.date)).toContain('2026-06-10');
      expect(result.creditos.toNumber()).toBeCloseTo(0.5, 2);
    });
  });

  describe('F6-7 — row with duration >20h is skipped', () => {
    it('skips a legacy row with 21h duration', () => {
      const tooLong = makeBalanceAttendance(
        '2026-06-11',
        BASE_MS,
        BASE_MS + 21 * HOUR_MS, // 21h — exceeds MAX_SHIFT_HOURS
      );

      const result = useCase.execute({ attendances: [tooLong], policyTimeline: policies });

      expect(result.perDay).toHaveLength(0);
      expect(result.creditos.toNumber()).toBe(0);
      expect(result.debitos.toNumber()).toBe(0);
    });
  });
});
