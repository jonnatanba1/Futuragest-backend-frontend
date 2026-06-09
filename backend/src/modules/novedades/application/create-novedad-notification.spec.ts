/**
 * TDD spec — CreateNovedadUseCase fire-and-forget notification isolation
 *
 * Spec: PN-1  — notifyNovedadCreated called after genuine create (created===true)
 * Spec: PN-2  — notifyNovedadCreated NOT called on idempotent replay (created===false)
 * Spec: PN-3  — notification failure does NOT affect novedad response (novedad still 201)
 * Spec: PN-4  — notification error is swallowed (catch+log), not rethrown
 * Spec: PN-5  — notification port receives correct payload (novedadId, horasExtra, supervisorId, zoneId)
 *
 * These are PURE unit tests — no DB, no NestJS bootstrapping.
 * Written FIRST (TDD RED) before implementing the notification wiring in the use case.
 */

import { CreateNovedadUseCase } from './create-novedad.use-case';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type { NotificationPort, NovedadCreatedPayload } from '../../notifications/domain/notification.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScopeHolder(): ScopeContextHolder {
  return {
    current: () => ({
      userId: 'user-sup',
      role: 'SUPERVISOR',
      supervisorId: 'sup-s1',
      zoneId: 'zone-z1',
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

function makeMockNotificationPort(overrides: Partial<NotificationPort> = {}): NotificationPort {
  return {
    notifyNovedadCreated: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CreateNovedadUseCase — notification fire-and-forget', () => {
  describe('PN-1 — notifyNovedadCreated called once on genuine create (created===true)', () => {
    it('calls notificationPort.notifyNovedadCreated after persisting the novedad', async () => {
      const notificationPort = makeMockNotificationPort();
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.50' });

      // Novedad created
      expect(result.created).toBe(true);
      expect(result.record.id).toBe('nov-1');

      // Give the fire-and-forget promise time to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(notificationPort.notifyNovedadCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('PN-5 — notification payload contains correct fields', () => {
    it('passes novedadId, horasExtra, supervisorId, zoneId to the port', async () => {
      const notificationPort = makeMockNotificationPort();
      const novedad = makeNovedad({ id: 'nov-x', supervisorId: 'sup-s1', zoneId: 'zone-z1', horasExtra: '3.00' as unknown });
      const novedadRepo = makeMockNovedadRepo({ create: jest.fn().mockResolvedValue(novedad) });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort);
      await useCase.execute({ attendanceId: 'att-a1', horasExtra: '3.00' });

      await new Promise((r) => setTimeout(r, 0));

      const call = (notificationPort.notifyNovedadCreated as jest.Mock).mock.calls[0][0] as NovedadCreatedPayload;
      expect(call.novedadId).toBe('nov-x');
      expect(call.supervisorId).toBe('sup-s1');
      expect(call.zoneId).toBe('zone-z1');
      // P2-1: horasExtra is formatted to a fixed 2-decimal string (3 → "3.00")
      expect(call.horasExtra).toBe('3.00');
    });
  });

  describe('PN-2 — notifyNovedadCreated NOT called on idempotent replay (created===false)', () => {
    it('does not call notificationPort when findByClientRef returns existing record', async () => {
      const existing = makeNovedad({ id: 'nov-existing', clientRef: 'uuid-replay' });
      const notificationPort = makeMockNotificationPort();
      const novedadRepo = makeMockNovedadRepo({
        findByClientRef: jest.fn().mockResolvedValue(existing),
      });
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.00', clientRef: 'uuid-replay' });

      await new Promise((r) => setTimeout(r, 0));

      expect(result.created).toBe(false);
      expect(notificationPort.notifyNovedadCreated).not.toHaveBeenCalled();
    });
  });

  describe('PN-3 — notification failure does NOT affect novedad response', () => {
    it('use case returns { record, created: true } even when notificationPort rejects', async () => {
      const notificationPort = makeMockNotificationPort({
        notifyNovedadCreated: jest.fn().mockRejectedValue(new Error('FCM network error')),
      });
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort);

      // Must NOT throw — novedad response is unaffected
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.50' });

      await new Promise((r) => setTimeout(r, 0));

      expect(result.created).toBe(true);
      expect(result.record.id).toBe('nov-1');
    });
  });

  describe('PN-4 — notification error is swallowed, does not propagate', () => {
    it('does NOT throw when notificationPort throws synchronously', async () => {
      const notificationPort = makeMockNotificationPort({
        notifyNovedadCreated: jest.fn().mockRejectedValue(new Error('Port unavailable')),
      });
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort);

      await expect(
        useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.50' }),
      ).resolves.not.toThrow();

      await new Promise((r) => setTimeout(r, 0));
    });
  });

  describe('PN-6 — no notification port provided (backward compat): use case still works', () => {
    it('works without a notification port (optional dep)', async () => {
      const novedadRepo = makeMockNovedadRepo();
      const attendanceRepo = makeMockAttendanceRepo();
      const scopeHolder = makeScopeHolder();

      // No notification port passed — use case must still function
      const useCase = new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder);
      const result = await useCase.execute({ attendanceId: 'att-a1', horasExtra: '2.50' });

      expect(result.created).toBe(true);
    });
  });
});
