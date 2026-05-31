/**
 * T-28 — Controller unit spec for NovedadController
 *
 * Tests HTTP status codes and response shape with mocked use-cases.
 * No real DI — each test instantiates controller directly with mocks.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');
import {
  NovedadController,
  CREATE_NOVEDAD_USE_CASE,
  APPROVE_NOVEDAD_USE_CASE,
  REJECT_NOVEDAD_USE_CASE,
  CANCEL_NOVEDAD_USE_CASE,
  GET_NOVEDAD_USE_CASE,
  LIST_NOVEDADES_USE_CASE,
} from './novedad.controller';
import {
  NovedadNotFoundError,
  NovedadAlreadyExistsError,
  AttendanceNotCompletedError,
  ImmutableNovedadError,
  InvalidHorasExtraError,
  AttendanceNotFoundError,
} from '../domain/novedad.errors';
import { AuthModule } from '../../auth/auth.module';
import { IamModule } from '../../iam/iam.module';
import { PrismaModule } from '../../../database/prisma.module';
import { ConfigModule } from '@nestjs/config';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNovedad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nov-1',
    attendanceId: 'att-a1',
    supervisorId: 'sup-s1',
    zoneId: 'zone-z1',
    horasExtra: '2.50',
    motivo: null,
    status: 'PENDING',
    approvedByUserId: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NovedadController (unit — mocked use-cases)', () => {
  let app: INestApplication;

  const mockCreateUseCase = { execute: jest.fn().mockResolvedValue(makeNovedad()) };
  const mockApproveUseCase = { execute: jest.fn().mockResolvedValue(makeNovedad({ status: 'APPROVED' })) };
  const mockRejectUseCase = { execute: jest.fn().mockResolvedValue(makeNovedad({ status: 'REJECTED' })) };
  const mockCancelUseCase = { execute: jest.fn().mockResolvedValue(undefined) };
  const mockGetUseCase = { execute: jest.fn().mockResolvedValue(makeNovedad()) };
  const mockListUseCase = { execute: jest.fn().mockResolvedValue([makeNovedad()]) };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: use-case returns { record, created: true } (new shape)
    mockCreateUseCase.execute.mockResolvedValue({ record: makeNovedad(), created: true });
    mockApproveUseCase.execute.mockResolvedValue(makeNovedad({ status: 'APPROVED' }));
    mockRejectUseCase.execute.mockResolvedValue(makeNovedad({ status: 'REJECTED' }));
    mockCancelUseCase.execute.mockResolvedValue(undefined);
    mockGetUseCase.execute.mockResolvedValue(makeNovedad());
    mockListUseCase.execute.mockResolvedValue([makeNovedad()]);
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        IamModule,
      ],
      controllers: [NovedadController],
      providers: [
        { provide: CREATE_NOVEDAD_USE_CASE, useValue: mockCreateUseCase },
        { provide: APPROVE_NOVEDAD_USE_CASE, useValue: mockApproveUseCase },
        { provide: REJECT_NOVEDAD_USE_CASE, useValue: mockRejectUseCase },
        { provide: CANCEL_NOVEDAD_USE_CASE, useValue: mockCancelUseCase },
        { provide: GET_NOVEDAD_USE_CASE, useValue: mockGetUseCase },
        { provide: LIST_NOVEDADES_USE_CASE, useValue: mockListUseCase },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── clientRef idempotency + status code switching ────────────────────────

  describe('T-17 — createNovedad: 201 vs 200 based on use-case result.created', () => {
    it('use-case returns { record, created: true } → 201', async () => {
      mockCreateUseCase.execute.mockResolvedValue({ record: makeNovedad(), created: true });
      const resp = await request(app.getHttpServer())
        .post('/asistencia/att-a1/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '2.00' })
        .expect(201);
      expect((resp.body as Record<string, unknown>).id).toBe('nov-1');
    });

    it('use-case returns { record, created: false } → 200 (idempotent replay)', async () => {
      mockCreateUseCase.execute.mockResolvedValue({ record: makeNovedad(), created: false });
      const resp = await request(app.getHttpServer())
        .post('/asistencia/att-a1/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '2.00', clientRef: 'uuid-x' })
        .expect(200);
      expect((resp.body as Record<string, unknown>).id).toBe('nov-1');
    });

    it('clientRef in body is forwarded to use-case', async () => {
      mockCreateUseCase.execute.mockResolvedValue({ record: makeNovedad({ clientRef: 'uuid-x' }), created: true });
      await request(app.getHttpServer())
        .post('/asistencia/att-a1/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '2.00', clientRef: 'uuid-x' })
        .expect(201);
      expect(mockCreateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ clientRef: 'uuid-x' }),
      );
    });
  });

  // ── Error mapping ─────────────────────────────────────────────────────────

  describe('error → HTTP code mapping', () => {
    it('NovedadNotFoundError → 404', async () => {
      mockGetUseCase.execute.mockRejectedValue(new NovedadNotFoundError('x'));
      await request(app.getHttpServer())
        .get('/novedades/x')
        .set('Authorization', 'Bearer skip')  // skipped by controller (no real auth guard here)
        .expect(404);
    });

    it('AttendanceNotFoundError → 404', async () => {
      mockCreateUseCase.execute.mockRejectedValue(new AttendanceNotFoundError('att-x'));
      await request(app.getHttpServer())
        .post('/asistencia/att-x/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '1.00' })
        .expect(404);
    });

    it('NovedadAlreadyExistsError → 409', async () => {
      mockCreateUseCase.execute.mockRejectedValue(new NovedadAlreadyExistsError('att-x'));
      await request(app.getHttpServer())
        .post('/asistencia/att-x/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '1.00' })
        .expect(409);
    });

    it('AttendanceNotCompletedError → 409', async () => {
      mockCreateUseCase.execute.mockRejectedValue(new AttendanceNotCompletedError('att-x'));
      await request(app.getHttpServer())
        .post('/asistencia/att-x/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '1.00' })
        .expect(409);
    });

    it('ImmutableNovedadError → 409', async () => {
      mockApproveUseCase.execute.mockRejectedValue(new ImmutableNovedadError('nov-1'));
      await request(app.getHttpServer())
        .patch('/novedades/nov-1/approve')
        .set('Authorization', 'Bearer skip')
        .expect(409);
    });

    it('InvalidHorasExtraError → 400', async () => {
      mockCreateUseCase.execute.mockRejectedValue(new InvalidHorasExtraError('0'));
      await request(app.getHttpServer())
        .post('/asistencia/att-x/novedades')
        .set('Authorization', 'Bearer skip')
        .send({ horasExtra: '0' })
        .expect(400);
    });
  });
});
