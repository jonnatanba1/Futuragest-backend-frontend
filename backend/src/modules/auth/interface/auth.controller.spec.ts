/**
 * Controller unit spec — AuthController push-token endpoints.
 *
 * Focus: the DELETE /auth/push-token contract this stream owns.
 *   - JWT-guarded (covered by global AuthGuard in production; here a stub guard
 *     populates req.user to mirror how the real guard attaches the ScopeContext).
 *   - HTTP 204 No Content, empty body.
 *   - userId + deviceId resolved from req.user (ScopeContext) — NEVER from the body.
 *   - Delegates to UnregisterPushTokenUseCase.execute({ userId, deviceId }).
 *
 * Spec: PN-24 — DELETE /auth/push-token → 204, no body.
 * Spec: PN-25 — DELETE resolves userId+deviceId from the ScopeContext, ignores any body.
 * Spec: PN-26 — POST /auth/push-token still 204 and forwards token/platform (regression).
 * Spec: PN-31/PN-32 — deviceId-less JWT identity → 401 (not 500) on POST/DELETE /auth/push-token
 *                     (pins MissingDeviceContextError → UnauthorizedException mapping).
 *
 * No real DB: every use-case provider is a mock; a stub APP_GUARD sets req.user.
 * The PN-31/PN-32 block wires REAL push-token use cases (mock repo) so the
 * domain-error-to-HTTP mapping is exercised end to end.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');

import {
  AuthController,
  LOGIN_USE_CASE,
  CHANGE_PASSWORD_USE_CASE,
  REFRESH_USE_CASE,
  REVOKE_DEVICE_USE_CASE,
  GET_ME_USE_CASE,
  REGISTER_PUSH_TOKEN_USE_CASE,
  UNREGISTER_PUSH_TOKEN_USE_CASE,
} from './auth.controller';
import { RegisterPushTokenUseCase } from '../application/register-push-token.use-case';
import { UnregisterPushTokenUseCase } from '../application/unregister-push-token.use-case';
import type { AuthRepositoryPort } from '../domain/auth-repository.port';

// Stub guard: reads identity from headers and attaches it as req.user,
// exactly like the production AuthGuard attaches the ScopeContext.
@Injectable()
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      userId: (req.headers['x-user-id'] as string) ?? 'jwt-user',
      role: 'LIDER_OPERATIVO',
      deviceId: (req.headers['x-device-id'] as string) ?? 'jwt-device',
    };
    return true;
  }
}

// Same shape as StubAuthGuard, but mirrors a legacy/deviceId-less JWT:
// the ScopeContext carries NO deviceId at all.
@Injectable()
class DeviceIdLessStubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      userId: (req.headers['x-user-id'] as string) ?? 'jwt-user',
      role: 'LIDER_OPERATIVO',
      deviceId: undefined,
    };
    return true;
  }
}

describe('AuthController — push-token endpoints (unit, mocked use-cases)', () => {
  let app: INestApplication;

  const mockUnregister = { execute: jest.fn().mockResolvedValue(undefined) };
  const mockRegister = { execute: jest.fn().mockResolvedValue(undefined) };
  const noop = { execute: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: StubAuthGuard },
        { provide: LOGIN_USE_CASE, useValue: noop },
        { provide: CHANGE_PASSWORD_USE_CASE, useValue: noop },
        { provide: REFRESH_USE_CASE, useValue: noop },
        { provide: REVOKE_DEVICE_USE_CASE, useValue: noop },
        { provide: GET_ME_USE_CASE, useValue: noop },
        { provide: REGISTER_PUSH_TOKEN_USE_CASE, useValue: mockRegister },
        { provide: UNREGISTER_PUSH_TOKEN_USE_CASE, useValue: mockUnregister },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PN-24 — DELETE /auth/push-token → 204 with empty body', async () => {
    const resp = await request(app.getHttpServer())
      .delete('/auth/push-token')
      .set('x-user-id', 'u-7')
      .set('x-device-id', 'd-7')
      .expect(204);

    expect(resp.body).toEqual({});
    expect(resp.text).toBe('');
  });

  it('PN-25 — DELETE resolves userId+deviceId from ScopeContext, ignores request body', async () => {
    await request(app.getHttpServer())
      .delete('/auth/push-token')
      .set('x-user-id', 'real-user')
      .set('x-device-id', 'real-device')
      // Body attempts to spoof a different identity — MUST be ignored.
      .send({ userId: 'SPOOF-USER', deviceId: 'SPOOF-DEVICE' })
      .expect(204);

    expect(mockUnregister.execute).toHaveBeenCalledTimes(1);
    expect(mockUnregister.execute).toHaveBeenCalledWith({
      userId: 'real-user',
      deviceId: 'real-device',
    });
  });

  it('PN-26 — POST /auth/push-token → 204 and forwards token/platform (regression)', async () => {
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-9')
      .set('x-device-id', 'd-9')
      .send({ pushToken: 'fcm-abc', pushPlatform: 'android' })
      .expect(204);

    expect(mockRegister.execute).toHaveBeenCalledWith({
      userId: 'u-9',
      deviceId: 'd-9',
      pushToken: 'fcm-abc',
      pushPlatform: 'android',
    });
  });

  it('PN-27 — POST /auth/push-token with whitespace-only pushToken → 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-9')
      .set('x-device-id', 'd-9')
      .send({ pushToken: '   \t  ' })
      .expect(400);

    expect(mockRegister.execute).not.toHaveBeenCalled();
  });

  it('PN-28 — POST /auth/push-token with pushToken longer than 4096 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-9')
      .set('x-device-id', 'd-9')
      .send({ pushToken: 'a'.repeat(4097) })
      .expect(400);

    expect(mockRegister.execute).not.toHaveBeenCalled();
  });

  it('PN-29 — POST /auth/push-token with pushPlatform longer than 16 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-9')
      .set('x-device-id', 'd-9')
      .send({ pushToken: 'fcm-ok', pushPlatform: 'p'.repeat(17) })
      .expect(400);

    expect(mockRegister.execute).not.toHaveBeenCalled();
  });

  it('PN-30 — POST /auth/push-token with a valid boundary-length token (4096 chars) → 204', async () => {
    const token = 'a'.repeat(4096);
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-9')
      .set('x-device-id', 'd-9')
      .send({ pushToken: token })
      .expect(204);

    expect(mockRegister.execute).toHaveBeenCalledWith({
      userId: 'u-9',
      deviceId: 'd-9',
      pushToken: token,
      pushPlatform: undefined,
    });
  });
});

describe('AuthController — push-token endpoints with deviceId-less JWT (real use cases, mock repo)', () => {
  let app: INestApplication;

  const repoUpdatePushToken = jest.fn().mockResolvedValue(undefined);
  const repoClearPushToken = jest.fn().mockResolvedValue(undefined);
  const mockRepo = {
    updatePushToken: repoUpdatePushToken,
    clearPushToken: repoClearPushToken,
  } as unknown as AuthRepositoryPort;

  const noop = { execute: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: DeviceIdLessStubAuthGuard },
        { provide: LOGIN_USE_CASE, useValue: noop },
        { provide: CHANGE_PASSWORD_USE_CASE, useValue: noop },
        { provide: REFRESH_USE_CASE, useValue: noop },
        { provide: REVOKE_DEVICE_USE_CASE, useValue: noop },
        { provide: GET_ME_USE_CASE, useValue: noop },
        { provide: REGISTER_PUSH_TOKEN_USE_CASE, useValue: new RegisterPushTokenUseCase(mockRepo) },
        { provide: UNREGISTER_PUSH_TOKEN_USE_CASE, useValue: new UnregisterPushTokenUseCase(mockRepo) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PN-31 — POST /auth/push-token with deviceId-less identity → 401 (not 500), repo untouched', async () => {
    await request(app.getHttpServer())
      .post('/auth/push-token')
      .set('x-user-id', 'u-legacy')
      .send({ pushToken: 'fcm-abc' })
      .expect(401);

    expect(repoUpdatePushToken).not.toHaveBeenCalled();
  });

  it('PN-32 — DELETE /auth/push-token with deviceId-less identity → 401 (not 500), repo untouched', async () => {
    await request(app.getHttpServer())
      .delete('/auth/push-token')
      .set('x-user-id', 'u-legacy')
      .expect(401);

    expect(repoClearPushToken).not.toHaveBeenCalled();
  });
});
