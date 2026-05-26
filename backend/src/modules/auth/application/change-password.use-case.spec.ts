/**
 * T3.2 — Unit tests for ChangePasswordUseCase
 * RED phase: written BEFORE implementation.
 */

import { ChangePasswordUseCase } from './change-password.use-case';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import type { AuthUser } from '../domain/auth-user';
import { PasswordMismatchError, SamePasswordError } from '../domain/auth.errors';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'current-hash',
    role: 'SUPERVISOR',
    mustChangePassword: true,
    coordinatedZoneId: null,
    supervisorId: 'sup-1',
    ...overrides,
  };
}

function makeRepo(user: AuthUser = makeUser()): jest.Mocked<AuthRepositoryPort> {
  return {
    findUserByEmail: jest.fn().mockResolvedValue(user),
    findUserById: jest.fn().mockResolvedValue(user),
    upsertDeviceSession: jest.fn(),
    findActiveDeviceSession: jest.fn(),
    findDeviceSession: jest.fn(),
    revokeDeviceSession: jest.fn().mockResolvedValue(undefined),
    countActiveSessions: jest.fn().mockResolvedValue(0),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    clearMustChangePassword: jest.fn().mockResolvedValue(undefined),
  };
}

function makeHasher(compareResult = true): jest.Mocked<PasswordHasherPort> {
  return {
    hash: jest.fn().mockResolvedValue('new-hashed-password'),
    compare: jest.fn().mockResolvedValue(compareResult),
  };
}

describe('ChangePasswordUseCase', () => {
  let repo: jest.Mocked<AuthRepositoryPort>;
  let hasher: jest.Mocked<PasswordHasherPort>;
  let useCase: ChangePasswordUseCase;

  beforeEach(() => {
    repo = makeRepo();
    hasher = makeHasher(true);
    useCase = new ChangePasswordUseCase(repo, hasher);
  });

  it('(a) clears mustChangePassword on success', async () => {
    // First compare: old password matches (true). Second compare: new != old (false).
    hasher.compare
      .mockResolvedValueOnce(true)  // old password OK
      .mockResolvedValueOnce(false); // new password != old

    await useCase.execute({
      userId: 'user-1',
      oldPassword: 'old-pass',
      newPassword: 'brand-new-pass',
    });

    expect(repo.clearMustChangePassword).toHaveBeenCalledWith('user-1');
    expect(repo.updatePassword).toHaveBeenCalledWith('user-1', 'new-hashed-password');
  });

  it('(b) rejects if old password is wrong', async () => {
    hasher.compare.mockResolvedValue(false);

    await expect(
      useCase.execute({
        userId: 'user-1',
        oldPassword: 'wrong-pass',
        newPassword: 'new-pass',
      }),
    ).rejects.toThrow(PasswordMismatchError);
  });

  it('(c) rejects if new password is same as old (same hash match)', async () => {
    // compare returns true twice: once for old-pass verification,
    // once for the same-as-old check
    hasher.compare
      .mockResolvedValueOnce(true) // old password verified OK
      .mockResolvedValueOnce(true); // new password === old password

    await expect(
      useCase.execute({
        userId: 'user-1',
        oldPassword: 'same-pass',
        newPassword: 'same-pass',
      }),
    ).rejects.toThrow(SamePasswordError);
  });

  it('does NOT clear mustChangePassword if old password check fails', async () => {
    hasher.compare.mockResolvedValueOnce(false); // old password rejected

    await expect(
      useCase.execute({ userId: 'user-1', oldPassword: 'wrong', newPassword: 'new' }),
    ).rejects.toThrow(PasswordMismatchError);

    expect(repo.clearMustChangePassword).not.toHaveBeenCalled();
  });
});
