/**
 * T-29 RED → T-30 GREEN: GetSignatureUrlUseCase unit spec.
 * Covers AT-19 (presigned URL returned), AT-20 (attendance not found → 404),
 * AT-21 (signatureKey null → 404).
 */

import { GetSignatureUrlUseCase } from './get-signature-url.use-case';
import { AttendanceNotFoundError } from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import type { Attendance } from '@prisma/client';

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
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
    signatureKey: 'signatures/S1/ATT-1.png',
    checkOutSignatureKey: null,
    clientRef: 'REF-A',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockRepo(attendance: Attendance | null): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(attendance),
    findMany: jest.fn(),
    findByClientRef: jest.fn(),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
  };
}

function makeMockStorage(): StoragePort {
  return {
    putObject: jest.fn(),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://minio.example/presigned'),
    getPresignedPutUrl: jest.fn(),
    removeObject: jest.fn(),
  };
}

describe('GetSignatureUrlUseCase', () => {
  describe('AT-19 — happy path: returns presigned URL with ~300s TTL', () => {
    it('calls getPresignedGetUrl with bucket, key, 300 and returns url', async () => {
      const att = makeAttendance({ signatureKey: 'signatures/S1/ATT-1.png' });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      const result = await useCase.execute({ id: 'ATT-1' });

      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'futuragest',
        'signatures/S1/ATT-1.png',
        300,
      );
      expect(result).toEqual({ url: 'https://minio.example/presigned' });
    });
  });

  describe('AT-20 — attendance not found → AttendanceNotFoundError', () => {
    it('throws AttendanceNotFoundError when findById returns null', async () => {
      const repo = makeMockRepo(null);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-999' })).rejects.toThrow(AttendanceNotFoundError);
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });
  });

  describe('AT-21 — signatureKey null → AttendanceNotFoundError (no signature uploaded)', () => {
    it('throws when signatureKey is null', async () => {
      const att = makeAttendance({ signatureKey: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-1' })).rejects.toThrow(AttendanceNotFoundError);
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });
  });

  describe('phase=checkout — signs the check-out signature key', () => {
    it('presigns checkOutSignatureKey when phase is checkout', async () => {
      const att = makeAttendance({
        signatureKey: 'signatures/S1/ATT-1.png',
        checkOutSignatureKey: 'signatures/S1/ATT-1-checkout.png',
      });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      const result = await useCase.execute({ id: 'ATT-1', phase: 'checkout' });

      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'futuragest',
        'signatures/S1/ATT-1-checkout.png',
        300,
      );
      expect(result).toEqual({ url: 'https://minio.example/presigned' });
    });

    it('throws AttendanceNotFoundError when checkOutSignatureKey is null', async () => {
      const att = makeAttendance({ checkOutSignatureKey: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-1', phase: 'checkout' })).rejects.toThrow(
        AttendanceNotFoundError,
      );
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('defaults to the check-in signature when no phase is given', async () => {
      const att = makeAttendance({
        signatureKey: 'signatures/S1/ATT-1.png',
        checkOutSignatureKey: 'signatures/S1/ATT-1-checkout.png',
      });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new GetSignatureUrlUseCase(repo, storage);

      await useCase.execute({ id: 'ATT-1' });

      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'futuragest',
        'signatures/S1/ATT-1.png',
        300,
      );
    });
  });
});
