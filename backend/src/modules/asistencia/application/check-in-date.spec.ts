/**
 * Fix 8 — Server-side date derivation in CheckInAttendanceUseCase (RED → GREEN).
 *
 * Covers:
 *   F8-1  — check-in with date that mismatches capturedAt → AttendanceDateMismatchError
 *   F8-2  — check-in with consistent date+capturedAt → persists the server-derived date
 *   F8-3  — check-in near Bogotá midnight (04:30Z = 23:30 local prev day) with client date
 *            = previous day → succeeds and stores previous day
 *   F8-4  — idempotent replay (existing clientRef) → no date validation, returns existing record
 */

import { CheckInAttendanceUseCase } from './check-in-attendance.use-case';
import { AttendanceDateMismatchError } from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { OperarioStatusPort } from '../../iam/domain/ports/operario-status.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { Attendance } from '@prisma/client';

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-06-09',
    checkInCapturedAt: new Date('2026-06-09T13:00:00Z'),
    checkInReceivedAt: new Date('2026-06-09T13:00:01Z'),
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
    checkInPhotoKey: null,
    checkOutPhotoKey: null,
    clientRef: 'REF-A',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockRepo(overrides: Partial<AttendanceRepositoryPort> = {}): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    ...overrides,
  };
}

function makeMockOperarioRepo(): { findById: jest.Mock } {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'O1', supervisorId: 'S1' }),
  };
}

function makeMockStatusPort(isActive: boolean | null = true): jest.Mocked<OperarioStatusPort> {
  return { isActive: jest.fn().mockResolvedValue(isActive) };
}

function makeMockHolder(
  ctx: { supervisorId: string; zoneId: string; role: string } = {
    supervisorId: 'S1',
    zoneId: 'Z1',
    role: 'SUPERVISOR',
  },
): Pick<ScopeContextHolder, 'current'> {
  return { current: jest.fn().mockReturnValue(ctx) };
}

function makeUseCase(repoOverrides: Partial<AttendanceRepositoryPort> = {}) {
  const repo = makeMockRepo(repoOverrides);
  const operarioRepo = makeMockOperarioRepo();
  const holder = makeMockHolder();
  const statusPort = makeMockStatusPort(true);
  const useCase = new CheckInAttendanceUseCase(
    repo,
    operarioRepo,
    holder as ScopeContextHolder,
    statusPort,
  );
  return { useCase, repo, operarioRepo, holder, statusPort };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CheckInAttendanceUseCase — server-side date derivation (Fix 8)', () => {

  describe('F8-1 — mismatched date vs capturedAt → AttendanceDateMismatchError', () => {
    it('throws when client sends date=2026-06-09 but capturedAt=2026-06-10T13:00Z (Bogotá = 2026-06-10)', async () => {
      const { useCase } = makeUseCase();

      await expect(
        useCase.execute({
          operarioId: 'O1',
          date: '2026-06-09',
          checkInCapturedAt: '2026-06-10T13:00:00Z', // Bogotá = 2026-06-10
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef: 'REF-MISMATCH',
        }),
      ).rejects.toThrow(AttendanceDateMismatchError);
    });

    it('throws when client sends date=2026-06-10 but capturedAt is on 2026-06-09 (bogota)', async () => {
      const { useCase } = makeUseCase();

      await expect(
        useCase.execute({
          operarioId: 'O1',
          date: '2026-06-10', // wrong: capturedAt is 13:00Z = 08:00 Bogotá = still 2026-06-09
          checkInCapturedAt: '2026-06-09T13:00:00Z',
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef: 'REF-MISMATCH2',
        }),
      ).rejects.toThrow(AttendanceDateMismatchError);
    });
  });

  describe('F8-2 — consistent date+capturedAt → persists the server-derived date', () => {
    it('creates record when date and capturedAt agree on Bogotá local day', async () => {
      const att = makeAttendance({ date: '2026-06-09' });
      const { useCase, repo } = makeUseCase({ create: jest.fn().mockResolvedValue(att) });

      const result = await useCase.execute({
        operarioId: 'O1',
        date: '2026-06-09',
        checkInCapturedAt: '2026-06-09T13:00:00Z', // Bogotá = 2026-06-09T08:00
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: 'REF-A',
      });

      expect(result.created).toBe(true);
      expect(repo.create).toHaveBeenCalledTimes(1);
      const createArg = (repo.create as jest.Mock).mock.calls[0][0];
      // The server-derived date (not raw client date) is what gets persisted
      expect(createArg.date).toBe('2026-06-09');
    });
  });

  describe('F8-3 — near Bogotá midnight: capturedAt=04:30Z = 23:30 local prev day', () => {
    it('succeeds and stores previous day when client date matches server-derived date', async () => {
      // 2026-06-02T04:30Z = 2026-06-01T23:30 Bogotá → server-derived date = "2026-06-01"
      const att = makeAttendance({ date: '2026-06-01' });
      const { useCase, repo } = makeUseCase({ create: jest.fn().mockResolvedValue(att) });

      const result = await useCase.execute({
        operarioId: 'O1',
        date: '2026-06-01', // client sends correct previous-day date
        checkInCapturedAt: '2026-06-02T04:30:00Z', // Bogotá = 2026-06-01T23:30
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: 'REF-MIDNIGHT',
      });

      expect(result.created).toBe(true);
      const createArg = (repo.create as jest.Mock).mock.calls[0][0];
      // Server-derived date = "2026-06-01"
      expect(createArg.date).toBe('2026-06-01');
    });

    it('throws AttendanceDateMismatchError when client sends wrong date near midnight', async () => {
      const { useCase } = makeUseCase();

      // capturedAt = 04:30Z = Bogotá 23:30 prev day → server derives "2026-06-01"
      // client mistakenly sends "2026-06-02" (current UTC date, not Bogotá date)
      await expect(
        useCase.execute({
          operarioId: 'O1',
          date: '2026-06-02', // wrong
          checkInCapturedAt: '2026-06-02T04:30:00Z',
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef: 'REF-MIDNIGHT-WRONG',
        }),
      ).rejects.toThrow(AttendanceDateMismatchError);
    });
  });

  describe('F8-4 — idempotent replay via clientRef → no date mismatch guard', () => {
    it('returns existing record immediately without running date validation', async () => {
      const existingAtt = makeAttendance({ clientRef: 'REF-IDEMPOTENT', date: '2026-01-01' });
      const repo = makeMockRepo({ findByClientRef: jest.fn().mockResolvedValue(existingAtt) });
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);
      const useCase = new CheckInAttendanceUseCase(
        repo, operarioRepo, holder as ScopeContextHolder, statusPort,
      );

      // date = '2026-06-09' but capturedAt is for '2026-01-01' — would mismatch
      // BUT clientRef already exists → idempotent path returns immediately
      const result = await useCase.execute({
        operarioId: 'O1',
        date: '2099-01-01', // wildly different date
        checkInCapturedAt: '2026-06-09T13:00:00Z',
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: 'REF-IDEMPOTENT',
      });

      expect(result.record).toBe(existingAtt);
      expect(result.created).toBe(false);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
