/**
 * LateArrivalNovedadService — unit tests (A1–A8 from plan §11.4)
 *
 * A1: exact on-time → no novedad
 * A2: within tolerance → no novedad
 * A3: at tolerance boundary → no novedad
 * A4: outside tolerance → novedad created
 * A5: very late → novedad created (large minutesTarde)
 * A6: early (checkIn before horaInicio) → no novedad
 * A7: idempotent duplicate → P2002 caught, no error
 * A8: per-operario policy → uses operario-level policy resolution
 */

import { LateArrivalNovedadService } from './late-arrival-novedad.service';
import type { AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import type { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import type { NovedadRepositoryPort } from '../../novedades/domain/ports/novedad-repository.port';
import { Attendance, JornadaPolicy } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a UTC Date that represents a given Colombia local time (UTC-5).
 * The system stores dates as UTC epoch values whose getUTCHours() gives Colombia hour
 * when shifted by -5 hours (see classify-attendance.use-case.ts pattern).
 */
function colombiaDate(dateStr: string, hour: number, minute: number): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCHours(hour + 5, minute, 0, 0); // +5 because Colombia = UTC-5
  return d;
}

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'att-a1',
    supervisorId: 'sup-s1',
    operarioId: 'op-o1',
    zoneId: 'zone-z1',
    date: '2026-06-29',
    checkInCapturedAt: colombiaDate('2026-06-29', 6, 5), // 06:05 Colombia
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
    clientRef: 'ref-a1',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makePolicy(overrides: Partial<JornadaPolicy> = {}): JornadaPolicy {
  return {
    id: 'pol-global',
    operarioId: null,
    zoneId: null,
    horaInicio: '06:00',
    horaFin: '17:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: null,
    almuerzoFin: null,
    toleranciaMin: 5,
    horasDiarias: new Decimal(8.4),
    horasSemanales: new Decimal(42.0),
    vigenteDesde: new Date('2026-01-01'),
    createdAt: new Date(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockAttendanceRepo(findByIdResult: Attendance | null = null): AttendanceRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(findByIdResult ?? makeAttendance()),
    findMany: jest.fn().mockResolvedValue([]),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockPolicyRepo(policy: JornadaPolicy | null = null): JornadaPolicyRepositoryPort {
  return {
    findLatest: jest.fn().mockResolvedValue(policy ?? makePolicy()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockNovedadRepo(createImpl?: jest.Mock): NovedadRepositoryPort {
  const mockCreate = createImpl ?? jest.fn().mockResolvedValue({ id: 'nov-1' });
  return {
    create: mockCreate,
    findByClientRef: jest.fn().mockResolvedValue(null),
    findByIdScoped: jest.fn().mockResolvedValue(null),
    findManyScoped: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LateArrivalNovedadService', () => {
  describe('A1 — exact on-time (checkIn === horaInicio)', () => {
    it('does NOT create a novedad when checkIn equals horaInicio', async () => {
      // 06:00 Colombia = exact start
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 0),
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });

  describe('A2 — within tolerance (checkIn < horaInicio + tolerancia)', () => {
    it('does NOT create a novedad when checkIn is 4 min late (within 5 min tolerance)', async () => {
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 4), // 06:04 < 06:05 boundary
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });

  describe('A3 — at tolerance boundary (checkIn === horaInicio + tolerancia)', () => {
    it('does NOT create a novedad at the exact tolerance boundary (<=)', async () => {
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 5), // exactly 5 min late = boundary
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });

  describe('A4 — outside tolerance (checkIn > horaInicio + tolerancia)', () => {
    it('creates a LLEGADA_TARDE novedad when checkIn is 1 min past tolerance', async () => {
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 6), // 06:06 = 1 min past tolerance
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn().mockResolvedValue({ id: 'nov-late' });
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).toHaveBeenCalledTimes(1);
      expect(novedadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          attendanceId: 'att-a1',
          supervisorId: 'sup-s1',
          zoneId: 'zone-z1',
          tipoNovedad: 'LLEGADA_TARDE',
          autoGenerada: true,
          minutosTarde: 6,
          horasExtra: 0,
        }),
      );
    });
  });

  describe('A5 — very late (large minutesTarde)', () => {
    it('creates a LLEGADA_TARDE novedad with correct minutesTarde when very late (210 min)', async () => {
      const attendance = makeAttendance({
        // 09:30 Colombia = 210 min after 06:00
        checkInCapturedAt: colombiaDate('2026-06-29', 9, 30),
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn().mockResolvedValue({ id: 'nov-very-late' });
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).toHaveBeenCalledTimes(1);
      expect(novedadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          minutosTarde: 210, // 09:30 - 06:00 = 210 min
        }),
      );
    });
  });

  describe('A6 — early (checkIn before horaInicio)', () => {
    it('does NOT create a novedad when checkIn is before horaInicio', async () => {
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 5, 45), // 05:45 < 06:00
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });

  describe('A7 — idempotent duplicate (P2002 caught, no error)', () => {
    it('catches P2002 and returns normally without throwing', async () => {
      const attendance = makeAttendance({
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 10),
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(makePolicy({ toleranciaMin: 5 }));
      const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      const novedadCreate = jest.fn().mockRejectedValue(p2002Error);
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      // Should NOT throw — catches P2002 silently
      await expect(
        service.checkAndCreateLateArrivalNovedad('att-a1'),
      ).resolves.toBeUndefined();

      expect(novedadCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('A8 — per-operario policy resolution', () => {
    it('resolves policy using the attendance operarioId and zoneId', async () => {
      const attendance = makeAttendance({
        operarioId: 'op-o99',
        zoneId: 'zone-z2',
        checkInCapturedAt: colombiaDate('2026-06-29', 6, 10),
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);

      // Per-operario policy: 08:00 start, 0 tolerance
      const operarioPolicy = makePolicy({
        id: 'pol-op-99',
        operarioId: 'op-o99',
        zoneId: null,
        horaInicio: '08:00',
        toleranciaMin: 0,
      });
      const findLatest = jest.fn().mockResolvedValue(operarioPolicy);
      const policyRepo = makeMockPolicyRepo();
      (policyRepo as any).findLatest = findLatest;

      const novedadCreate = jest.fn().mockResolvedValue({ id: 'nov-op' });
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      // Policy resolved with operarioId and zoneId from attendance
      expect(findLatest).toHaveBeenCalledWith(
        'op-o99',
        'zone-z2',
        expect.any(Date),
      );

      // 06:10 < 08:00 → early → no novedad
      expect(novedadCreate).not.toHaveBeenCalled();
    });

    it('creates a novedad when the per-operario policy makes the check-in late', async () => {
      const attendance = makeAttendance({
        operarioId: 'op-o88',
        checkInCapturedAt: colombiaDate('2026-06-29', 8, 5), // 08:05
      });
      const attendanceRepo = makeMockAttendanceRepo(attendance);

      // Per-operario policy: 08:00 start, 0 tolerance → 08:05 IS late by 5 min
      const operarioPolicy = makePolicy({
        id: 'pol-op-88',
        operarioId: 'op-o88',
        zoneId: null,
        horaInicio: '08:00',
        toleranciaMin: 0,
      });
      const policyRepo = makeMockPolicyRepo(operarioPolicy);
      const novedadCreate = jest.fn().mockResolvedValue({ id: 'nov-op-late' });
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await service.checkAndCreateLateArrivalNovedad('att-a1');

      expect(novedadCreate).toHaveBeenCalledTimes(1);
      expect(novedadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          minutosTarde: 5,
        }),
      );
    });
  });

  describe('edge — attendance not found', () => {
    it('returns early without error when attendance is not found', async () => {
      const attendanceRepo = makeMockAttendanceRepo(null); // null = not found
      const policyRepo = makeMockPolicyRepo();
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await expect(
        service.checkAndCreateLateArrivalNovedad('att-missing'),
      ).resolves.toBeUndefined();

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });

  describe('edge — no policy found', () => {
    it('returns early without error when no policy is resolved', async () => {
      const attendance = makeAttendance();
      const attendanceRepo = makeMockAttendanceRepo(attendance);
      const policyRepo = makeMockPolicyRepo(null); // null = no policy
      const novedadCreate = jest.fn();
      const novedadRepo = makeMockNovedadRepo(novedadCreate);

      const service = new LateArrivalNovedadService(attendanceRepo, policyRepo, novedadRepo);
      await expect(
        service.checkAndCreateLateArrivalNovedad('att-a1'),
      ).resolves.toBeUndefined();

      expect(novedadCreate).not.toHaveBeenCalled();
    });
  });
});
