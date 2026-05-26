/**
 * T3.4 — Integration tests for Auth module endpoints.
 *
 * Uses the test DB (futuragest_test) prepared by jest globalSetup.
 * The seeded SYSTEM_ADMIN user: email=admin@futuragest.co, mustChangePassword=true.
 *
 * NOTE: Each describe block resets admin state directly in DB via Prisma
 * so tests are order-independent and can be re-run safely.
 *
 * Tests:
 * - POST /auth/login happy path (admin user)
 * - POST /auth/login returns passwordChangeRequired=true for mustChangePassword user
 * - POST /auth/login 401 on bad credentials
 * - Device session row created with hash (refreshTokenHash != plaintext)
 * - POST /auth/change-password clears the flag
 * - Protected endpoint returns 403 PASSWORD_CHANGE_REQUIRED when mustChangePassword
 * - DELETE /auth/sessions/:deviceId revokes a device session
 * - POST /auth/refresh rejected after revocation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');
import { AppModule } from '../../app.module';
import { createPrismaClient } from '../../database/prisma-client';
import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const ADMIN_EMAIL = 'admin@futuragest.co';
const ADMIN_PASSWORD = 'ChangeMe@2024!'; // placeholder password set in seed.ts

/** Reset admin to known state with mustChangePassword=true */
async function resetAdmin(prisma: PrismaClient, mustChangePassword: boolean = true): Promise<void> {
  const freshHash = await argon2.hash(ADMIN_PASSWORD);
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { passwordHash: freshHash, mustChangePassword },
  });
  // Clean up any device sessions from previous runs
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    await prisma.deviceSession.deleteMany({ where: { userId: admin.id } });
  }
}

describe('Auth Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = createPrismaClient();
    // Ensure admin starts with mustChangePassword=true
    await resetAdmin(prisma, true);
  // PR5 note: MinioStorageAdapter.onModuleInit() probes MinIO (up to 2s) on boot
  }, 30_000);

  afterAll(async () => {
    // Restore admin to seed-expected state (mustChangePassword=true)
    // so schema.int-spec.ts assertions pass when tests run together.
    await resetAdmin(prisma, true);
    await prisma.$disconnect();
    await app.close();
  });

  // ─── Login ────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await resetAdmin(prisma, true);
    });

    it('returns 200 with tokens and passwordChangeRequired=true for seeded admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: 'test-device-login-1' })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.passwordChangeRequired).toBe(true);
    });

    it('returns 401 on wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: 'wrong-password', deviceId: 'test-device-login-2' })
        .expect(401);
    });

    it('returns 401 on unknown email (same as wrong password — no enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'any', deviceId: 'test-device-login-3' })
        .expect(401);
    });

    it('creates a DeviceSession row with a hashed refresh token (not plaintext)', async () => {
      const deviceId = 'hash-check-device';
      const loginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId })
        .expect(200);

      const { refreshToken } = loginResp.body;

      const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
      expect(adminUser).not.toBeNull();

      const session = await prisma.deviceSession.findFirst({
        where: { userId: adminUser!.id, deviceId },
      });

      expect(session).not.toBeNull();
      // The hash must differ from the plaintext token
      expect(session!.refreshTokenHash).not.toBe(refreshToken);
      // And must not be empty
      expect(session!.refreshTokenHash.length).toBeGreaterThan(10);
    });
  });

  // ─── Protected endpoints + mustChangePassword ──────────────────────────────

  describe('MustChangePasswordGuard', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Admin must have mustChangePassword=true
      await resetAdmin(prisma, true);

      const resp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: 'mcp-guard-test-device' })
        .expect(200);
      accessToken = resp.body.accessToken;
      expect(resp.body.passwordChangeRequired).toBe(true);
    });

    it('returns 403 PASSWORD_CHANGE_REQUIRED when hitting protected endpoint', async () => {
      // Use /iam/supervisors — a protected endpoint that requires auth and non-mustChangePassword
      const resp = await request(app.getHttpServer())
        .get('/iam/supervisors')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      // Response body should have the code or error message
      const body = resp.body as { code?: string; message?: string | { code?: string } };
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).toContain('PASSWORD_CHANGE_REQUIRED');
    });
  });

  // ─── Change password ───────────────────────────────────────────────────────

  describe('POST /auth/change-password', () => {
    let accessToken: string;
    const newPassword = 'NewSecure123!';

    beforeAll(async () => {
      // Reset admin to original state with mustChangePassword=true
      await resetAdmin(prisma, true);

      const resp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: 'change-pass-device' })
        .expect(200);
      accessToken = resp.body.accessToken;
      expect(resp.body.passwordChangeRequired).toBe(true);
    });

    it('clears mustChangePassword and returns 200', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ oldPassword: ADMIN_PASSWORD, newPassword })
        .expect(200);

      const updated = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
      expect(updated!.mustChangePassword).toBe(false);
    });

    it('allows protected endpoint access after password change', async () => {
      // Login fresh with new password (no mustChangePassword)
      const resp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: newPassword, deviceId: 'post-change-device' })
        .expect(200);

      expect(resp.body.passwordChangeRequired).toBe(false);

      // A protected endpoint should be accessible (no mustChangePassword block)
      // Use /iam/supervisors — SYSTEM_ADMIN has access (IAM_READ_ROLES includes SYSTEM_ADMIN)
      await request(app.getHttpServer())
        .get('/iam/supervisors')
        .set('Authorization', `Bearer ${resp.body.accessToken}`)
        .expect(200);
    });
  });

  // ─── Device revocation ────────────────────────────────────────────────────

  describe('Device revocation', () => {
    let accessToken: string;
    let refreshToken: string;
    const deviceId = 'revoke-test-device';

    beforeAll(async () => {
      // Admin with mustChangePassword=false so we can access protected endpoints
      await resetAdmin(prisma, false);

      const resp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId })
        .expect(200);
      accessToken = resp.body.accessToken;
      refreshToken = resp.body.refreshToken;
    });

    it('revokes device session via DELETE /auth/sessions/:deviceId', async () => {
      await request(app.getHttpServer())
        .delete(`/auth/sessions/${deviceId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify DB row has revokedAt set
      const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
      const session = await prisma.deviceSession.findFirst({
        where: { userId: adminUser!.id, deviceId },
      });
      expect(session!.revokedAt).not.toBeNull();
    });

    it('rejects POST /auth/refresh from a revoked device', async () => {
      const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ userId: adminUser!.id, deviceId, refreshToken })
        .expect(401);
    });
  });
});
