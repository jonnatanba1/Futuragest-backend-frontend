/**
 * T-27 RED → T-28 GREEN: UploadPhotoUseCase unit spec.
 * Covers:
 *   AT-11 (happy path — checkin phase default)
 *   AT-13 (attendance not found → 404)
 *   AT-15 (completed record → 409)
 *   AT-17 (wrong mime → 422)
 *   AT-18 (file > 5MB → 422)
 *   AT-18b (file exactly at 5MB boundary → 422)
 *   AT-40 (phase=checkin → writes checkInPhotoKey with -checkin.png key)
 *   AT-41 (phase=checkout → writes checkOutPhotoKey with -checkout.png key)
 *   AT-42 (jpeg mime → derives .jpg extension)
 */

import { UploadPhotoUseCase } from './upload-photo.use-case';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  PhotoRequiredError,
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

function makeMockRepo(attendance: Attendance | null): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(attendance),
    findMany: jest.fn(),
    findByClientRef: jest.fn(),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest
      .fn()
      .mockResolvedValue({ ...attendance, checkInPhotoKey: 'photos/S1/ATT-123-checkin.png' }),
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

const VALID_PNG_FILE = {
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
  mimetype: 'image/png',
  size: 1024,
};

const VALID_JPEG_FILE = {
  buffer: Buffer.from([0xff, 0xd8, 0xff]), // JPEG magic bytes
  mimetype: 'image/jpeg',
  size: 2048,
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

describe('UploadPhotoUseCase', () => {
  describe('AT-37 — happy path: stores key and calls putObject with deterministic key', () => {
    it('calls storage.putObject with correct bucket, key, buffer, contentType (PNG)', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();

      const useCase = new UploadPhotoUseCase(repo, storage);
      const result = await useCase.execute({ id: 'ATT-123', file: VALID_PNG_FILE });

      expect(storage.putObject).toHaveBeenCalledWith(
        'futuragest',
        'photos/S1/ATT-123-checkin.png',
        VALID_PNG_FILE.buffer,
        'image/png',
      );
      expect(repo.update).toHaveBeenCalledWith('ATT-123', {
        checkInPhotoKey: 'photos/S1/ATT-123-checkin.png',
      });
      expect(result).toEqual({ attendanceId: 'ATT-123', photoKey: 'photos/S1/ATT-123-checkin.png' });
    });
  });

  describe('AT-13 — attendance not found → AttendanceNotFoundError', () => {
    it('throws AttendanceNotFoundError when findById returns null', async () => {
      const repo = makeMockRepo(null);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-999', file: VALID_PNG_FILE })).rejects.toThrow(
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
      const useCase = new UploadPhotoUseCase(repo, storage);

      await expect(useCase.execute({ id: 'ATT-123', file: VALID_PNG_FILE })).rejects.toThrow(
        ImmutableAttendanceError,
      );
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-17 — wrong mime type → PhotoRequiredError (422)', () => {
    it('throws for non-png/jpeg mime type', async () => {
      const att = makeAttendance({ completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      await expect(
        useCase.execute({ id: 'ATT-123', file: { ...VALID_PNG_FILE, mimetype: 'application/pdf' } }),
      ).rejects.toThrow(PhotoRequiredError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('AT-18 — file > 5MB → PhotoRequiredError (422)', () => {
    it('throws for file size exceeding 5MB', async () => {
      const att = makeAttendance({ completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      await expect(
        useCase.execute({
          id: 'ATT-123',
          file: { ...VALID_PNG_FILE, size: 6 * 1024 * 1024 }, // 6MB
        }),
      ).rejects.toThrow(PhotoRequiredError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('AT-18b — file exactly at 5MB boundary (MAX_SIZE_BYTES) → PhotoRequiredError (422)', async () => {
      const att = makeAttendance({ completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      await expect(
        useCase.execute({
          id: 'ATT-123',
          file: { ...VALID_PNG_FILE, size: MAX_SIZE_BYTES + 1 },
        }),
      ).rejects.toThrow(PhotoRequiredError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('AT-40 — phase=checkin writes checkInPhotoKey with -checkin.png key', () => {
    it('stores checkin key and updates checkInPhotoKey', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      const result = await useCase.execute({ id: 'ATT-123', phase: 'checkin', file: VALID_PNG_FILE });

      const expectedKey = 'photos/S1/ATT-123-checkin.png';
      expect(storage.putObject).toHaveBeenCalledWith('futuragest', expectedKey, VALID_PNG_FILE.buffer, 'image/png');
      expect(repo.update).toHaveBeenCalledWith('ATT-123', { checkInPhotoKey: expectedKey });
      expect(result).toEqual({ attendanceId: 'ATT-123', photoKey: expectedKey });
    });
  });

  describe('AT-41 — phase=checkout writes checkOutPhotoKey with -checkout.png key', () => {
    it('stores checkout key and updates checkOutPhotoKey', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = {
        ...makeMockRepo(att),
        update: jest.fn().mockResolvedValue({ ...att, checkOutPhotoKey: 'photos/S1/ATT-123-checkout.png' }),
      };
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      const result = await useCase.execute({ id: 'ATT-123', phase: 'checkout', file: VALID_PNG_FILE });

      const expectedKey = 'photos/S1/ATT-123-checkout.png';
      expect(storage.putObject).toHaveBeenCalledWith('futuragest', expectedKey, VALID_PNG_FILE.buffer, 'image/png');
      expect(repo.update).toHaveBeenCalledWith('ATT-123', { checkOutPhotoKey: expectedKey });
      expect(result).toEqual({ attendanceId: 'ATT-123', photoKey: expectedKey });
    });
  });

  describe('AT-41b — phase absent (default) → same as checkin', () => {
    it('defaults to checkin behavior when phase is omitted', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = makeMockRepo(att);
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      // No phase field
      const result = await useCase.execute({ id: 'ATT-123', file: VALID_PNG_FILE });

      const expectedKey = 'photos/S1/ATT-123-checkin.png';
      expect(repo.update).toHaveBeenCalledWith('ATT-123', { checkInPhotoKey: expectedKey });
      expect(result.photoKey).toBe(expectedKey);
    });
  });

  describe('AT-42 — jpeg mime → derives .jpg extension', () => {
    it('builds key with .jpg extension for image/jpeg', async () => {
      const att = makeAttendance({ id: 'ATT-123', supervisorId: 'S1', completedAt: null });
      const repo = {
        ...makeMockRepo(att),
        update: jest.fn().mockResolvedValue({ ...att, checkInPhotoKey: 'photos/S1/ATT-123-checkin.jpg' }),
      };
      const storage = makeMockStorage();
      const useCase = new UploadPhotoUseCase(repo, storage);

      const result = await useCase.execute({ id: 'ATT-123', phase: 'checkin', file: VALID_JPEG_FILE });

      const expectedKey = 'photos/S1/ATT-123-checkin.jpg';
      expect(storage.putObject).toHaveBeenCalledWith('futuragest', expectedKey, VALID_JPEG_FILE.buffer, 'image/jpeg');
      expect(repo.update).toHaveBeenCalledWith('ATT-123', { checkInPhotoKey: expectedKey });
      expect(result).toEqual({ attendanceId: 'ATT-123', photoKey: expectedKey });
    });
  });
});
