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
import { MissingDeviceContextError } from '../domain/auth.errors';

export interface RegisterPushTokenInput {
  userId: string;
  /**
   * From JWT claims — may be absent on legacy/deviceId-less tokens. The use case
   * rejects those: an undefined deviceId would be silently dropped by Prisma's
   * updateMany filter and write the token to ALL of the user's sessions.
   */
  deviceId: string | undefined;
  pushToken: string;
  pushPlatform?: string;
}

export class RegisterPushTokenUseCase {
  constructor(private readonly repo: AuthRepositoryPort) {}

  async execute(input: RegisterPushTokenInput): Promise<void> {
    if (!input.deviceId) {
      throw new MissingDeviceContextError();
    }
    // Trim here (not via @Transform) — the global ValidationPipe is whitelist-only
    // (transform: false), so transformed DTO instances never reach the handler.
    // The DTO's @Matches(/\S/) already rejects whitespace-only tokens, so trimming
    // can never produce an empty string here.
    await this.repo.updatePushToken(
      input.userId,
      input.deviceId,
      input.pushToken.trim(),
      input.pushPlatform?.trim(),
    );
  }
}
