/**
 * Auth application — RevokeDeviceUseCase.
 *
 * Soft-revokes a device session by setting revokedAt = now().
 * Keeps the row for audit purposes (deferred non-repudiation work).
 */

import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import { SessionNotFoundError } from '../domain/auth.errors';

export interface RevokeDeviceInput {
  userId: string;
  deviceId: string;
}

export class RevokeDeviceUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: RevokeDeviceInput): Promise<void> {
    const session = await this.repo.findDeviceSession(input.userId, input.deviceId);
    if (!session) {
      throw new SessionNotFoundError();
    }

    await this.repo.revokeDeviceSession(input.userId, input.deviceId);
  }
}
