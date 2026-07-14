/**
 * Unit tests for CreateSupervisorUseCase.
 *
 * Verifies:
 * - Happy path: zone + municipio found, municipio in zone → createWithUser called, id returned.
 * - ZoneNotFoundError when zone does not exist.
 * - MunicipioNotFoundError when municipio does not exist.
 * - MunicipioNotInZoneError when municipio.zoneId !== input.zoneId.
 * - Password hashed via PasswordHasherPort — raw password never reaches repo.
 * - EmailInUseError propagated from repo.
 */

import { CreateSupervisorUseCase } from './create-supervisor.use-case';
import type { ScopedSupervisorRepository } from '../infrastructure/scoped-supervisor.repository';
import type { ScopedZoneRepository } from '../infrastructure/scoped-zone.repository';
import type { ScopedMunicipioRepository } from '../infrastructure/scoped-municipio.repository';
import type { PasswordHasherPort } from '../../auth/domain/password-hasher.port';
import {
  ZoneNotFoundError,
  MunicipioNotFoundError,
  MunicipioNotInZoneError,
  EmailInUseError,
} from '../domain/org.errors';
import type { Zone, Municipio } from '@prisma/client';

// ─── Test doubles ─────────────────────────────────────────────────────────────

const ZONE_ID = 'zone-uuid-1';
const MUNICIPIO_ID = 'muni-uuid-1';

function makeZone(id = ZONE_ID): Zone {
  return { id, name: 'Test Zone', createdAt: new Date(), updatedAt: new Date() };
}

function makeMunicipio(id = MUNICIPIO_ID, zoneId = ZONE_ID): Municipio {
  return { id, name: 'Test Muni', zoneId, createdAt: new Date(), updatedAt: new Date() };
}

function makeSupervisorRepo(
  createWithUserResult: { id: string } | Error = { id: 'sup-id-1' },
): jest.Mocked<Pick<ScopedSupervisorRepository, 'createWithUser'>> {
  return {
    createWithUser:
      createWithUserResult instanceof Error
        ? jest.fn().mockRejectedValue(createWithUserResult)
        : jest.fn().mockResolvedValue(createWithUserResult),
  };
}

function makeZoneRepo(zone: Zone | null = makeZone()): jest.Mocked<Pick<ScopedZoneRepository, 'findByIdForWrite'>> {
  return { findByIdForWrite: jest.fn().mockResolvedValue(zone) };
}

function makeMunicipioRepo(municipio: Municipio | null = makeMunicipio()): jest.Mocked<Pick<ScopedMunicipioRepository, 'findByIdForWrite'>> {
  return { findByIdForWrite: jest.fn().mockResolvedValue(municipio) };
}

function makeHasher(): jest.Mocked<PasswordHasherPort> {
  return {
    hash: jest.fn().mockResolvedValue('$argon2id-hashed'),
    compare: jest.fn().mockResolvedValue(true),
  };
}

const baseInput = {
  email: 'sup@test.co',
  password: 'PlainPass123!',
  area: 'BARRIDO' as const,
  zoneId: ZONE_ID,
  municipioId: MUNICIPIO_ID,
};

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('CreateSupervisorUseCase — happy path', () => {
  it('returns supervisor id when zone + municipio valid', async () => {
    const supervisorRepo = makeSupervisorRepo({ id: 'sup-abc' });
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);
    const result = await useCase.execute(baseInput);

    expect(result).toEqual({ id: 'sup-abc' });
    expect(supervisorRepo.createWithUser).toHaveBeenCalledTimes(1);
  });

  it('hashes the plaintext password before calling repo', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);
    await useCase.execute(baseInput);

    expect(hasher.hash).toHaveBeenCalledWith('PlainPass123!');
    const callArg = supervisorRepo.createWithUser.mock.calls[0][0];
    expect(callArg.passwordHash).toBe('$argon2id-hashed');
    // Raw password must NOT appear in the repo call args
    expect(Object.values(callArg)).not.toContain('PlainPass123!');
  });

  it('passes all fields correctly to createWithUser', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);
    await useCase.execute({ ...baseInput, area: 'RECOLECCION' });

    expect(supervisorRepo.createWithUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sup@test.co',
        area: 'RECOLECCION',
        zoneId: ZONE_ID,
        municipioId: MUNICIPIO_ID,
      }),
    );
  });

  it('passes optional displayName to createWithUser when provided', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);
    await useCase.execute({ ...baseInput, displayName: 'María Supervisora' });

    expect(supervisorRepo.createWithUser).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'María Supervisora',
      }),
    );
  });

  it('does NOT pass displayName when not provided (undefined)', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);
    // No displayName in baseInput
    await useCase.execute(baseInput);

    const callArg = supervisorRepo.createWithUser.mock.calls[0][0];
    expect(callArg.displayName).toBeUndefined();
  });
});

// ─── Zone validation ──────────────────────────────────────────────────────────

describe('CreateSupervisorUseCase — zone validation', () => {
  it('throws ZoneNotFoundError when zone does not exist', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo(null);
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);

    await expect(useCase.execute(baseInput)).rejects.toThrow(ZoneNotFoundError);
    expect(supervisorRepo.createWithUser).not.toHaveBeenCalled();
  });
});

// ─── Municipio validation ─────────────────────────────────────────────────────

describe('CreateSupervisorUseCase — municipio validation', () => {
  it('throws MunicipioNotFoundError when municipio does not exist', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo(null);
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);

    await expect(useCase.execute(baseInput)).rejects.toThrow(MunicipioNotFoundError);
    expect(supervisorRepo.createWithUser).not.toHaveBeenCalled();
  });

  it('throws MunicipioNotInZoneError when municipio belongs to a different zone', async () => {
    const supervisorRepo = makeSupervisorRepo();
    const zoneRepo = makeZoneRepo();
    // Municipio is in a different zone
    const municipioRepo = makeMunicipioRepo(makeMunicipio(MUNICIPIO_ID, 'other-zone-id'));
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);

    await expect(useCase.execute(baseInput)).rejects.toThrow(MunicipioNotInZoneError);
    expect(supervisorRepo.createWithUser).not.toHaveBeenCalled();
  });
});

// ─── Email uniqueness ─────────────────────────────────────────────────────────

describe('CreateSupervisorUseCase — email uniqueness', () => {
  it('propagates EmailInUseError from repo', async () => {
    const supervisorRepo = makeSupervisorRepo(new EmailInUseError('sup@test.co'));
    const zoneRepo = makeZoneRepo();
    const municipioRepo = makeMunicipioRepo();
    const hasher = makeHasher();

    const useCase = new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher);

    await expect(useCase.execute(baseInput)).rejects.toThrow(EmailInUseError);
  });
});
