/**
 * T-19 RED → T-20 GREEN: ListAttendanceUseCase unit spec.
 * Covers AT-24 (SUPERVISOR sees own list).
 */

import { ListAttendanceUseCase } from './list-attendance.use-case';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';

function makeAttendance(id: string): Attendance {
  return {
    id,
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-05-31',
    checkInCapturedAt: new Date(),
    checkInReceivedAt: new Date(),
    checkInLat: 7.5,
    checkInLng: -76.5,
    checkInAccuracy: null,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    signatureKey: null,
    checkOutSignatureKey: null,
    clientRef: `REF-${id}`,
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMockRepo(overrides: Partial<AttendanceRepositoryPort> = {}): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    findByClientRef: jest.fn(),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    ...overrides,
  };
}

describe('ListAttendanceUseCase', () => {
  it('AT-24 — returns scoped list from the repository', async () => {
    const records = [makeAttendance('ATT-1'), makeAttendance('ATT-2')];
    const repo = makeMockRepo({ findMany: jest.fn().mockResolvedValue(records) });

    const useCase = new ListAttendanceUseCase(repo);
    const result = await useCase.execute();

    expect(result).toBe(records);
    expect(repo.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no records in scope', async () => {
    const repo = makeMockRepo({ findMany: jest.fn().mockResolvedValue([]) });

    const useCase = new ListAttendanceUseCase(repo);
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  // ── Delta ?since= branch (sync-delta-pull) ───────────────────────────────────

  it('SD-UC-01: passes since to repo.findMany when provided', async () => {
    const repo = makeMockRepo({ findMany: jest.fn().mockResolvedValue([]) });
    const useCase = new ListAttendanceUseCase(repo);
    const since = new Date('2026-05-31T12:00:00.000Z');
    await useCase.execute(since);
    expect(repo.findMany).toHaveBeenCalledWith(since);
  });

  it('SD-UC-02: calls repo.findMany with undefined when since not provided', async () => {
    const repo = makeMockRepo({ findMany: jest.fn().mockResolvedValue([]) });
    const useCase = new ListAttendanceUseCase(repo);
    await useCase.execute();
    expect(repo.findMany).toHaveBeenCalledWith(undefined);
  });
});
