/**
 * Auth application — RegisterPushTokenUseCase.
 *
 * Stores the caller's push token on their active DeviceSession.
 * userId and deviceId are ALWAYS resolved from the JWT (ScopeContext), NEVER from the request body.
 *
 * Business rules:
 * - pushToken is required (validated at controller/DTO level; 400 if missing)
 * - pushPlatform is optional
 * - Idempotent: re-registering the same token is a no-op update
 * - The session row must already exist (user is authenticated, session was validated by AuthGuard)
 */

import type { AuthRepositoryPort } from '../domain/auth-repository.port';

export interface RegisterPushTokenInput {
  userId: string;
  deviceId: string;
  pushToken: string;
  pushPlatform?: string;
}

export class RegisterPushTokenUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: RegisterPushTokenInput): Promise<void> {
    await this.repo.updatePushToken(
      input.userId,
      input.deviceId,
      input.pushToken,
      input.pushPlatform,
    );
  }
}
