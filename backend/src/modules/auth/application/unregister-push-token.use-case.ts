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
import { MissingDeviceContextError } from '../domain/auth.errors';

export interface UnregisterPushTokenInput {
  userId: string;
  /**
   * From JWT claims — may be absent on legacy/deviceId-less tokens. The use case
   * rejects those: an undefined deviceId would be silently dropped by Prisma's
   * updateMany filter and clear the token on ALL of the user's sessions.
   */
  deviceId: string | undefined;
}

export class UnregisterPushTokenUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: UnregisterPushTokenInput): Promise<void> {
    if (!input.deviceId) {
      throw new MissingDeviceContextError();
    }
    await this.repo.clearPushToken(input.userId, input.deviceId);
  }
}
