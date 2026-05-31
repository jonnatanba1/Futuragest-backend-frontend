/**
 * T-15 RED → T-16 GREEN: CheckOutAttendanceUseCase unit spec.
 * Covers:
 *   AT-18 (happy path with signature)
 *   AT-19 (no signature → 422)
 *   AT-20 (already completed → 409 ImmutableAttendanceError)
 *   AT-21 (not in scope → 404)
 *   AT-23 (invalid GPS → 400)
 *   AT-36 (timestamps are Date instances)
 *   SI-15 (same checkOutClientRef on completed → idempotent 200, no update)
 *   SI-16 (different checkOutClientRef on completed → ImmutableAttendanceError)
 *   SI-17 (absent checkOutClientRef on completed → ImmutableAttendanceError)
 *   SI-18 (signature required check unchanged with checkOutClientRef present)
 *   SI-30 (no checkOutClientRef on active → backward-compat checkout)
 *   SI-31 (by-clientRef lookup returns null → AttendanceNotFoundError)
 */

import { CheckOutAttendanceUseCase } from './check-out-attendance.use-case';
import {
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  SignatureRequiredError,
  InvalidGpsError,
} from '../domain/attendance.errors';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
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
    checkInAccuracy: 10,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    signatureKey: 'signatures/S1/ATT-1.png',
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
  describe('AT-18 — happy path: checks out with signature present', () => {
    it('sets completedAt and both checkOut timestamps', async () => {
      const att = makeAttendance({ signatureKey: 'signatures/S1/ATT-1.png', completedAt: null });
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

  describe('AT-19 — no signature uploaded → SignatureRequiredError (422)', () => {
    it('throws SignatureRequiredError when signatureKey is null', async () => {
      const att = makeAttendance({ signatureKey: null, completedAt: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(SignatureRequiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('AT-20 — already completed, no checkOutClientRef → ImmutableAttendanceError (409)', () => {
    it('throws ImmutableAttendanceError when completedAt is set and no ref provided', async () => {
      const att = makeAttendance({
        completedAt: new Date(),
        signatureKey: 'signatures/S1/ATT-1.png',
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
      const att = makeAttendance({ signatureKey: 'key', completedAt: null });
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
      const att = makeAttendance({ signatureKey: 'key', completedAt: null });
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
        signatureKey: 'sig-key',
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
        signatureKey: 'sig-key',
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
        signatureKey: 'sig-key',
      });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      // VALID_INPUT has no checkOutClientRef
      await expect(useCase.execute(VALID_INPUT)).rejects.toThrow(ImmutableAttendanceError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-18 — signature required check unchanged when checkOutClientRef present', () => {
    it('throws SignatureRequiredError when active record has no signature', async () => {
      const att = makeAttendance({ completedAt: null, signatureKey: null });
      const repo = makeMockRepo(att);
      const useCase = new CheckOutAttendanceUseCase(repo);

      await expect(
        useCase.execute({ ...VALID_INPUT, checkOutClientRef: 'CREF-NEW' }),
      ).rejects.toThrow(SignatureRequiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('SI-30 — no checkOutClientRef on active record → backward-compat checkout', () => {
    it('calls update with completedAt set; checkOutClientRef null in payload', async () => {
      const att = makeAttendance({ completedAt: null, signatureKey: 'sig-key' });
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
});
