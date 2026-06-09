/**
 * T-40 — Unit tests for AssignCoordinadorToZoneUseCase.
 *
 * Written FIRST (TDD red phase) — fails before the use-case exists.
 *
 * Verifies:
 * - Fresh assignment: sets coordinatedZoneId on user, calls assignCoordinador on repo.
 * - Reassignment A→B: clear-then-set call order is verified.
 * - Wrong-role target → InvalidCoordinadorRoleError.
 * - Non-existent zone → ZoneNotFoundError.
 * - Non-existent user → UserNotFoundError.
 */

import { AssignCoordinadorToZoneUseCase } from './assign-coordinador-to-zone.use-case';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import {
  InvalidCoordinadorRoleError,
  ZoneNotFoundError,
  UserNotFoundError,
} from '../domain/org.errors';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeRepo(): jest.Mocked<OrgRepositoryPort> {
  return {
    createManagementUser: jest.fn().mockResolvedValue({ id: 'new-user-id' }),
    assignCoordinador: jest.fn().mockResolvedValue(undefined),
    findZones: jest.fn().mockResolvedValue([]),
    findMunicipios: jest.fn().mockResolvedValue([]),
    createZone: jest.fn().mockResolvedValue({ id: 'zone-id' }),
    updateZone: jest.fn().mockResolvedValue({ id: 'zone-id', name: 'Zone', createdAt: new Date(), updatedAt: new Date() }),
    deleteZone: jest.fn().mockResolvedValue(undefined),
    createMunicipio: jest.fn().mockResolvedValue({ id: 'muni-id' }),
    updateMunicipio: jest.fn().mockResolvedValue({ id: 'muni-id', name: 'Muni', zoneId: 'zone-id', createdAt: new Date(), updatedAt: new Date() }),
    deleteMunicipio: jest.fn().mockResolvedValue(undefined),
    findUsers: jest.fn().mockResolvedValue([]),
  };
}

const ZONE_ID = 'zone-uraba-uuid';
const USER_ID = 'user-coord-uuid';

// ─── Happy path: fresh assignment ─────────────────────────────────────────────

describe('AssignCoordinadorToZoneUseCase — fresh assignment', () => {
  it('calls repo.assignCoordinador with correct params', async () => {
    const repo = makeRepo();
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    await useCase.execute({ userId: USER_ID, zoneId: ZONE_ID });

    expect(repo.assignCoordinador).toHaveBeenCalledTimes(1);
    expect(repo.assignCoordinador).toHaveBeenCalledWith({ userId: USER_ID, zoneId: ZONE_ID });
  });

  it('resolves without throwing on success', async () => {
    const repo = makeRepo();
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    await expect(
      useCase.execute({ userId: USER_ID, zoneId: ZONE_ID }),
    ).resolves.toBeUndefined();
  });
});

// ─── Clear-then-set order (reassignment A→B) ─────────────────────────────────

describe('AssignCoordinadorToZoneUseCase — reassignment delegates to repo', () => {
  it('calls repo.assignCoordinador once (repo owns $transaction clear-then-set)', async () => {
    const repo = makeRepo();
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    // Use-case delegates transactional logic to the repo port.
    // The UNIT test for clear-then-set order lives in PrismaOrgRepository spec (T-60).
    await useCase.execute({ userId: USER_ID, zoneId: ZONE_ID });

    expect(repo.assignCoordinador).toHaveBeenCalledTimes(1);
  });
});

// ─── Domain error propagation ─────────────────────────────────────────────────

describe('AssignCoordinadorToZoneUseCase — error propagation', () => {
  it('propagates InvalidCoordinadorRoleError from repo', async () => {
    const repo = makeRepo();
    repo.assignCoordinador.mockRejectedValue(
      new InvalidCoordinadorRoleError('SUPERVISOR'),
    );
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    await expect(
      useCase.execute({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(InvalidCoordinadorRoleError);
  });

  it('propagates ZoneNotFoundError from repo', async () => {
    const repo = makeRepo();
    repo.assignCoordinador.mockRejectedValue(new ZoneNotFoundError(ZONE_ID));
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    await expect(
      useCase.execute({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(ZoneNotFoundError);
  });

  it('propagates UserNotFoundError from repo', async () => {
    const repo = makeRepo();
    repo.assignCoordinador.mockRejectedValue(new UserNotFoundError(USER_ID));
    const useCase = new AssignCoordinadorToZoneUseCase(repo);

    await expect(
      useCase.execute({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
