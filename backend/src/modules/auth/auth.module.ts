/**
 * Auth module — DI wiring.
 *
 * Binds:
 * - AUTH_REPOSITORY_PORT → PrismaAuthRepository
 * - TOKEN_SIGNER_PORT → JwtTokenSigner
 * - PASSWORD_HASHER_PORT → ArgonPasswordHasher
 * - Use cases as named symbols
 * - Guards as providers (exported for APP_GUARD global registration in AppModule)
 *
 * JWT configuration:
 * - Reads JWT_SECRET from environment.
 * - Falls back to a FIXED DEV-ONLY secret when NODE_ENV !== 'production'.
 * - THROWS at startup if JWT_SECRET is missing in production.
 *
 * Production requirement: set JWT_SECRET environment variable.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../database/prisma.module';

import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { JwtTokenSigner } from './infrastructure/jwt-token-signer';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher';

import { LoginUseCase } from './application/login.use-case';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { RefreshUseCase } from './application/refresh.use-case';
import { RevokeDeviceUseCase } from './application/revoke-device.use-case';
import { GetMeUseCase } from './application/get-me.use-case';

import { AuthController } from './interface/auth.controller';
import { AuthGuard } from './interface/auth.guard';
import { MustChangePasswordGuard } from './interface/must-change-password.guard';

import { AUTH_REPOSITORY_PORT } from './domain/auth-repository.port';
import { TOKEN_SIGNER_PORT } from './domain/token-signer.port';
import { PASSWORD_HASHER_PORT } from './domain/password-hasher.port';
import {
  LOGIN_USE_CASE,
  CHANGE_PASSWORD_USE_CASE,
  REFRESH_USE_CASE,
  REVOKE_DEVICE_USE_CASE,
  GET_ME_USE_CASE,
} from './interface/auth.controller';

/** Safe dev-only fallback secret — NEVER used in production. */
const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[AuthModule] JWT_SECRET environment variable is required in production. ' +
        'Set it in your environment or Dokploy secret store.',
    );
  }
  console.warn(
    '[AuthModule] WARNING: JWT_SECRET not set. Using dev-only fallback. ' +
      'Set JWT_SECRET in production.',
  );
  return DEV_JWT_SECRET;
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Infrastructure implementations
    {
      provide: AUTH_REPOSITORY_PORT,
      useClass: PrismaAuthRepository,
    },
    {
      provide: TOKEN_SIGNER_PORT,
      useClass: JwtTokenSigner,
    },
    {
      provide: PASSWORD_HASHER_PORT,
      useClass: ArgonPasswordHasher,
    },

    // Use cases — named symbols for controller injection
    {
      provide: LOGIN_USE_CASE,
      useFactory: (repo: PrismaAuthRepository, signer: JwtTokenSigner, hasher: ArgonPasswordHasher) =>
        new LoginUseCase(repo, signer, hasher),
      inject: [AUTH_REPOSITORY_PORT, TOKEN_SIGNER_PORT, PASSWORD_HASHER_PORT],
    },
    {
      provide: CHANGE_PASSWORD_USE_CASE,
      useFactory: (repo: PrismaAuthRepository, hasher: ArgonPasswordHasher) =>
        new ChangePasswordUseCase(repo, hasher),
      inject: [AUTH_REPOSITORY_PORT, PASSWORD_HASHER_PORT],
    },
    {
      provide: REFRESH_USE_CASE,
      useFactory: (repo: PrismaAuthRepository, signer: JwtTokenSigner, hasher: ArgonPasswordHasher) =>
        new RefreshUseCase(repo, signer, hasher),
      inject: [AUTH_REPOSITORY_PORT, TOKEN_SIGNER_PORT, PASSWORD_HASHER_PORT],
    },
    {
      provide: REVOKE_DEVICE_USE_CASE,
      useFactory: (repo: PrismaAuthRepository) => new RevokeDeviceUseCase(repo),
      inject: [AUTH_REPOSITORY_PORT],
    },
    {
      provide: GET_ME_USE_CASE,
      useFactory: (repo: PrismaAuthRepository) => new GetMeUseCase(repo),
      inject: [AUTH_REPOSITORY_PORT],
    },

    // Guards — exported so AppModule can register them globally
    AuthGuard,
    MustChangePasswordGuard,

    // Concrete infra classes (needed for useFactory inject arrays)
    PrismaAuthRepository,
    JwtTokenSigner,
    ArgonPasswordHasher,
  ],
  exports: [
    AUTH_REPOSITORY_PORT,
    TOKEN_SIGNER_PORT,
    PASSWORD_HASHER_PORT,
    AuthGuard,
    MustChangePasswordGuard,
  ],
})
export class AuthModule {}
