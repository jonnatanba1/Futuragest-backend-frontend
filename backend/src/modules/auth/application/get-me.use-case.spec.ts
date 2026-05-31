/**
 * Unit tests for GetMeUseCase (TDD RED phase).
 *
 * Covers:
 * - ME-15: global role → base shape only
 * - ME-12: COORDINADOR with zone → zone block present
 * - ME-12b: COORDINADOR no zone → zone: null (key present)
 * - ME-13: SUPERVISOR → supervisor block present
 * - ME-14: repo returns null → throws UserNotFoundError
 */

import { GetMeUseCase } from './get-me.use-case';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { UserProfile } from '../domain/user-profile';
import { UserNotFoundError } from '../domain/auth.errors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role: 'GERENCIA',
    mustChangePassword: false,
    coordinatedZoneId: null,
    coordinatedZoneName: null,
    supervisorId: null,
    supervisorArea: null,
    supervisorZoneId: null,
    supervisorZoneName: null,
    supervisorMunicipioId: null,
    supervisorMunicipioName: null,
    ...overrides,
  };
}

function makeRepo(profile: UserProfile | null): jest.Mocked<AuthRepositoryPort> {
  return {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    upsertDeviceSession: jest.fn(),
    findActiveDeviceSession: jest.fn(),
    findDeviceSession: jest.fn(),
    revokeDeviceSession: jest.fn(),
    countActiveSessions: jest.fn(),
    updatePassword: jest.fn(),
    clearMustChangePassword: jest.fn(),
    findUserWithScope: jest.fn().mockResolvedValue(profile),
  } as jest.Mocked<AuthRepositoryPort>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GetMeUseCase', () => {
  it('ME-15: global role (GERENCIA) → base shape only, no zone or supervisor keys', async () => {
    const profile = makeProfile({ role: 'GERENCIA', mustChangePassword: false });
    const useCase = new GetMeUseCase(makeRepo(profile));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.id).toBe('user-1');
    expect(result.email).toBe('test@example.com');
    expect(result.role).toBe('GERENCIA');
    expect(result.mustChangePassword).toBe(false);
    // Global roles: explicit null on both scope fields
    expect(result).toHaveProperty('coordinatedZone', null);
    expect(result).toHaveProperty('supervisor', null);
  });

  it('ME-12: COORDINADOR with zone → zone block present, supervisor null', async () => {
    const profile = makeProfile({
      role: 'COORDINADOR',
      coordinatedZoneId: 'zone-abc',
      coordinatedZoneName: 'Zona Urabá',
    });
    const useCase = new GetMeUseCase(makeRepo(profile));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.role).toBe('COORDINADOR');
    expect(result).toHaveProperty('coordinatedZone', { id: 'zone-abc', name: 'Zona Urabá' });
    expect(result).toHaveProperty('supervisor', null);
  });

  it('ME-12b: COORDINADOR with no zone → coordinatedZone: null (key present)', async () => {
    const profile = makeProfile({
      role: 'COORDINADOR',
      coordinatedZoneId: null,
      coordinatedZoneName: null,
    });
    const useCase = new GetMeUseCase(makeRepo(profile));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.role).toBe('COORDINADOR');
    // Key must be present with value null (INV-7)
    expect(result).toHaveProperty('coordinatedZone', null);
    expect(result).toHaveProperty('supervisor', null);
  });

  it('ME-13: SUPERVISOR → full supervisor block, coordinatedZone null', async () => {
    const profile = makeProfile({
      role: 'SUPERVISOR',
      supervisorId: 'sup-record-1',
      supervisorArea: 'BARRIDO',
      supervisorZoneId: 'zone-xyz',
      supervisorZoneName: 'Zona Sur',
      supervisorMunicipioId: 'muni-1',
      supervisorMunicipioName: 'Montería',
    });
    const useCase = new GetMeUseCase(makeRepo(profile));

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.role).toBe('SUPERVISOR');
    expect(result).toHaveProperty('coordinatedZone', null);
    expect(result).toHaveProperty('supervisor', {
      id: 'sup-record-1',
      area: 'BARRIDO',
      zone: { id: 'zone-xyz', name: 'Zona Sur' },
      municipio: { id: 'muni-1', name: 'Montería' },
    });
  });

  it('ME-14: repo returns null → throws UserNotFoundError', async () => {
    const useCase = new GetMeUseCase(makeRepo(null));

    await expect(useCase.execute({ userId: 'ghost-id' })).rejects.toThrow(UserNotFoundError);
  });
});
