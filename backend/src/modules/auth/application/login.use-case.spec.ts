/**
 * T3.1 — Unit tests for LoginUseCase
 * RED phase: these tests are written BEFORE the implementation.
 */

import { LoginUseCase } from './login.use-case';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';
import type { TokenSignerPort, JwtClaims } from '../domain/token-signer.port';
import type { PasswordHasherPort } from '../domain/password-hasher.port';
import type { AuthUser } from '../domain/auth-user';
import { InvalidCredentialsError } from '../domain/auth.errors';

// Helpers ─────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'COORDINADOR',
    mustChangePassword: false,
    coordinatedZoneId: 'zone-1',
    supervisorId: null,
    ...overrides,
  };
}

const MOCK_ACCESS_TOKEN = 'access-token-mock';
const MOCK_REFRESH_TOKEN = 'refresh-token-mock';

function makeTokenSigner(): jest.Mocked<TokenSignerPort> {
  return {
    signAccessToken: jest.fn().mockReturnValue(MOCK_ACCESS_TOKEN),
    verifyAccessToken: jest.fn(),
  };
}

function makeHasher(compareResult = true): jest.Mocked<PasswordHasherPort> {
  return {
    hash: jest.fn().mockResolvedValue('some-hash'),
    compare: jest.fn().mockResolvedValue(compareResult),
  };
}

function makeRepo(user: AuthUser | null = makeUser()): jest.Mocked<AuthRepositoryPort> {
  return {
    findUserByEmail: jest.fn().mockResolvedValue(user),
    findUserById: jest.fn().mockResolvedValue(user),
    upsertDeviceSession: jest.fn().mockResolvedValue({
      id: 'session-1',
      userId: user?.id ?? 'user-1',
      deviceId: 'device-1',
      refreshTokenHash: 'hashed-refresh',
      lastSeenAt: new Date(),
      createdAt: new Date(),
    }),
    findActiveDeviceSession: jest.fn().mockResolvedValue(null),
    findDeviceSession: jest.fn().mockResolvedValue(null),
    revokeDeviceSession: jest.fn().mockResolvedValue(undefined),
    countActiveSessions: jest.fn().mockResolvedValue(0),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    clearMustChangePassword: jest.fn().mockResolvedValue(undefined),
  };
}

// Mock crypto.randomBytes for deterministic refresh token
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() => Buffer.from(MOCK_REFRESH_TOKEN, 'utf8')),
}));

// Tests ───────────────────────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  let repo: jest.Mocked<AuthRepositoryPort>;
  let signer: jest.Mocked<TokenSignerPort>;
  let hasher: jest.Mocked<PasswordHasherPort>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    repo = makeRepo();
    signer = makeTokenSigner();
    hasher = makeHasher(true);
    useCase = new LoginUseCase(repo, signer, hasher);
  });

  it('(a) returns tokens on valid credentials', async () => {
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'correct-password',
      deviceId: 'device-1',
    });

    expect(result.accessToken).toBe(MOCK_ACCESS_TOKEN);
    expect(result.passwordChangeRequired).toBe(false);
    expect(repo.upsertDeviceSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', deviceId: 'device-1' }),
    );
  });

  it('(b) throws InvalidCredentialsError on wrong password', async () => {
    hasher.compare.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'test@example.com', password: 'wrong', deviceId: 'device-1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('(c) throws same InvalidCredentialsError on unknown email (no enumeration)', async () => {
    repo.findUserByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'unknown@example.com', password: 'any', deviceId: 'device-1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('(d) tokens contain correct claims for COORDINADOR', async () => {
    const coordUser = makeUser({ role: 'COORDINADOR', coordinatedZoneId: 'zone-abc' });
    repo.findUserByEmail.mockResolvedValue(coordUser);

    await useCase.execute({
      email: 'test@example.com',
      password: 'correct-password',
      deviceId: 'device-1',
    });

    expect(signer.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        role: 'COORDINADOR',
        zoneId: 'zone-abc',
        deviceId: 'device-1',
      }),
    );
    // supervisorId must NOT be present for COORDINADOR
    const claims = signer.signAccessToken.mock.calls[0][0] as JwtClaims;
    expect(claims.supervisorId).toBeUndefined();
  });

  it('(e) tokens contain correct claims for SUPERVISOR', async () => {
    const supUser = makeUser({ role: 'SUPERVISOR', supervisorId: 'sup-abc', coordinatedZoneId: null });
    repo.findUserByEmail.mockResolvedValue(supUser);

    await useCase.execute({
      email: 'test@example.com',
      password: 'correct-password',
      deviceId: 'device-1',
    });

    expect(signer.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        role: 'SUPERVISOR',
        supervisorId: 'sup-abc',
        deviceId: 'device-1',
      }),
    );
    // zoneId must NOT be present for SUPERVISOR (scope comes from supervisorId)
    const claims = signer.signAccessToken.mock.calls[0][0] as JwtClaims;
    expect(claims.zoneId).toBeUndefined();
  });

  it('signals passwordChangeRequired when mustChangePassword=true', async () => {
    repo.findUserByEmail.mockResolvedValue(makeUser({ mustChangePassword: true }));

    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'correct-password',
      deviceId: 'device-1',
    });

    expect(result.passwordChangeRequired).toBe(true);
    // access token still issued (client needs it to call /auth/change-password)
    expect(result.accessToken).toBe(MOCK_ACCESS_TOKEN);
    // mustChangePassword must appear in the access token claims
    const claims = signer.signAccessToken.mock.calls[0][0] as JwtClaims;
    expect(claims.mustChangePassword).toBe(true);
  });
});
