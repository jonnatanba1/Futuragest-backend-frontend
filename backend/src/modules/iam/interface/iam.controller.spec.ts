/**
 * T-20 — Unit tests for IamController.listOperarios includeInactive filter.
 *
 * Asserts:
 *   - Without ?includeInactive → findMany called with { deactivatedAt: null }
 *   - With ?includeInactive=true → findMany called with {} (all rows)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');
import { IamController } from './iam.controller';
import { ScopedSupervisorRepository } from '../infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from '../infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from '../infrastructure/scoped-assignment.repository';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';

describe('IamController — listOperarios includeInactive filter', () => {
  let app: INestApplication;
  let operarioFindMany: jest.Mock;

  beforeEach(async () => {
    operarioFindMany = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IamController],
      providers: [
        {
          provide: ScopedSupervisorRepository,
          useValue: { findMany: jest.fn().mockResolvedValue([]), findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: ScopedOperarioRepository,
          useValue: { findMany: operarioFindMany, findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: ScopedAssignmentRepository,
          useValue: { findMany: jest.fn().mockResolvedValue([]), findById: jest.fn().mockResolvedValue(null) },
        },
        Reflector,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('default: calls findMany with { deactivatedAt: null } (excludes inactive)', async () => {
    await request(app.getHttpServer())
      .get('/iam/operarios')
      .expect(200);

    expect(operarioFindMany).toHaveBeenCalledWith({ deactivatedAt: null });
  });

  it('?includeInactive=true: calls findMany with {} (includes all)', async () => {
    await request(app.getHttpServer())
      .get('/iam/operarios?includeInactive=true')
      .expect(200);

    expect(operarioFindMany).toHaveBeenCalledWith({});
  });

  it('?includeInactive=false: still excludes inactive (non-true value → default behavior)', async () => {
    await request(app.getHttpServer())
      .get('/iam/operarios?includeInactive=false')
      .expect(200);

    expect(operarioFindMany).toHaveBeenCalledWith({ deactivatedAt: null });
  });
});
