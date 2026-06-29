/**
 * T-15 RED → T-16 GREEN: CheckOutAttendanceUseCase unit spec.
 * Covers:
 *   AT-18 (happy path with checkOutPhotoKey present)
 *   AT-19 (no checkOutPhotoKey → 422, even if checkInPhotoKey is set)
 *   AT-20 (already completed → 409 ImmutableAttendanceError)
 *   AT-21 (not in scope → 404)
 *   AT-23 (invalid GPS → 400)
 *   AT-36 (timestamps are Date instances)
 *   SI-15 (same checkOutClientRef on completed → idempotent 200, no update)
 *   SI-16 (different checkOutClientRef on completed → ImmutableAttendanceError)
 *   SI-17 (absent checkOutClientRef on completed → ImmutableAttendanceError)
 *   SI-18 (photo required check: checkOutPhotoKey null → 422 even with checkOutClientRef present)
 *   SI-30 (no checkOutClientRef on active → backward-compat checkout)
 *   SI-31 (by-clientRef lookup returns null → AttendanceNotFoundError)
 *   AT-39 (checkInPhotoKey set but checkOutPhotoKey null → 422, checkout photo is what matters)
 */

import { CheckOutAttendanceUseCase } from './check-out-attendance.use-case';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  PhotoRequiredError,
  InvalidGpsError,
} from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import type { Attendance } from '@prisma/client';

// Fixed check-in time used across all tests so VALID_INPUT.checkOutCapturedAt (2026-05-31T17:00Z)
// is always after checkIn and within MAX_SHIFT_HOURS.
const FIXED_CHECK_IN = new Date('2026-05-31T08:00:00Z');

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-05-31',
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
    // checkOutPhotoKey is required for check-out (SALIDA photo)
    checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png',
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
    update: jest.fn().mockResolvedValue({ ...attendance, completedAt: new Date() }),
  };
}

const VALID_INPUT = {
  id: 'ATT-1',
  checkOutCapturedAt: '2026-05-31T17:00:00Z',
  checkOutLat: 7.5,
  checkOutLng: -76.5,
  checkOutAccuracy: 12,
};

