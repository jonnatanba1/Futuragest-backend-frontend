/**
 * Auth application — ChangePasswordUseCase.
 *
 * Forces a password change for a user:
 * 1. Verifies old password.
 * 2. Rejects if new == old.
 * 3. Hashes new password, updates DB, clears mustChangePassword.
 */

import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import { PasswordMismatchError, SamePasswordError } from '../domain/auth.errors';

export interface ChangePasswordInput {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

export class ChangePasswordUseCase {
  constructor(
    private readonly repo: AuthRepositoryPort,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.repo.findUserById(input.userId);
    if (!user) {
      // Should never happen in a properly guarded route
      throw new PasswordMismatchError();
    }

    // Verify old password
    const oldOk = await this.hasher.compare(input.oldPassword, user.passwordHash);
    if (!oldOk) {
      throw new PasswordMismatchError();
    }

    // Reject same-as-old
    const sameAsOld = await this.hasher.compare(input.newPassword, user.passwordHash);
    if (sameAsOld) {
      throw new SamePasswordError();
    }

    const newHash = await this.hasher.hash(input.newPassword);
    await this.repo.updatePassword(input.userId, newHash);
    await this.repo.clearMustChangePassword(input.userId);
  }
}
