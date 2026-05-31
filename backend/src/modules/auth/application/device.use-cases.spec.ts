/**
 * T3.3 — Unit tests for RegisterDeviceUseCase, RevokeDeviceUseCase, RefreshUseCase
 * RED phase: written BEFORE implementation.
 */

import { RegisterDeviceUseCase } from './register-device.use-case';
import { RevokeDeviceUseCase } from './revoke-device.use-case';
import { RefreshUseCase } from './refresh.use-case';
import type { AuthRepositoryPort, DeviceSessionData } from '../domain/auth-repository.port';
import type { TokenSignerPort } from '../domain/token-signer.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import { DeviceRevokedError, MaxDevicesExceededError, SessionNotFoundError } from '../domain/auth.errors';

// Helpers ─────────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<DeviceSessionData> = {}): DeviceSessionData {
  return {
    id: 'session-1',
    userId: 'user-1',
    deviceId: 'device-1',
    deviceLabel: 'Test Device',
    refreshTokenHash: 'hashed-refresh-token',
    revokedAt: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

const MOCK_ACCESS_TOKEN = 'new-access-token';
const MOCK_REFRESH_TOKEN = 'opaque-refresh-token';

function makeRepo(activeSession: DeviceSessionData | null = null): jest.Mocked<AuthRepositoryPort> {
  return {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@futuragest.co',
      passwordHash: 'hash',
      role: 'SUPERVISOR',
      mustChangePassword: false,
      coordinatedZoneId: null,
      supervisorId: 'sup-1',
    }),
    upsertDeviceSession: jest.fn().mockResolvedValue(makeSession()),
    findActiveDeviceSession: jest.fn().mockResolvedValue(activeSession),
    findDeviceSession: jest.fn().mockResolvedValue(activeSession),
    revokeDeviceSession: jest.fn().mockResolvedValue(undefined),
    countActiveSessions: jest.fn().mockResolvedValue(0),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    clearMustChangePassword: jest.fn().mockResolvedValue(undefined),
    findUserWithScope: jest.fn(),
  };
}

function makeSigner(): jest.Mocked<TokenSignerPort> {
  return {
    signAccessToken: jest.fn().mockReturnValue(MOCK_ACCESS_TOKEN),
    verifyAccessToken: jest.fn(),
  };
}

function makeHasher(): jest.Mocked<PasswordHasherPort> {
  return {
    hash: jest.fn().mockResolvedValue('hashed-refresh-token'),
    compare: jest.fn().mockResolvedValue(true),
  };
}

// Mock crypto for deterministic refresh tokens
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() => Buffer.from(MOCK_REFRESH_TOKEN, 'utf8')),
}));

// ─── RegisterDeviceUseCase ───────────────────────────────────────────────────

describe('RegisterDeviceUseCase', () => {
  const MAX_DEVICES = 3;

  it('registers a new device and returns a session', async () => {
    const repo = makeRepo();
    const hasher = makeHasher();
    const useCase = new RegisterDeviceUseCase(repo, hasher, MAX_DEVICES);

    const session = await useCase.execute({
      userId: 'user-1',
      deviceId: 'device-new',
      deviceLabel: 'New Phone',
    });

    expect(repo.upsertDeviceSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', deviceId: 'device-new' }),
    );
    expect(session).toBeDefined();
  });

  it('enforces max devices cap (rejects when at cap)', async () => {
    const repo = makeRepo();
    repo.countActiveSessions.mockResolvedValue(MAX_DEVICES);
    const hasher = makeHasher();
    const useCase = new RegisterDeviceUseCase(repo, hasher, MAX_DEVICES);

    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-extra', deviceLabel: 'Extra' }),
    ).rejects.toThrow(MaxDevicesExceededError);
  });

  it('allows re-registration of a device that already has a session (idempotent upsert)', async () => {
    const existingSession = makeSession({ deviceId: 'device-existing' });
    const repo = makeRepo(existingSession);
    // Existing session means countActiveSessions returns 1, within cap
    repo.countActiveSessions.mockResolvedValue(1);
    const hasher = makeHasher();
    const useCase = new RegisterDeviceUseCase(repo, hasher, MAX_DEVICES);

    // Should not throw — upsert handles existing device
    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-existing', deviceLabel: 'Same Phone' }),
    ).resolves.toBeDefined();
  });
});

// ─── RevokeDeviceUseCase ─────────────────────────────────────────────────────

describe('RevokeDeviceUseCase', () => {
  it('soft-revokes a device by setting revokedAt', async () => {
    const session = makeSession();
    const repo = makeRepo(session);
    repo.findDeviceSession.mockResolvedValue(session);
    const useCase = new RevokeDeviceUseCase(repo);

    await useCase.execute({ userId: 'user-1', deviceId: 'device-1' });

    expect(repo.revokeDeviceSession).toHaveBeenCalledWith('user-1', 'device-1');
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    const repo = makeRepo(null);
    repo.findDeviceSession.mockResolvedValue(null);
    const useCase = new RevokeDeviceUseCase(repo);

    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-ghost' }),
    ).rejects.toThrow(SessionNotFoundError);
  });
});

// ─── RefreshUseCase ──────────────────────────────────────────────────────────

describe('RefreshUseCase', () => {
  it('issues new access token for a valid non-revoked session', async () => {
    const session = makeSession({ revokedAt: null });
    const repo = makeRepo(session);
    repo.findActiveDeviceSession.mockResolvedValue(session);
    const signer = makeSigner();
    const hasher = makeHasher();
    const useCase = new RefreshUseCase(repo, signer, hasher);

    const result = await useCase.execute({
      userId: 'user-1',
      deviceId: 'device-1',
      refreshToken: MOCK_REFRESH_TOKEN,
    });

    expect(result.accessToken).toBe(MOCK_ACCESS_TOKEN);
  });

  it('rejects refresh from a revoked device', async () => {
    const repo = makeRepo(null); // findActiveDeviceSession returns null for revoked
    repo.findActiveDeviceSession.mockResolvedValue(null); // revoked = not active
    const signer = makeSigner();
    const hasher = makeHasher();
    const useCase = new RefreshUseCase(repo, signer, hasher);

    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-1', refreshToken: 'any' }),
    ).rejects.toThrow(DeviceRevokedError);
  });

  it('rejects refresh from an unregistered device', async () => {
    const repo = makeRepo(null);
    repo.findActiveDeviceSession.mockResolvedValue(null);
    const signer = makeSigner();
    const hasher = makeHasher();
    const useCase = new RefreshUseCase(repo, signer, hasher);

    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-unknown', refreshToken: 'any' }),
    ).rejects.toThrow(DeviceRevokedError);
  });

  it('rejects when refresh token hash does not match stored hash', async () => {
    const session = makeSession({ revokedAt: null });
    const repo = makeRepo(session);
    repo.findActiveDeviceSession.mockResolvedValue(session);
    const signer = makeSigner();
    const hasher = makeHasher();
    hasher.compare.mockResolvedValue(false); // token mismatch
    const useCase = new RefreshUseCase(repo, signer, hasher);

    await expect(
      useCase.execute({ userId: 'user-1', deviceId: 'device-1', refreshToken: 'wrong-token' }),
    ).rejects.toThrow(DeviceRevokedError);
  });
});
