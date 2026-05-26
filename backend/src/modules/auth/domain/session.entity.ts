/**
 * Auth domain — Session entity.
 *
 * Represents an active device session bound to a user.
 * The refreshToken here is the OPAQUE plaintext value (only lives in memory);
 * it is hashed before being persisted to DeviceSession.refreshTokenHash.
 */
export interface SessionEntity {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  refreshToken: string; // plaintext — NEVER stored as-is
  revokedAt?: Date;
  lastSeenAt: Date;
  createdAt: Date;
}
