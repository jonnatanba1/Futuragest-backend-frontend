/**
 * Auth application — UnregisterPushTokenUseCase.
 *
 * Clears the caller's push token on their active DeviceSession.
 * userId and deviceId are ALWAYS resolved from the JWT (ScopeContext), NEVER from the request body.
 *
 * Business rules:
 * - No body is required (DELETE /auth/push-token carries no payload)
 * - Idempotent: clearing an already-null token is a no-op
 * - The session row must already exist (user is authenticated, session was validated by AuthGuard)
 */

import type { AuthRepositoryPort } from '../domain/auth-repository.port';

export interface UnregisterPushTokenInput {
  userId: string;
  deviceId: string;
}

export class UnregisterPushTokenUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: UnregisterPushTokenInput): Promise<void> {
    await this.repo.clearPushToken(input.userId, input.deviceId);
  }
}
