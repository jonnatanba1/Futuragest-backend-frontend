/**
 * Auth application — LoginUseCase.
 *
 * Verifies credentials, issues JWT access token + opaque refresh token,
 * and upserts a DeviceSession row.
 *
 * Security decisions:
 * - Same error for wrong email OR wrong password (no enumeration).
 * - mustChangePassword=true: token is still issued (client needs it to call
 *   /auth/change-password), but the `passwordChangeRequired` flag signals
 *   the client AND the access token includes `mustChangePassword: true` so
 *   MustChangePasswordGuard can block all other endpoints.
 * - Refresh token: 256-bit crypto.randomBytes, hashed before persistence.
 */

import { randomBytes } from 'crypto';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { TokenSignerPort, JwtClaims } from '../domain/token-signer.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import { InvalidCredentialsError } from '../domain/auth.errors';

export interface LoginInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  passwordChangeRequired: boolean;
}

export class LoginUseCase {
  constructor(
    private readonly repo: AuthRepositoryPort,
    private readonly signer: TokenSignerPort,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.repo.findUserByEmail(input.email);

    // Same error for unknown email and wrong password — no enumeration
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordOk = await this.hasher.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new InvalidCredentialsError();
    }

    // Build JWT claims — scope fields depend on role
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

    // Generate opaque refresh token, hash before storing
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await this.hasher.hash(refreshToken);

    await this.repo.upsertDeviceSession({
      userId: user.id,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      refreshTokenHash,
    });

    return {
      accessToken,
      refreshToken,
      passwordChangeRequired: user.mustChangePassword,
    };
  }
}
