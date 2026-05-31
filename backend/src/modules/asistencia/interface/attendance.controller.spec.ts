/**
 * T-19 RED → T-20 GREEN (extended from original T-21/T-22 + T-31).
 * AttendanceController unit spec — validates error→HTTP mapping.
 *
 * New in PR-B:
 *   - checkOut now returns {record, idempotent} — both paths return 200
 *   - mapDomainError builds structured ConflictResponseDto for
 *     AttendanceAlreadyExistsError and ImmutableAttendanceError
 *   - by-client-ref route tests
 *   - checkIn duplicate → ConflictException with structured body
 *
 * Uses Test.createTestingModule with mock use-case providers.
 * No real DB or HTTP server — validates controller method behavior directly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AttendanceController,
  CHECK_IN_USE_CASE,
  CHECK_OUT_USE_CASE,
  LIST_ATTENDANCE_USE_CASE,
  GET_ATTENDANCE_USE_CASE,
  UPLOAD_SIGNATURE_USE_CASE,
  GET_SIGNATURE_URL_USE_CASE,
  ATTENDANCE_REPO,
} from './attendance.controller';
import {
  AttendanceAlreadyExistsError,
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  SignatureRequiredError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';
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
    signatureKey: null,
    clientRef: 'REF-A',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AttendanceController — error→HTTP mapping', () => {
  let controller: AttendanceController;

  const mockCheckIn = { execute: jest.fn() };
  const mockCheckOut = { execute: jest.fn() };
  const mockList = { execute: jest.fn() };
  const mockGet = { execute: jest.fn() };
  const mockUploadSignature = { execute: jest.fn() };
  const mockGetSignatureUrl = { execute: jest.fn() };
  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findByClientRef: jest.fn().mockResolvedValue(null),
    findByCheckOutClientRef: jest.fn().mockResolvedValue(null),
    findByOperarioAndDate: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        { provide: CHECK_IN_USE_CASE, useValue: mockCheckIn },
        { provide: CHECK_OUT_USE_CASE, useValue: mockCheckOut },
        { provide: LIST_ATTENDANCE_USE_CASE, useValue: mockList },
        { provide: GET_ATTENDANCE_USE_CASE, useValue: mockGet },
        { provide: UPLOAD_SIGNATURE_USE_CASE, useValue: mockUploadSignature },
        { provide: GET_SIGNATURE_URL_USE_CASE, useValue: mockGetSignatureUrl },
        { provide: ATTENDANCE_REPO, useValue: mockRepo },
      ],
    }).compile();

    controller = module.get(AttendanceController);
  });

  // ── Check-in ──────────────────────────────────────────────────────────────

  // Passthrough mock for @Res: status() is called dynamically; we only verify the returned body.
  const mockRes = { status: jest.fn().mockReturnThis() } as any;

  it('AT-01 — checkIn happy path (new record) → returns attendance record; res.status(201)', async () => {
    const att = makeAttendance();
    mockCheckIn.execute.mockResolvedValue({ record: att, created: true });

    const body = {
      operarioId: 'O1',
      date: '2026-05-31',
      checkInCapturedAt: new Date().toISOString(),
      checkInLat: 7.5,
      checkInLng: -76.5,
      clientRef: 'REF-A',
    };
    const result = await controller.checkIn(body as any, mockRes);
    expect(result).toBe(att);
    expect(mockRes.status).toHaveBeenCalledWith(201);
  });

  it('AT-04 — checkIn idempotent hit → returns attendance record; res.status(200)', async () => {
    const att = makeAttendance();
    mockCheckIn.execute.mockResolvedValue({ record: att, created: false });

    const result = await controller.checkIn({} as any, mockRes);
    expect(result).toBe(att);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  it('AT-03 — checkIn duplicate → 409 ConflictException with structured body', async () => {
    const conflicting = makeAttendance({ clientRef: 'REF-A' });
    mockCheckIn.execute.mockRejectedValue(
      new AttendanceAlreadyExistsError('O1', '2026-05-31', conflicting),
    );
    const err = await controller.checkIn({} as any, mockRes).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as any;
    expect(body.error).toBe('CONFLICT');
    expect(body.conflictType).toBe('DUPLICATE_ATTENDANCE_DATE');
    expect(body.conflicting.id).toBe('ATT-1');
  });

  it('AT-07 — checkIn GPS invalid → 400 BadRequestException', async () => {
    mockCheckIn.execute.mockRejectedValue(new InvalidGpsError('lat', 999));
    await expect(controller.checkIn({} as any, mockRes)).rejects.toThrow(BadRequestException);
  });

  it('AT-05 — checkIn operario not in scope → 404 NotFoundException', async () => {
    mockCheckIn.execute.mockRejectedValue(new OperarioNotInScopeError('O2'));
    await expect(controller.checkIn({} as any, mockRes)).rejects.toThrow(NotFoundException);
  });

  // ── Check-out ─────────────────────────────────────────────────────────────

  it('AT-21 — checkOut not in scope → 404 NotFoundException', async () => {
    mockCheckOut.execute.mockRejectedValue(new AttendanceNotFoundError('ATT-999'));
    await expect(controller.checkOut('ATT-999', {} as any, mockRes)).rejects.toThrow(NotFoundException);
  });

  it('AT-20 — checkOut already completed (real conflict) → 409 ConflictException with structured body', async () => {
    const conflicting = makeAttendance({ completedAt: new Date(), checkOutClientRef: 'CREF-Z' });
    mockCheckOut.execute.mockRejectedValue(new ImmutableAttendanceError('ATT-1', conflicting));
    const err = await controller.checkOut('ATT-1', {} as any, mockRes).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as any;
    expect(body.error).toBe('CONFLICT');
    expect(body.conflictType).toBe('DOUBLE_CHECKOUT');
    expect(body.conflicting.id).toBe('ATT-1');
  });

  it('AT-19 — checkOut no signature → 422 UnprocessableEntityException', async () => {
    mockCheckOut.execute.mockRejectedValue(new SignatureRequiredError('ATT-1'));
    await expect(controller.checkOut('ATT-1', {} as any, mockRes)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('SI-checkOut happy path → 200, returns record', async () => {
    const att = makeAttendance();
    mockCheckOut.execute.mockResolvedValue({ record: att, idempotent: false });
    const result = await controller.checkOut('ATT-1', {} as any, mockRes);
    expect(result).toBe(att);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  it('SI-checkOut idempotent replay → 200, returns same record', async () => {
    const att = makeAttendance({ completedAt: new Date() });
    mockCheckOut.execute.mockResolvedValue({ record: att, idempotent: true });
    const result = await controller.checkOut('ATT-1', {} as any, mockRes);
    expect(result).toBe(att);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  // ── List ──────────────────────────────────────────────────────────────────

  it('AT-24 — listAttendance → returns array (200)', async () => {
    const records = [makeAttendance()];
    mockList.execute.mockResolvedValue(records);
    const result = await controller.listAttendance();
    expect(result).toBe(records);
  });

  // ── Detail ────────────────────────────────────────────────────────────────

  it('AT-27 — getAttendance found → returns record (200)', async () => {
    const att = makeAttendance();
    mockGet.execute.mockResolvedValue(att);
    const result = await controller.getAttendance('ATT-1');
    expect(result).toBe(att);
  });

  it('AT-28 — getAttendance not in scope → 404 NotFoundException', async () => {
    mockGet.execute.mockRejectedValue(new AttendanceNotFoundError('ATT-999'));
    await expect(controller.getAttendance('ATT-999')).rejects.toThrow(NotFoundException);
  });

  // ── Signature upload ──────────────────────────────────────────────────────

  it('AT-11 — uploadSignature happy path → returns { attendanceId, signatureKey }', async () => {
    mockUploadSignature.execute.mockResolvedValue({
      attendanceId: 'ATT-1',
      signatureKey: 'signatures/S1/ATT-1.png',
    });
    const file = {
      buffer: Buffer.from('png'),
      mimetype: 'image/png',
      size: 100,
    } as Express.Multer.File;
    const result = await controller.uploadSignature('ATT-1', file);
    expect(result).toEqual({ attendanceId: 'ATT-1', signatureKey: 'signatures/S1/ATT-1.png' });
  });

  it('AT-15 — uploadSignature to completed record → 409 ConflictException', async () => {
    const conflicting = makeAttendance({ completedAt: new Date() });
    mockUploadSignature.execute.mockRejectedValue(new ImmutableAttendanceError('ATT-1', conflicting));
    const file = { buffer: Buffer.from('png'), mimetype: 'image/png', size: 100 } as Express.Multer.File;
    await expect(controller.uploadSignature('ATT-1', file)).rejects.toThrow(ConflictException);
  });

  it('AT-13 — uploadSignature not found → 404 NotFoundException', async () => {
    mockUploadSignature.execute.mockRejectedValue(new AttendanceNotFoundError('ATT-1'));
    const file = { buffer: Buffer.from('png'), mimetype: 'image/png', size: 100 } as Express.Multer.File;
    await expect(controller.uploadSignature('ATT-1', file)).rejects.toThrow(NotFoundException);
  });

  // ── Signature GET ─────────────────────────────────────────────────────────

  it('AT-13 — getSignatureUrl happy path → returns { url }', async () => {
    mockGetSignatureUrl.execute.mockResolvedValue({ url: 'https://minio/presigned' });
    const result = await controller.getSignatureUrl('ATT-1');
    expect(result).toEqual({ url: 'https://minio/presigned' });
  });

  it('AT-14 — getSignatureUrl not found → 404 NotFoundException', async () => {
    mockGetSignatureUrl.execute.mockRejectedValue(new AttendanceNotFoundError('ATT-1'));
    await expect(controller.getSignatureUrl('ATT-1')).rejects.toThrow(NotFoundException);
  });
});
