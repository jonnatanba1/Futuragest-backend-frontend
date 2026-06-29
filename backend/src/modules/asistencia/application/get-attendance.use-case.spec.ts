/**
 * T-19 RED → T-20 GREEN: GetAttendanceUseCase unit spec.
 * Covers AT-27 (detail found), AT-28 (detail not in scope → 404).
 */

import { GetAttendanceUseCase } from './get-attendance.use-case';
import { AttendanceNotFoundError } from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';

function makeAttendance(): Attendance {
  return {
    id: 'ATT-1',
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
    checkInVerification: null,
    checkOutVerification: null,
    checkInPhotoKey: null,
    checkOutPhotoKey: null,
    clientRef: 'REF-A',
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

describe('GetAttendanceUseCase', () => {
  it('AT-27 — returns attendance record when found in scope', async () => {
    const att = makeAttendance();
    const repo = makeMockRepo({ findById: jest.fn().mockResolvedValue(att) });

    const useCase = new GetAttendanceUseCase(repo);
    const result = await useCase.execute('ATT-1');

    expect(result).toBe(att);
    expect(repo.findById).toHaveBeenCalledWith('ATT-1');
  });

  it('AT-28 — throws AttendanceNotFoundError when findById returns null', async () => {
    const repo = makeMockRepo({ findById: jest.fn().mockResolvedValue(null) });

    const useCase = new GetAttendanceUseCase(repo);

    await expect(useCase.execute('ATT-999')).rejects.toThrow(AttendanceNotFoundError);
  });
});
