/**
 * Auth application — RegisterDeviceUseCase.
 *
 * Registers a device to a user:
 * - Enforces max-devices cap.
 * - Re-registration of the same deviceId is idempotent (upsert).
 * - Stores a fresh opaque refresh token hash.
 */

import { randomBytes } from 'crypto';
import type { AuthRepositoryPort, DeviceSessionData } from '../domain/auth-repository.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import { MaxDevicesExceededError } from '../domain/auth.errors';

export interface RegisterDeviceInput {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
}

export class RegisterDeviceUseCase {
  constructor(
    private readonly repo: AuthRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly maxDevices: number = 5,
  ) {}

  async execute(input: RegisterDeviceInput): Promise<DeviceSessionData> {
    // Check if this specific deviceId already has an active session (re-registration path)
    const existingSession = await this.repo.findActiveDeviceSession(input.userId, input.deviceId);

    // If device is new, check cap
    if (!existingSession) {
      const activeCount = await this.repo.countActiveSessions(input.userId);
      if (activeCount >= this.maxDevices) {
        throw new MaxDevicesExceededError(this.maxDevices);
      }
    }

    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await this.hasher.hash(refreshToken);

    return this.repo.upsertDeviceSession({
      userId: input.userId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      refreshTokenHash,
    });
  }
}
