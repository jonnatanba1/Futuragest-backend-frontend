/**
 * T-13 / T-17 — Unit spec for CreateNovedadUseCase
 *
 * Extended for sync-idempotency (SI-06..SI-08, SI-28, SI-29).
 * Covers: NV-38, NV-39, NV-40, NV-41, NV-42, NV-43 (updated shapes) + SI-06..SI-08, SI-28, SI-29
 */

import { CreateNovedadUseCase } from './create-novedad.use-case';
import {
  AttendanceNotFoundError,
  AttendanceNotCompletedError,
  NovedadAlreadyExistsError,
  InvalidHorasExtraError,
} from '../domain/novedad.errors';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScopeHolder(overrides: Partial<ReturnType<ScopeContextHolder['current']>> = {}): ScopeContextHolder {
  return {
    current: () => ({
      userId: 'user-lider',
      role: 'SUPERVISOR',
      supervisorId: 'sup-s1',
      zoneId: 'zone-z1',
      ...overrides,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeAttendance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-a1',
    supervisorId: 'sup-s1',
    zoneId: 'zone-z1',
    operarioId: 'op-o1',
    date: '2026-05-31',
    completedAt: new Date('2026-05-31T18:00:00Z'),
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
    clientRef: 'ref-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeNovedad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nov-1',
    attendanceId: 'att-a1',
    supervisorId: 'sup-s1',
    zoneId: 'zone-z1',
    horasExtra: '2.50' as unknown,
    motivo: null,
    status: 'PENDING',
    clientRef: null,
    approvedByUserId: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockNovedadRepo(overrides: Partial<NovedadRepositoryPort> = {}): NovedadRepositoryPort {
  return {
    create: jest.fn().mockResolvedValue(makeNovedad()),
    findByIdScoped: jest.fn().mockResolvedValue(null),
    findManyScoped: jest.fn().mockResolvedValue([]),
    findByClientRef: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockAttendanceRepo(overrides: Partial<AttendanceRepositoryPort> = {}): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(makeAttendance()),
    findMany: jest.fn().mockResolvedValue([]),
    findByClientRef: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CreateNovedadUseCase', () => {
  describe('NV-38 — happy path: reads scope from holder, verifies attendance, creates novedad', () => {
    it('calls attendanceRepo.findById and novedadRepo.create with correct args; returns { record, created: true }', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder({ supervisorId: 'sup-s1', zoneId: 'zone-z1' });

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.50' });

      expect(attendanceRepo.findById).toHaveBeenCalledWith('att-a1');
      expect(novedadRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          attendanceId: 'att-a1',
          supervisorId: 'sup-s1',
          zoneId: 'zone-z1',
        }),
      );
      // create must NOT be called with approvedByUserId or decidedAt
      const createArg = (novedadRepo.create as jest.Mock).mock.calls[0][0];
      expect(createArg.approvedByUserId).toBeUndefined();
      // New shape: { record, created }
      expect(result).toHaveProperty('record');
      expect(result).toHaveProperty('created', true);
    });

    it('does NOT call attendanceRepo.update or mutate attendance', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      await useCase.execute({ attendanceId: 'att-a1', horasExtra: '1.00' });

      expect(attendanceRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('NV-39 — attendance not found in scope → AttendanceNotFoundError', () => {
    it('throws AttendanceNotFoundError when attendance is null', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo({
        findById: jest.fn().mockResolvedValue(null),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-missing', horasExtra: '1.00' })).rejects.toThrow(
        AttendanceNotFoundError,
      );
      expect(novedadRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('NV-40 — attendance found but not completed → AttendanceNotCompletedError', () => {
    it('throws AttendanceNotCompletedError when completedAt is null', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo({
        findById: jest.fn().mockResolvedValue(makeAttendance({ completedAt: null })),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: '1.00' })).rejects.toThrow(
        AttendanceNotCompletedError,
      );
      expect(novedadRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('NV-41 — P2002 on non-clientRef constraint → NovedadAlreadyExistsError', () => {
    it('catches P2002 on partial-index constraint and throws NovedadAlreadyExistsError', async () => {
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['Novedad_attendanceId_active_key'] },
      });
      const novedadRepo = makeMockNovedadRepo({
        create: jest.fn().mockRejectedValue(p2002Error),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: '1.00' })).rejects.toThrow(
        NovedadAlreadyExistsError,
      );
    });
  });

  describe('NV-42 — invalid horasExtra (zero) → InvalidHorasExtraError before port call', () => {
    it('throws InvalidHorasExtraError for horasExtra = "0"', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: '0' })).rejects.toThrow(
        InvalidHorasExtraError,
      );
      expect(novedadRepo.create).not.toHaveBeenCalled();
      expect(attendanceRepo.findById).not.toHaveBeenCalled();
    });

    it('throws InvalidHorasExtraError for horasExtra = 0 (number)', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: 0 })).rejects.toThrow(
        InvalidHorasExtraError,
      );
    });

    it('throws InvalidHorasExtraError for negative horasExtra', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: '-1.5' })).rejects.toThrow(
        InvalidHorasExtraError,
      );
    });
  });

  describe('NV-43 — invalid horasExtra (> 24) → InvalidHorasExtraError', () => {
    it('throws InvalidHorasExtraError for horasExtra = "25"', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: '25' })).rejects.toThrow(
        InvalidHorasExtraError,
      );
      expect(novedadRepo.create).not.toHaveBeenCalled();
    });

    it('throws InvalidHorasExtraError for non-numeric string', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(useCase.execute({ attendanceId: 'att-a1', horasExtra: 'abc' })).rejects.toThrow(
        InvalidHorasExtraError,
      );
    });
  });

  // ─── SI scenarios (sync-idempotency) ────────────────────────────────────────

  describe('SI-06 — clientRef found in scope → returns existing, create NOT called', () => {
    it('returns { record: existing, created: false } and does not call create', async () => {
      const existing = makeNovedad({ id: 'nov-existing', clientRef: 'uuid-x' });
      const novedadRepo = makeMockNovedadRepo({
        findByClientRef: jest.fn().mockResolvedValue(existing),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.00', clientRef: 'uuid-x' });

      expect(result).toEqual({ record: existing, created: false });
      expect(novedadRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('SI-07 — clientRef absent → normal create path, findByClientRef NOT called', () => {
    it('does not call findByClientRef and calls create once; returns { record, created: true }', async () => {
      const newNovedad = makeNovedad();
      const novedadRepo = makeMockNovedadRepo({
        create: jest.fn().mockResolvedValue(newNovedad),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.00' });

      expect(novedadRepo.findByClientRef).not.toHaveBeenCalled();
      expect(novedadRepo.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ record: newNovedad, created: true });
    });
  });

  describe('SI-08 — P2002 on non-clientRef constraint when clientRef provided → NovedadAlreadyExistsError', () => {
    it('throws NovedadAlreadyExistsError when P2002 meta.target does not include clientRef', async () => {
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['Novedad_attendanceId_active_key'] },
      });
      const novedadRepo = makeMockNovedadRepo({
        findByClientRef: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(p2002Error),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(
        useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.00', clientRef: 'uuid-new' }),
      ).rejects.toThrow(NovedadAlreadyExistsError);
    });
  });

  describe('SI-28 — horasExtra=0 + clientRef → InvalidHorasExtraError, findByClientRef NOT called', () => {
    it('validates horasExtra BEFORE any port call even when clientRef is present', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);

      await expect(
        useCase.execute({ attendanceId: 'att-a1', horasExtra: 0, clientRef: 'uuid-x' }),
      ).rejects.toThrow(InvalidHorasExtraError);
      expect(novedadRepo.findByClientRef).not.toHaveBeenCalled();
      expect(novedadRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('SI-29 — clientRef P2002 race → re-fetch and return existing, no error', () => {
    it('returns { record: refetched, created: false } when create throws P2002 on clientRef', async () => {
      const refetched = makeNovedad({ id: 'nov-race', clientRef: 'uuid-race' });
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['Novedad_clientRef_key'] },
      });
      const findByClientRef = jest.fn()
        .mockResolvedValueOnce(null)      // first call: not found yet
        .mockResolvedValueOnce(refetched); // second call after P2002: found

      const novedadRepo = makeMockNovedadRepo({
        findByClientRef,
        create: jest.fn().mockRejectedValue(p2002Error),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.00', clientRef: 'uuid-race' });

      expect(result).toEqual({ record: refetched, created: false });
      expect(novedadRepo.create).toHaveBeenCalledTimes(1);
      expect(findByClientRef).toHaveBeenCalledTimes(2);
    });
  });
});
