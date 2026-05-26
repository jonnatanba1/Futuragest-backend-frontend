/**
 * Auth application — RefreshUseCase.
 *
 * Issues a new access token given a valid refresh token + non-revoked device session.
 * The refresh token itself is NOT rotated here (single-rotation is a future hardening item).
 *
 * Rejects with DeviceRevokedError for:
 * - Revoked device session (revokedAt IS NOT NULL)
 * - Unknown device (no session found)
 * - Refresh token hash mismatch (token tampered or already rotated)
 */

import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { TokenSignerPort, JwtClaims } from '../domain/token-signer.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import { DeviceRevokedError } from '../domain/auth.errors';

export interface RefreshInput {
  userId: string;
  deviceId: string;
  refreshToken: string; // opaque plaintext from client
}

export interface RefreshOutput {
  accessToken: string;
}

export class RefreshUseCase {
  constructor(
    private readonly repo: AuthRepositoryPort,
    private readonly signer: TokenSignerPort,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: RefreshInput): Promise<RefreshOutput> {
    // findActiveDeviceSession already filters revokedAt IS NULL
    const session = await this.repo.findActiveDeviceSession(input.userId, input.deviceId);
    if (!session) {
      throw new DeviceRevokedError(input.deviceId);
    }

    // Verify refresh token against stored hash
    const tokenOk = await this.hasher.compare(input.refreshToken, session.refreshTokenHash);
    if (!tokenOk) {
      throw new DeviceRevokedError(input.deviceId);
    }

    // Rebuild claims from user
    const user = await this.repo.findUserById(input.userId);
    if (!user) {
      throw new DeviceRevokedError(input.deviceId);
    }

    const claims: JwtClaims = {
      sub: user.id,
      role: user.role,
      deviceId: input.deviceId,
    };

    if (user.role === 'COORDINADOR' && user.coordinatedZoneId) {
      claims.zoneId = user.coordinatedZoneId;
    } else if (user.role === 'SUPERVISOR' && user.supervisorId) {
      claims.supervisorId = user.supervisorId;
    }

    if (user.mustChangePassword) {
      claims.mustChangePassword = true;
    }

    const accessToken = this.signer.signAccessToken(claims);
    return { accessToken };
  }
}
