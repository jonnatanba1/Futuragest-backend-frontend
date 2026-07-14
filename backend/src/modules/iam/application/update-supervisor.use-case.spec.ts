/**
 * Unit tests for UpdateSupervisorUseCase.
 *
 * Verifies:
 * - Happy path: updates municipio and area, returns SupervisorWithUser.
 * - Happy path: updates displayName on related User.
 * - SupervisorNotFoundError when supervisor does not exist.
 * - MunicipioNotFoundError when municipio does not exist.
 * - MunicipioNotInZoneError when municipio is in a different zone.
 */

import { UpdateSupervisorUseCase } from './update-supervisor.use-case';
import type { ScopedSupervisorRepository } from '../infrastructure/scoped-supervisor.repository';
import type { ScopedMunicipioRepository } from '../infrastructure/scoped-municipio.repository';
import {
  SupervisorNotFoundError,
  MunicipioNotFoundError,
  MunicipioNotInZoneError,
} from '../domain/org.errors';
import type { Supervisor, Municipio } from '@prisma/client';

// ─── Test doubles ─────────────────────────────────────────────────────────────

const SUP_ID = 'sup-uuid-1';
const ZONE_ID = 'zone-uuid-1';
const OLD_MUNI_ID = 'muni-old';
const NEW_MUNI_ID = 'muni-new';
const USER_ID = 'user-uuid-1';

const sampleSupervisor: Supervisor = {
  id: SUP_ID,
  userId: USER_ID,
  municipioId: OLD_MUNI_ID,
  zoneId: ZONE_ID,
  area: 'BARRIDO',
  createdAt: new Date(),
};

const sampleWithUser = {
  ...sampleSupervisor,
  user: { email: 'sup@test.co', displayName: null },
};

function makeSupervisorRepo(overrides?: {
  findById?: Supervisor | null;
  update?: unknown;
}): jest.Mocked<Pick<ScopedSupervisorRepository, 'findById' | 'update'>> {
  return {
    findById: jest.fn().mockResolvedValue(
      overrides?.findById !== undefined ? overrides.findById : sampleSupervisor,
    ),
    update: jest.fn().mockResolvedValue(overrides?.update ?? sampleWithUser),
  };
}

function makeMunicipioRepo(
  municipio: Municipio | null = { id: NEW_MUNI_ID, name: 'New Muni', zoneId: ZONE_ID, createdAt: new Date(), updatedAt: new Date() },
): jest.Mocked<Pick<ScopedMunicipioRepository, 'findByIdForWrite'>> {
  return { findByIdForWrite: jest.fn().mockResolvedValue(municipio) };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('UpdateSupervisorUseCase — happy path', () => {
  it('updates municipio and calls repo.update', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    const result = await useCase.execute({ id: SUP_ID, municipioId: NEW_MUNI_ID });

    expect(supervisorRepo.update).toHaveBeenCalledWith(SUP_ID, {
      municipioId: NEW_MUNI_ID,
      area: undefined,
      displayName: undefined,
    });
    expect(result).toHaveProperty('id', SUP_ID);
  });

  it('updates area and calls repo.update', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await useCase.execute({ id: SUP_ID, area: 'RECOLECCION' });

    expect(supervisorRepo.update).toHaveBeenCalledWith(SUP_ID, {
      municipioId: undefined,
      area: 'RECOLECCION',
      displayName: undefined,
    });
  });

  it('passes displayName to repo.update', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await useCase.execute({ id: SUP_ID, displayName: 'María Supervisora' });

    expect(supervisorRepo.update).toHaveBeenCalledWith(SUP_ID, {
      municipioId: undefined,
      area: undefined,
      displayName: 'María Supervisora',
    });
  });

  it('passes multiple fields at once', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await useCase.execute({
      id: SUP_ID,
      municipioId: NEW_MUNI_ID,
      area: 'SUPERNUMERARIO',
      displayName: 'Juan Pérez',
    });

    expect(supervisorRepo.update).toHaveBeenCalledWith(SUP_ID, {
      municipioId: NEW_MUNI_ID,
      area: 'SUPERNUMERARIO',
      displayName: 'Juan Pérez',
    });
  });
});

// ─── Not found ────────────────────────────────────────────────────────────────

describe('UpdateSupervisorUseCase — not found', () => {
  it('throws SupervisorNotFoundError when supervisor does not exist', async () => {
    const supervisorRepo = makeSupervisorRepo({ findById: null });
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await expect(useCase.execute({ id: 'bad-id' })).rejects.toThrow(SupervisorNotFoundError);
    expect(supervisorRepo.update).not.toHaveBeenCalled();
  });
});

// ─── Municipio validation ─────────────────────────────────────────────────────

describe('UpdateSupervisorUseCase — municipio validation', () => {
  it('throws MunicipioNotFoundError when new municipio does not exist', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo(null);
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await expect(
      useCase.execute({ id: SUP_ID, municipioId: 'bad-muni' }),
    ).rejects.toThrow(MunicipioNotFoundError);
    expect(supervisorRepo.update).not.toHaveBeenCalled();
  });

  it('throws MunicipioNotInZoneError when municipio belongs to a different zone', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo({
      id: NEW_MUNI_ID,
      name: 'Wrong Zone',
      zoneId: 'other-zone',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await expect(
      useCase.execute({ id: SUP_ID, municipioId: NEW_MUNI_ID }),
    ).rejects.toThrow(MunicipioNotInZoneError);
    expect(supervisorRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT validate municipio when municipioId is not provided', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const municipioRepo = makeMunicipioRepo();
    const useCase = new UpdateSupervisorUseCase(supervisorRepo, municipioRepo);

    await useCase.execute({ id: SUP_ID, displayName: 'Solo Nombre' });

    // Municipio repo should NOT be called
    expect(municipioRepo.findByIdForWrite).not.toHaveBeenCalled();
    expect(supervisorRepo.update).toHaveBeenCalled();
  });
});
