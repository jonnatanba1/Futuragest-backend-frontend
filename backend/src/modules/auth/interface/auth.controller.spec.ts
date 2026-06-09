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
 *
 * No real DB: every use-case provider is a mock; a stub APP_GUARD sets req.user.
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
});
