/**
 * T-18 — Unit tests for OperarioController (RED → GREEN).
 *
 * Tests route existence and error→HTTP mapping.
 * Mocks use-cases via injection tokens.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');
import { OperarioController } from './operario.controller';
import {
  CREATE_OPERARIO_USE_CASE,
  DEACTIVATE_OPERARIO_USE_CASE,
  REACTIVATE_OPERARIO_USE_CASE,
  BULK_IMPORT_OPERARIOS_USE_CASE,
  CREATE_SUPERVISOR_USE_CASE,
  REASSIGN_OPERARIO_USE_CASE,
} from './operario.controller';
import {
  DuplicateDocumentoError,
  OperarioSupervisorNotFoundError,
  AlreadyInactiveError,
  AlreadyActiveError,
  OperarioNotFoundError,
} from '../domain/operario.errors';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';

// ─── Mock guards ─────────────────────────────────────────────────────────────

const mockRolesGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

// ─── Shared DTO factories ─────────────────────────────────────────────────────

const sampleDto = {
  id: 'op-1',
  fullName: 'Test Worker',
  documento: '12345678',
  supervisorId: 'sup-1',
  active: true,
  deactivatedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('OperarioController', () => {
  let app: INestApplication;
  let createUseCase: { execute: jest.Mock };
  let deactivateUseCase: { execute: jest.Mock };
  let reactivateUseCase: { execute: jest.Mock };
  let bulkImportUseCase: { execute: jest.Mock };
  let createSupervisorUseCase: { execute: jest.Mock };
  let reassignUseCase: { execute: jest.Mock };

  const sampleImportResult = { imported: 2, failed: 0, errors: [] };

  beforeEach(async () => {
    createUseCase = { execute: jest.fn().mockResolvedValue({ id: 'op-1' }) };
    deactivateUseCase = { execute: jest.fn().mockResolvedValue({ ...sampleDto, active: false, deactivatedAt: new Date().toISOString() }) };
    reactivateUseCase = { execute: jest.fn().mockResolvedValue({ ...sampleDto, active: true, deactivatedAt: null }) };
    bulkImportUseCase = { execute: jest.fn().mockResolvedValue(sampleImportResult) };
    createSupervisorUseCase = { execute: jest.fn().mockResolvedValue({ id: 'sup-1' }) };
    reassignUseCase = { execute: jest.fn().mockResolvedValue(sampleDto) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperarioController],
      providers: [
        { provide: CREATE_OPERARIO_USE_CASE, useValue: createUseCase },
        { provide: DEACTIVATE_OPERARIO_USE_CASE, useValue: deactivateUseCase },
        { provide: REACTIVATE_OPERARIO_USE_CASE, useValue: reactivateUseCase },
        { provide: BULK_IMPORT_OPERARIOS_USE_CASE, useValue: bulkImportUseCase },
        { provide: CREATE_SUPERVISOR_USE_CASE, useValue: createSupervisorUseCase },
        { provide: REASSIGN_OPERARIO_USE_CASE, useValue: reassignUseCase },
        Reflector,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Routes ────────────────────────────────────────────────────────────────

  describe('POST /iam/operarios — create', () => {
    it('returns 201 on valid body', async () => {
      const resp = await request(app.getHttpServer())
        .post('/iam/operarios')
        .send({ fullName: 'Ana Lopez', documento: '99887766', supervisorId: 'sup-1' })
        .expect(201);

      expect(resp.body).toHaveProperty('id', 'op-1');
      expect(createUseCase.execute).toHaveBeenCalledWith({
        fullName: 'Ana Lopez',
        documento: '99887766',
        supervisorId: 'sup-1',
        cargo: '',
      });
    });

    it('returns 400 on missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .send({ documento: '123' }) // missing fullName, supervisorId
        .expect(400);
    });

    it('maps DuplicateDocumentoError → 409', async () => {
      createUseCase.execute.mockRejectedValue(new DuplicateDocumentoError('12345678'));
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .send({ fullName: 'Test', documento: '12345678', supervisorId: 'sup-1' })
        .expect(409);
    });

    it('maps OperarioSupervisorNotFoundError → 400', async () => {
      createUseCase.execute.mockRejectedValue(new OperarioSupervisorNotFoundError('bad-id'));
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .send({ fullName: 'Test', documento: '12345678', supervisorId: 'bad-id' })
        .expect(400);
    });
  });

  describe('PATCH /iam/operarios/:id/deactivate', () => {
    it('returns 200 on active operario', async () => {
      await request(app.getHttpServer())
        .patch('/iam/operarios/op-1/deactivate')
        .expect(200);

      expect(deactivateUseCase.execute).toHaveBeenCalledWith('op-1');
    });

    it('maps AlreadyInactiveError → 409', async () => {
      deactivateUseCase.execute.mockRejectedValue(new AlreadyInactiveError('op-1'));
      await request(app.getHttpServer())
        .patch('/iam/operarios/op-1/deactivate')
        .expect(409);
    });

    it('maps OperarioNotFoundError → 404', async () => {
      deactivateUseCase.execute.mockRejectedValue(new OperarioNotFoundError('ghost'));
      await request(app.getHttpServer())
        .patch('/iam/operarios/ghost/deactivate')
        .expect(404);
    });
  });

  describe('PATCH /iam/operarios/:id/reactivate', () => {
    it('returns 200 on inactive operario', async () => {
      await request(app.getHttpServer())
        .patch('/iam/operarios/op-2/reactivate')
        .expect(200);

      expect(reactivateUseCase.execute).toHaveBeenCalledWith('op-2');
    });

    it('maps AlreadyActiveError → 409', async () => {
      reactivateUseCase.execute.mockRejectedValue(new AlreadyActiveError('op-1'));
      await request(app.getHttpServer())
        .patch('/iam/operarios/op-1/reactivate')
        .expect(409);
    });

    it('maps OperarioNotFoundError → 404', async () => {
      reactivateUseCase.execute.mockRejectedValue(new OperarioNotFoundError('ghost'));
      await request(app.getHttpServer())
        .patch('/iam/operarios/ghost/reactivate')
        .expect(404);
    });
  });

  // ─── Import route ─────────────────────────────────────────────────────────

  describe('POST /iam/operarios/import', () => {
    const csvBuffer = Buffer.from(
      'fullName,documento,supervisorEmail\nJuan Perez,12345,sup@test.co\n',
    );

    it('returns 200 with ImportResultDto on valid CSV upload', async () => {
      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .attach('file', csvBuffer, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body).toEqual(sampleImportResult);
      expect(bulkImportUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .expect(400);
    });

    it('returns 400 for unsupported file extension (.txt)', async () => {
      const txtBuffer = Buffer.from('some text content');
      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .attach('file', txtBuffer, { filename: 'data.txt', contentType: 'text/plain' })
        .expect(400);
    });

    it('returns 400 for header-only CSV (no data rows)', async () => {
      const emptyBuf = Buffer.from('fullName,documento,supervisorEmail\n');
      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .attach('file', emptyBuf, { filename: 'empty.csv', contentType: 'text/csv' })
        .expect(400);
    });
  });
});
