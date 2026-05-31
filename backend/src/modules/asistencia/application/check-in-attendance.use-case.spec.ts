/**
 * T-15 RED → T-16 GREEN: CheckInAttendanceUseCase unit spec.
 * Covers AT-01 (happy path), AT-02 (body isolation), AT-04 (clientRef idempotency),
 * AT-05 (operario not in scope → 404), AT-07/AT-08 (GPS validation).
 * PR-3: OP-51 (inactive operario → InactiveOperarioError), OP-52 (active → proceeds normally).
 *
 * WARNING-3 fix: execute() now returns { record, created } so the controller
 * can distinguish 201 (new row) from 200 (idempotent hit).
 */

import { CheckInAttendanceUseCase } from './check-in-attendance.use-case';
import {
  AttendanceAlreadyExistsError,
  InactiveOperarioError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';

// ── Mock factory helpers ─────────────────────────────────────────────────────

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-05-31',
    checkInCapturedAt: new Date('2026-05-31T08:00:00Z'),
    checkInReceivedAt: new Date('2026-05-31T08:00:01Z'),
    checkInLat: 7.5,
    checkInLng: -76.5,
    checkInAccuracy: 10,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    signatureKey: null,
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

function makeMockOperarioRepo() {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'O1', supervisorId: 'S1' }),
  };
}

function makeMockStatusPort(isActive: boolean | null = true) {
  return { isActive: jest.fn().mockResolvedValue(isActive) };
}

function makeMockHolder(
  ctx: { supervisorId: string; zoneId: string; role: string } = {
    supervisorId: 'S1',
    zoneId: 'Z1',
    role: 'SUPERVISOR',
  },
) {
  return { current: jest.fn().mockReturnValue(ctx) };
}

const VALID_INPUT = {
  operarioId: 'O1',
  date: '2026-05-31',
  checkInCapturedAt: '2026-05-31T08:00:00Z',
  checkInLat: 7.5,
  checkInLng: -76.5,
  checkInAccuracy: 10,
  clientRef: 'REF-A',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CheckInAttendanceUseCase', () => {
  describe('AT-01 — happy path: creates attendance record', () => {
    it('calls repo.create with supervisorId/zoneId from scope holder (not body); returns created=true', async () => {
      const attendance = makeAttendance();
      const repo = makeMockRepo({ create: jest.fn().mockResolvedValue(attendance) });
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true); // active

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);
      const result = await useCase.execute(VALID_INPUT);

      expect(result.record).toBe(attendance);
      expect(result.created).toBe(true);
      expect(repo.create).toHaveBeenCalledTimes(1);
      const createCall = (repo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.supervisorId).toBe('S1');
      expect(createCall.zoneId).toBe('Z1');
      expect(createCall.operarioId).toBe('O1');
      // Server-generated timestamp (not from input)
      expect(createCall.checkInReceivedAt).toBeInstanceOf(Date);
    });
  });

  describe('AT-04 — clientRef idempotency: returns existing record without creating', () => {
    it('returns created=false when clientRef already exists (pre-create path)', async () => {
      const existing = makeAttendance({ clientRef: 'REF-A' });
      const repo = makeMockRepo({
        findByClientRef: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      });
      const holder = makeMockHolder();
      const operarioRepo = makeMockOperarioRepo();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);
      const result = await useCase.execute(VALID_INPUT);

      expect(result.record).toBe(existing);
      expect(result.created).toBe(false);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('returns created=false on P2002 clientRef race (post-create idempotency fallback)', async () => {
      const existing = makeAttendance({ clientRef: 'REF-A' });
      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['clientRef'] },
      });
      const repo = makeMockRepo({
        findByClientRef: jest.fn()
          .mockResolvedValueOnce(null)       // first check: not found
          .mockResolvedValueOnce(existing),  // after race: found
        create: jest.fn().mockRejectedValue(p2002),
      });
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);
      const result = await useCase.execute(VALID_INPUT);

      expect(result.record).toBe(existing);
      expect(result.created).toBe(false);
    });
  });

  describe('AT-03 — duplicate operario+date with different clientRef → 409', () => {
    it('throws AttendanceAlreadyExistsError on P2002 unique violation for operarioId+date', async () => {
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['operarioId', 'date'] },
      });
      const repo = makeMockRepo({
        findByClientRef: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(p2002Error),
      });
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      await expect(useCase.execute({ ...VALID_INPUT, clientRef: 'REF-B' })).rejects.toThrow(
        AttendanceAlreadyExistsError,
      );
      expect(repo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('AT-07 — GPS lat out of range → InvalidGpsError', () => {
    it('throws InvalidGpsError for lat > 90 without calling repo.create', async () => {
      const repo = makeMockRepo();
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkInLat: 999 }),
      ).rejects.toThrow(InvalidGpsError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('AT-08 — GPS lng out of range → InvalidGpsError', () => {
    it('throws InvalidGpsError for lng > 180', async () => {
      const repo = makeMockRepo();
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkInLng: 200 }),
      ).rejects.toThrow(InvalidGpsError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('AT-05 — operario not in supervisor scope → 404', () => {
    it('throws OperarioNotInScopeError when operario belongs to a different supervisor', async () => {
      const repo = makeMockRepo();
      // findById returns operario with different supervisorId
      const operarioRepo = {
        findById: jest.fn().mockResolvedValue(null), // scoped repo returns null = not in scope
      };
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true);

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(OperarioNotInScopeError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── PR-3: OP-51, OP-52 — Inactive operario guard ──────────────────────────

  describe('OP-51 — inactive operario → InactiveOperarioError', () => {
    it('throws InactiveOperarioError when isActive returns false; AttendanceRepo.create NOT called', async () => {
      const repo = makeMockRepo({ create: jest.fn() });
      const operarioRepo = makeMockOperarioRepo(); // findById returns operario (in scope)
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(false); // inactive

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(InactiveOperarioError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('OP-52 — active operario → proceeds normally (regression)', () => {
    it('does NOT throw InactiveOperarioError; AttendanceRepo.create IS called', async () => {
      const attendance = makeAttendance();
      const repo = makeMockRepo({ create: jest.fn().mockResolvedValue(attendance) });
      const operarioRepo = makeMockOperarioRepo();
      const holder = makeMockHolder();
      const statusPort = makeMockStatusPort(true); // active

      const useCase = new CheckInAttendanceUseCase(repo, operarioRepo as any, holder as any, statusPort as any);

      const result = await useCase.execute(VALID_INPUT);

      expect(result.record).toBe(attendance);
      expect(result.created).toBe(true);
      expect(repo.create).toHaveBeenCalledTimes(1);
    });
  });
});