describe('CheckOutAttendanceUseCase', () => {
  describe('AT-18 — happy path: checks out with photo present', () => {
    it('sets completedAt and both checkOut timestamps', async () => {
      const att = makeAttendance({ checkInPhotoKey: 'photos/S1/ATT-1-checkin.png', completedAt: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const result = await useCase.execute(VALID_INPUT);

      expect(repo.update).toHaveBeenCalledTimes(1);
      const updateCall = (repo.update as jest.Mock).mock.calls[0];
      expect(updateCall[0]).toBe('ATT-1');
      // completedAt must be set
      expect(updateCall[1].completedAt).toBeInstanceOf(Date);
      // checkOutReceivedAt must be server-generated Date
      expect(updateCall[1].checkOutReceivedAt).toBeInstanceOf(Date);
      // checkOutCapturedAt from client
      expect(updateCall[1].checkOutCapturedAt).toBeInstanceOf(Date);
      expect(result).toBeDefined();
    });
  });

  describe('AT-19 — no checkout photo uploaded → PhotoRequiredError (422)', () => {
    it('throws PhotoRequiredError when checkOutPhotoKey is null', async () => {
      const att = makeAttendance({ checkOutPhotoKey: null, completedAt: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(PhotoRequiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-20 — already completed, no checkOutClientRef → ImmutableAttendanceError (409)', () => {
    it('throws ImmutableAttendanceError when completedAt is set and no ref provided', async () => {
      const att = makeAttendance({
        completedAt: new Date(),
        checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
        checkOutClientRef: 'CREF-Z',
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(ImmutableAttendanceError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-21 — not in scope → AttendanceNotFoundError (404)', () => {
    it('throws AttendanceNotFoundError when findById returns null', async () => {
      const repo = makeMockRepo(null);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(AttendanceNotFoundError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-23 — invalid GPS on check-out → InvalidGpsError (400)', () => {
    it('throws InvalidGpsError for lat out of range', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkOutLat: 999 }),
      ).rejects.toThrow(InvalidGpsError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-36 — success path sets completedAt and server timestamps (unit)', () => {
    it('repo.update is called with completedAt and checkOutReceivedAt as Dates', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const updatedAtt = { ...att, completedAt: new Date(), checkOutReceivedAt: new Date() };
      const repo = {
        ...makeMockRepo(att),
        update: jest.fn().mockResolvedValue(updatedAtt),
      };
      const useCase = new CheckOutAttendanceUseCase(repo);

      await useCase.execute(VALID_INPUT);

      const [, updateData] = (repo.update as jest.Mock).mock.calls[0];
      expect(updateData.completedAt).toBeInstanceOf(Date);
      expect(updateData.checkOutReceivedAt).toBeInstanceOf(Date);
    });
  });

  // ── Idempotency (SI-15..SI-18, SI-30) ───────────────────────────────────────

  describe('SI-15 — same checkOutClientRef on completed → idempotent replay (no update)', () => {
    it('returns existing record without calling update', async () => {
      const completedAt = new Date('2026-05-31T17:00:00Z');
      const att = makeAttendance({
        completedAt,
        checkOutClientRef: 'CREF-Z',
        checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const result = await useCase.execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-Z' });

      expect(result.record).toBe(att);
      expect(result.idempotent).toBe(true);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-16 — different checkOutClientRef on completed → ImmutableAttendanceError', () => {
    it('throws ImmutableAttendanceError; update NOT called', async () => {
      const att = makeAttendance({
        completedAt: new Date(),
        checkOutClientRef: 'CREF-Z',
        checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      const err = await useCase
        .execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-OTHER' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(ImmutableAttendanceError);
      expect((err as ImmutableAttendanceError).conflicting).toBe(att);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-17 — absent checkOutClientRef on completed → ImmutableAttendanceError', () => {
    it('throws ImmutableAttendanceError when no ref provided; update NOT called', async () => {
      const att = makeAttendance({
        completedAt: new Date(),
        checkOutClientRef: 'CREF-Z',
        checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      // VALID_INPUT has no checkOutClientRef
      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(ImmutableAttendanceError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-18 — photo required check: checkOutPhotoKey null → 422 even with checkOutClientRef present', () => {
    it('throws PhotoRequiredError when active record has no checkOutPhotoKey', async () => {
      const att = makeAttendance({ completedAt: null, checkOutPhotoKey: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-NEW' }),
      ).rejects.toThrow(PhotoRequiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-30 — no checkOutClientRef on active record → backward-compat checkout', () => {
    it('calls update with completedAt set; checkOutClientRef null in payload', async () => {
      const att = makeAttendance({ completedAt: null, checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png' });
      const updatedAtt = { ...att, completedAt: new Date() };
      const repo = {
        ...makeMockRepo(att),
        update: jest.fn().mockResolvedValue(updatedAtt),
      };
      const useCase = new CheckOutAttendanceUseCase(repo);

      // No checkOutClientRef in input
      const result = await useCase.execute(VALID_INPUT);

      expect(result.idempotent).toBe(false);
      expect(repo.update).toHaveBeenCalledTimes(1);
      const [, data] = (repo.update as jest.Mock).mock.calls[0];
      expect(data.completedAt).toBeInstanceOf(Date);
      // checkOutClientRef should be null when not provided
      expect(data.checkOutClientRef).toBeNull();
    });
  });

  describe('SI-31 — by-clientRef not found → AttendanceNotFoundError', () => {
    it('throws AttendanceNotFoundError when findById returns null', async () => {
      const repo = makeMockRepo(null);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-NEW' }),
      ).rejects.toThrow(AttendanceNotFoundError);
    });
  });

  describe('AT-39 — checkInPhotoKey set but checkOutPhotoKey null → PhotoRequiredError (422)', () => {
    it('rejects check-out when only checkin photo is present', async () => {
      // checkInPhotoKey (ingreso) is set; checkOutPhotoKey (salida) is not
      const att = makeAttendance({
        checkInPhotoKey: 'photos/S1/ATT-1-checkin.png',
        checkOutPhotoKey: null,
        completedAt: null,
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(PhotoRequiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ── VM-03..VM-05 — VerificationMethod (checkOutVerification) ───────────────

  describe('VM-03 — checkOut with verification → persists checkOutVerification', () => {
    it('passes checkOutVerification: BIOMETRIC to repo.update when provided', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const updatedAtt = { ...att, completedAt: new Date() };
      const repo = { ...makeMockRepo(att), update: jest.fn().mockResolvedValue(updatedAtt) };
      const useCase = new CheckOutAttendanceUseCase(repo);

      await useCase.execute({ ...VALID_INPUT, verification: 'BIOMETRIC' });

      const [, updateData] = (repo.update as jest.Mock).mock.calls[0];
      expect(updateData.checkOutVerification).toBe('BIOMETRIC');
    });

    it('passes checkOutVerification: NONE to repo.update when provided', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const updatedAtt = { ...att, completedAt: new Date() };
      const repo = { ...makeMockRepo(att), update: jest.fn().mockResolvedValue(updatedAtt) };
      const useCase = new CheckOutAttendanceUseCase(repo);

      await useCase.execute({ ...VALID_INPUT, verification: 'NONE' });

      const [, updateData] = (repo.update as jest.Mock).mock.calls[0];
      expect(updateData.checkOutVerification).toBe('NONE');
    });
  });

  describe('VM-04 — checkOut without verification → persists null', () => {
    it('passes checkOutVerification: null to repo.update when verification is absent', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const updatedAtt = { ...att, completedAt: new Date() };
      const repo = { ...makeMockRepo(att), update: jest.fn().mockResolvedValue(updatedAtt) };
      const useCase = new CheckOutAttendanceUseCase(repo);

      // VALID_INPUT has no verification field
      await useCase.execute(VALID_INPUT);

      const [, updateData] = (repo.update as jest.Mock).mock.calls[0];
      expect(updateData.checkOutVerification).toBeNull();
    });
  });

  describe('Fase 2 — shift classification', () => {
    it('should trigger classification on successful checkout', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const repo = makeMockRepo(att);
      const classifier = {
        classifyAttendance: jest.fn().mockResolvedValue(undefined),
      };
      const useCase = new CheckOutAttendanceUseCase(repo, undefined, classifier);

      await useCase.execute(VALID_INPUT);

      expect(classifier.classifyAttendance).toHaveBeenCalledTimes(1);
      expect(classifier.classifyAttendance).toHaveBeenCalledWith('ATT-1');
    });

    it('should swallow classifier errors and checkout still succeeds', async () => {
      const att = makeAttendance({ checkOutPhotoKey: 'photos/S1/ATT-1-checkout.png', completedAt: null });
      const repo = makeMockRepo(att);
      const classifier = {
        classifyAttendance: jest.fn().mockRejectedValue(new Error('Classification failed')),
      };
      const useCase = new CheckOutAttendanceUseCase(repo, undefined, classifier);

      const result = await useCase.execute(VALID_INPUT);

      expect(classifier.classifyAttendance).toHaveBeenCalledTimes(1);
      expect(result.record.id).toBe('ATT-1');
    });
  });
});
