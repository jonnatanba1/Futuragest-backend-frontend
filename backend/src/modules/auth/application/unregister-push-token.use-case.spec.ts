/**
 * TDD spec — UnregisterPushTokenUseCase
 *
 * Spec: PN-19 — clearPushToken called with the correct userId + deviceId (from JWT, never body)
 * Spec: PN-20 — resolves void (no return value)
 */

import { UnregisterPushTokenUseCase } from './unregister-push-token.use-case';
import { MissingDeviceContextError } from '../domain/auth.errors';
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

describe('UnregisterPushTokenUseCase', () => {
  describe('PN-19 — calls clearPushToken with correct args', () => {
    it('passes userId and deviceId to repo.clearPushToken', async () => {
      const repo = makeMockRepo();
      const useCase = new UnregisterPushTokenUseCase(repo);

      await useCase.execute({ userId: 'user-1', deviceId: 'device-1' });

      expect(repo.clearPushToken).toHaveBeenCalledTimes(1);
      expect(repo.clearPushToken).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('does not call updatePushToken (clear-only path)', async () => {
      const repo = makeMockRepo();
      const useCase = new UnregisterPushTokenUseCase(repo);

      await useCase.execute({ userId: 'user-2', deviceId: 'device-2' });

      expect(repo.updatePushToken).not.toHaveBeenCalled();
    });
  });

  describe('PN-20b — rejects when deviceId is missing (deviceId-less JWT footgun)', () => {
    it('throws MissingDeviceContextError and does NOT call the repo when deviceId is undefined', async () => {
      const repo = makeMockRepo();
      const useCase = new UnregisterPushTokenUseCase(repo);

      await expect(
        useCase.execute({ userId: 'user-1', deviceId: undefined }),
      ).rejects.toBeInstanceOf(MissingDeviceContextError);

      expect(repo.clearPushToken).not.toHaveBeenCalled();
    });

    it('throws MissingDeviceContextError and does NOT call the repo when deviceId is empty', async () => {
      const repo = makeMockRepo();
      const useCase = new UnregisterPushTokenUseCase(repo);

      await expect(
        useCase.execute({ userId: 'user-1', deviceId: '' }),
      ).rejects.toBeInstanceOf(MissingDeviceContextError);

      expect(repo.clearPushToken).not.toHaveBeenCalled();
    });
  });

  describe('PN-20 — resolves void', () => {
    it('returns void (undefined)', async () => {
      const repo = makeMockRepo();
      const useCase = new UnregisterPushTokenUseCase(repo);

      const result = await useCase.execute({ userId: 'user-3', deviceId: 'device-3' });

      expect(result).toBeUndefined();
    });
  });
});
