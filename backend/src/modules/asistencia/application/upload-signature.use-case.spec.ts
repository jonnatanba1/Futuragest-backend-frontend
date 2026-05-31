/**
 * T-27 RED → T-28 GREEN: UploadSignatureUseCase unit spec.
 * Covers AT-11 (happy path), AT-13 (attendance not found → 404),
 * AT-15 (completed record → 409), AT-17 (wrong mime → 422), AT-18 (file > 2MB → 422).
 */

import { UploadSignatureUseCase } from './upload-signature.use-case';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  SignatureRequiredError,
} from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { StoragePort } from '../../storage/domain/storage.port';
import type { Attendance } from '@prisma/client';

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-123',
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
    update: jest.fn().mockResolvedValue({ ...attendance, signatureKey: 'signatures/S1/ATT-123.png' }),
  };
}

function makeMockStorage(): StoragePort {
  return {
    putObject: jest.fn().mockResolvedValue(undefined),
    getPresignedGetUrl: jest.fn(),
    getPresignedPutUrl: jest.fn(),
    removeObject: jest.fn(),
  };
}

const VALID_FILE = {
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
  mimetype: 'image/png',
  size: 1024,
};

describe('UploadSignatureUseCase', () => {
  describe('AT-37 — happy path: stores key and calls putObject with deterministic key', () => {
    it('calls storage.putObject with correct bucket, key, buffer, contentType', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();

      const useCase = new UploadSignatureUseCase(repo, storage);
      const result = await useCase.execute({ id: 'ATT-123', file: VALID_FILE });

      expect(storage.putObject).toHaveBeenCalledWith(
        'futuragest',
        'signatures/S1/ATT-123.png',
        VALID_FILE.buffer,
        'image/png',
      );
      expect(repo.update).toHaveBeenCalledWith('ATT-123', {
        signatureKey: 'signatures/S1/ATT-123.png',
      });
      expect(result).toEqual({ attendanceId: 'ATT-123', signatureKey: 'signatures/S1/ATT-123.png' });
    });
  });

  describe('AT-13 — attendance not found → AttendanceNotFoundError', () => {
    it('throws AttendanceNotFoundError when findById returns null', async () => {
      const repo = makeMockRepo(null);
      const storage = makeMockStorage();
      const useCase = new UploadSignatureUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-999', file: VALID_FILE })).rejects.toThrow(
        AttendanceNotFoundError,
      );
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('AT-38 — completed record → ImmutableAttendanceError', () => {
    it('throws ImmutableAttendanceError when completedAt is set', async () => {
      const att = makeAttendance({ completedAt: new Date() });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadSignatureUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-123', file: VALID_FILE })).rejects.toThrow(
        ImmutableAttendanceError,
      );
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-17 — wrong mime type → SignatureRequiredError (422)', () => {
    it('throws for non-png/jpeg mime type', async () => {
      const att = makeAttendance({ completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadSignatureUseCase(repo, storage);

      await expect(
        useCase.execute({ id: 'ATT-123', file: { ...VALID_FILE, mimetype: 'application/pdf' } }),
      ).rejects.toThrow(SignatureRequiredError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('AT-18 — file > 2MB → SignatureRequiredError (422)', () => {
    it('throws for file size exceeding 2MB', async () => {
      const att = makeAttendance({ completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadSignatureUseCase(repo, storage);

      await expect(
        useCase.execute({
          id: 'ATT-123',
          file: { ...VALID_FILE, size: 3 * 1024 * 1024 }, // 3MB
        }),
      ).rejects.toThrow(SignatureRequiredError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });
});
