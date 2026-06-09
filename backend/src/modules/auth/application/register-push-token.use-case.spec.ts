/**
 * TDD spec — RegisterPushTokenUseCase
 *
 * Spec: PN-17 — updatePushToken called with correct userId, deviceId, token, platform
 * Spec: PN-18 — resolves void (no return value)
 */

import { RegisterPushTokenUseCase } from './register-push-token.use-case';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';

function makeMockRepo(overrides: Partial<AuthRepositoryPort> = {}): AuthRepositoryPort {
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
    findUserWithScope: jest.fn(),
    updatePushToken: jest.fn().mockResolvedValue(undefined),
    clearPushToken: jest.fn().mockResolvedValue(undefined),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('RegisterPushTokenUseCase', () => {
  describe('PN-17 — calls updatePushToken with correct args', () => {
    it('passes userId, deviceId, pushToken, and pushPlatform to repo', async () => {
      const repo = makeMockRepo();
      const useCase = new RegisterPushTokenUseCase(repo);

      await useCase.execute({
        userId: 'user-1',
        deviceId: 'device-1',
        pushToken: 'fcm-token-abc',
        pushPlatform: 'android',
      });

      expect(repo.updatePushToken).toHaveBeenCalledWith('user-1', 'device-1', 'fcm-token-abc', 'android');
    });

    it('passes undefined platform when not provided', async () => {
      const repo = makeMockRepo();
      const useCase = new RegisterPushTokenUseCase(repo);

      await useCase.execute({
        userId: 'user-2',
        deviceId: 'device-2',
        pushToken: 'fcm-token-xyz',
      });

      expect(repo.updatePushToken).toHaveBeenCalledWith('user-2', 'device-2', 'fcm-token-xyz', undefined);
    });
  });

  describe('PN-18 — resolves void', () => {
    it('returns void (undefined)', async () => {
      const repo = makeMockRepo();
      const useCase = new RegisterPushTokenUseCase(repo);

      const result = await useCase.execute({
        userId: 'user-3',
        deviceId: 'device-3',
        pushToken: 'token-x',
      });

      expect(result).toBeUndefined();
    });
  });
});
