/**
 * Auth domain — AuthRepositoryPort interface.
 *
 * Declares the persistence operations needed by auth use cases.
 * Infrastructure layer (PrismaAuthRepository) implements this.
 */

import type { AuthUser } from './auth-user';
import type { UserProfile } from './user-profile';

export interface DeviceSessionData {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel?: string | null;
  refreshTokenHash: string;
  revokedAt?: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface AuthRepositoryPort {
  /** Find a user by email for login. Returns null if not found. */
  findUserByEmail(email: string): Promise<AuthUser | null>;

  /** Find a user by ID. Returns null if not found. */
  findUserById(id: string): Promise<AuthUser | null>;

  /**
   * Upsert a device session on (userId, deviceId) unique key.
   * Stores the HASHED refresh token, not the plaintext.
   */
  upsertDeviceSession(data: {
    userId: string;
    deviceId: string;
    deviceLabel?: string;
    refreshTokenHash: string;
  }): Promise<DeviceSessionData>;

  /** Find an active (non-revoked) device session by userId + deviceId. */
  findActiveDeviceSession(userId: string, deviceId: string): Promise<DeviceSessionData | null>;

  /** Find a device session by userId + deviceId (including revoked). */
  findDeviceSession(userId: string, deviceId: string): Promise<DeviceSessionData | null>;

  /** Soft-revoke a device session by setting revokedAt = now(). */
  revokeDeviceSession(userId: string, deviceId: string): Promise<void>;

  /** Count active (non-revoked) sessions for a user. */
  countActiveSessions(userId: string): Promise<number>;

  /** Update a user's password hash. */
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  /** Clear the mustChangePassword flag for a user. */
  clearMustChangePassword(userId: string): Promise<void>;

  /**
   * Fetch a user with role-specific scope data in a single DB round-trip.
   * Returns null when the user no longer exists (deleted-with-live-token edge case).
   */
  findUserWithScope(userId: string): Promise<UserProfile | null>;

  /**
   * Store (or clear) the FCM/APNs push token for the caller's active device session.
   * Identified by (userId, deviceId) — never by body values.
   * platform: optional hint ("android" | "ios" | "web").
   */
  updatePushToken(userId: string, deviceId: string, pushToken: string, platform?: string): Promise<void>;

  /**
   * Clear the FCM/APNs push token (and platform) for the caller's device session.
   * Identified by (userId, deviceId) — never by body values.
   * Idempotent: clearing an already-null token is a no-op.
   */
  clearPushToken(userId: string, deviceId: string): Promise<void>;
}

export const AUTH_REPOSITORY_PORT = Symbol('AuthRepositoryPort');
