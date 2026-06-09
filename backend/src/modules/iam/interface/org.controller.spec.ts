/**
 * T-70 — Unit tests for OrgController.
 *
 * Written FIRST (TDD red phase) — fails before the controller exists.
 *
 * Verifies:
 * - GET /org/zones → delegates to orgRepo.findZones(), returns 200 with data.
 * - GET /org/municipios → delegates to orgRepo.findMunicipios(), returns 200 with data.
 * - POST /org/coordinadores/assign → delegates to assignUseCase.execute(), returns 200.
 * - POST /org/users → delegates to provisionUseCase.execute(), returns 201.
 * - Domain error → HTTP status mapping:
 *   ZoneNotFoundError → 404
 *   UserNotFoundError → 404
 *   InvalidCoordinadorRoleError → 400
 *   UnsupportedProvisionRoleError → 400
 *   EmailInUseError → 409
 *   ForbiddenException → 403 (privilege-escalation — NestJS already handles this)
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrgController } from './org.controller';
import type { AssignCoordinadorToZoneUseCase } from '../application/assign-coordinador-to-zone.use-case';
import type { ProvisionManagementUserUseCase } from '../application/provision-management-user.use-case';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import {
  ZoneNotFoundError,
  UserNotFoundError,
  InvalidCoordinadorRoleError,
  UnsupportedProvisionRoleError,
  EmailInUseError,
} from '../domain/org.errors';
import { ASSIGN_COORDINADOR_USE_CASE, PROVISION_MANAGEMENT_USER_USE_CASE, ORG_REPO } from './org.controller';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeRepo(): jest.Mocked<OrgRepositoryPort> {
  return {
    createManagementUser: jest.fn().mockResolvedValue({ id: 'new-id' }),
    assignCoordinador: jest.fn().mockResolvedValue(undefined),
    findZones: jest.fn().mockResolvedValue([
      { id: 'zone-1', name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() },
    ]),
    findMunicipios: jest.fn().mockResolvedValue([
      { id: 'mun-1', name: 'Apartadó', zoneId: 'zone-1', createdAt: new Date(), updatedAt: new Date() },
    ]),
    createZone: jest.fn().mockResolvedValue({ id: 'new-zone-id' }),
    updateZone: jest.fn().mockResolvedValue({ id: 'zone-1', name: 'Renamed', createdAt: new Date(), updatedAt: new Date() }),
    deleteZone: jest.fn().mockResolvedValue(undefined),
    createMunicipio: jest.fn().mockResolvedValue({ id: 'new-muni-id' }),
    updateMunicipio: jest.fn().mockResolvedValue({ id: 'mun-1', name: 'Renamed', zoneId: 'zone-1', createdAt: new Date(), updatedAt: new Date() }),
    deleteMunicipio: jest.fn().mockResolvedValue(undefined),
    findUsers: jest.fn().mockResolvedValue([
      {
        id: 'user-1',
        email: 'admin@futuragest.co',
        role: 'SYSTEM_ADMIN',
        mustChangePassword: false,
        coordinatedZoneId: null,
        createdAt: new Date(),
      },
    ]),
  };
}

function makeAssignUseCase(): jest.Mocked<Pick<AssignCoordinadorToZoneUseCase, 'execute'>> {
  return { execute: jest.fn().mockResolvedValue(undefined) };
}

function makeProvisionUseCase(): jest.Mocked<Pick<ProvisionManagementUserUseCase, 'execute'>> {
  return { execute: jest.fn().mockResolvedValue({ id: 'provisioned-id' }) };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function buildModule(overrides?: {
  repo?: Partial<jest.Mocked<OrgRepositoryPort>>;
  assignUseCase?: Partial<jest.Mocked<Pick<AssignCoordinadorToZoneUseCase, 'execute'>>>;
  provisionUseCase?: Partial<jest.Mocked<Pick<ProvisionManagementUserUseCase, 'execute'>>>;
}): Promise<OrgController> {
  const repo = { ...makeRepo(), ...overrides?.repo };
  const assignUseCase = { ...makeAssignUseCase(), ...overrides?.assignUseCase };
  const provisionUseCase = { ...makeProvisionUseCase(), ...overrides?.provisionUseCase };

  const module: TestingModule = await Test.createTestingModule({
    controllers: [OrgController],
    providers: [
      { provide: ORG_REPO, useValue: repo },
      { provide: ASSIGN_COORDINADOR_USE_CASE, useValue: assignUseCase },
      { provide: PROVISION_MANAGEMENT_USER_USE_CASE, useValue: provisionUseCase },
    ],
  }).compile();

  return module.get(OrgController);
}

// ─── GET /org/zones ───────────────────────────────────────────────────────────

describe('OrgController — GET /org/zones', () => {
  it('returns zones from orgRepo.findZones()', async () => {
    const controller = await buildModule();
    const result = await controller.listZones();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'zone-1');
  });
});

// ─── GET /org/municipios ──────────────────────────────────────────────────────

describe('OrgController — GET /org/municipios', () => {
  it('returns municipios from orgRepo.findMunicipios()', async () => {
    const controller = await buildModule();
    const result = await controller.listMunicipios();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'mun-1');
  });
});

// ─── POST /org/coordinadores/assign ──────────────────────────────────────────

describe('OrgController — POST /org/coordinadores/assign', () => {
  it('delegates to assignUseCase.execute() and returns void (200)', async () => {
    const controller = await buildModule();
    const result = await controller.assignCoordinador({ userId: 'user-1', zoneId: 'zone-1' });
    expect(result).toBeUndefined();
  });

  it('maps ZoneNotFoundError → NotFoundException (404)', async () => {
    const controller = await buildModule({
      assignUseCase: {
        execute: jest.fn().mockRejectedValue(new ZoneNotFoundError('z-1')),
      },
    });
    await expect(controller.assignCoordinador({ userId: 'u', zoneId: 'z-1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('maps UserNotFoundError → NotFoundException (404)', async () => {
    const controller = await buildModule({
      assignUseCase: {
        execute: jest.fn().mockRejectedValue(new UserNotFoundError('u-1')),
      },
    });
    await expect(controller.assignCoordinador({ userId: 'u-1', zoneId: 'z' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('maps InvalidCoordinadorRoleError → BadRequestException (400)', async () => {
    const controller = await buildModule({
      assignUseCase: {
        execute: jest.fn().mockRejectedValue(new InvalidCoordinadorRoleError('SUPERVISOR')),
      },
    });
    await expect(controller.assignCoordinador({ userId: 'u', zoneId: 'z' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── POST /org/users ──────────────────────────────────────────────────────────

describe('OrgController — POST /org/users', () => {
  it('delegates to provisionUseCase.execute() and returns 201 with id', async () => {
    const controller = await buildModule();
    const result = await controller.provisionUser({
      email: 'g@test.co',
      password: 'Temp1234!',
      role: 'GERENCIA',
    });
    expect(result).toHaveProperty('id', 'provisioned-id');
  });

  it('maps UnsupportedProvisionRoleError → BadRequestException (400)', async () => {
    const controller = await buildModule({
      provisionUseCase: {
        execute: jest.fn().mockRejectedValue(new UnsupportedProvisionRoleError('OPERARIO')),
      },
    });
    await expect(
      controller.provisionUser({ email: 'x@test.co', password: 'p', role: 'OPERARIO' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps EmailInUseError → ConflictException (409)', async () => {
    const controller = await buildModule({
      provisionUseCase: {
        execute: jest.fn().mockRejectedValue(new EmailInUseError('dup@test.co')),
      },
    });
    await expect(
      controller.provisionUser({ email: 'dup@test.co', password: 'p', role: 'GERENCIA' }),
    ).rejects.toThrow(ConflictException);
  });

  it('re-throws ForbiddenException from use-case (privilege-escalation → 403)', async () => {
    const controller = await buildModule({
      provisionUseCase: {
        execute: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('Privilege escalation denied')),
      },
    });
    await expect(
      controller.provisionUser({ email: 'g@test.co', password: 'p', role: 'GERENCIA' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
