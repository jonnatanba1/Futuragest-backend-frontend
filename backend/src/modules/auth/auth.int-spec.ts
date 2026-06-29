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
import * as jwt from 'jsonwebtoken';

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
        where: { userId: adminUser?.id, deviceId },
      });

      expect(session).not.toBeNull();
      // The hash must differ from the plaintext token
      expect(session?.refreshTokenHash).not.toBe(refreshToken);
      // And must not be empty
      expect(session?.refreshTokenHash.length).toBeGreaterThan(10);
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
      expect(updated?.mustChangePassword).toBe(false);
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
        where: { userId: adminUser?.id, deviceId },
      });
      expect(session?.revokedAt).not.toBeNull();
    });

    it('rejects POST /auth/refresh from a revoked device', async () => {
      const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ userId: adminUser?.id, deviceId, refreshToken })
        .expect(401);
    });
  });

  // ─── GET /auth/me ─────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';
    const ME_DEVICE = 'get-me-test-device';

    function mintToken(claims: {
      sub: string;
      role: string;
      zoneId?: string;
      supervisorId?: string;
      deviceId?: string;
      mustChangePassword?: boolean;
    }): string {
      return jwt.sign(
        {
          sub: claims.sub,
          role: claims.role,
          zoneId: claims.zoneId,
          supervisorId: claims.supervisorId,
          deviceId: claims.deviceId ?? ME_DEVICE,
          mustChangePassword: claims.mustChangePassword ?? false,
        },
        DEV_JWT_SECRET,
        { expiresIn: '15m' },
      );
    }

    // ── Fixture state ──────────────────────────────────────────────────────

    let adminUser: { id: string };
    let supervisorUser: { id: string };
    let supervisorRecord: { id: string; area: string; zoneId: string; municipioId: string };
    let supervisorZone: { id: string; name: string };
    let supervisorMunicipio: { id: string; name: string };

    // COORDINADOR fixtures created in beforeAll
    let coordWithZoneUserId: string;
    let coordWithZoneId: string;
    let coordWithZoneName: string;
    let coordNoZoneUserId: string;

    // Tokens
    let tokenAdmin: string;
    let tokenSupervisor: string;
    let tokenCoordWithZone: string;
    let tokenCoordNoZone: string;

    beforeAll(async () => {
      // ── Reset admin to known state ──────────────────────────────────────
      // Previous describe blocks may have cleared mustChangePassword; restore it.
      await resetAdmin(prisma, true);

      // ── Load seeded data ────────────────────────────────────────────────

      const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
      adminUser = admin;

      // Use supervisor-1 (first seeded supervisor — Zona Urabá / Apartadó / BARRIDO)
      const sup1 = await prisma.user.findUniqueOrThrow({
        where: { email: 'supervisor-1@futuragest.co' },
      });
      supervisorUser = sup1;

      const supRecord = await prisma.supervisor.findUniqueOrThrow({
        where: { userId: sup1.id },
        include: {
          zone: { select: { id: true, name: true } },
          municipio: { select: { id: true, name: true } },
        },
      });
      supervisorRecord = {
        id: supRecord.id,
        area: supRecord.area,
        zoneId: supRecord.zoneId,
        municipioId: supRecord.municipioId,
      };
      supervisorZone = supRecord.zone;
      supervisorMunicipio = supRecord.municipio;

      // ── Create COORDINADOR with zone ────────────────────────────────────
      // Reuse the first zone (Zona Urabá) — only if no coordinador assigned yet
      const urabaZone = await prisma.zone.findUniqueOrThrow({ where: { name: 'Zona Urabá' } });

      const coordWithZone = await prisma.user.create({
        data: {
          email: 'coord-with-zone@test.futuragest',
          passwordHash: 'placeholder-not-used',
          role: 'COORDINADOR',
          mustChangePassword: false,
          coordinatedZoneId: urabaZone.id,
        },
      });
      coordWithZoneUserId = coordWithZone.id;
      coordWithZoneId = urabaZone.id;
      coordWithZoneName = urabaZone.name;

      // ── Create COORDINADOR without zone ─────────────────────────────────
      const coordNoZone = await prisma.user.create({
        data: {
          email: 'coord-no-zone@test.futuragest',
          passwordHash: 'placeholder-not-used',
          role: 'COORDINADOR',
          mustChangePassword: false,
          coordinatedZoneId: null,
        },
      });
      coordNoZoneUserId = coordNoZone.id;

      // ── Create device sessions for mintToken to pass the guard ──────────
      const dummyHash = 'test-hash-not-checked';
      await prisma.deviceSession.createMany({
        data: [
          { userId: admin.id, deviceId: ME_DEVICE, refreshTokenHash: dummyHash, lastSeenAt: new Date() },
          { userId: sup1.id, deviceId: ME_DEVICE, refreshTokenHash: dummyHash, lastSeenAt: new Date() },
          { userId: coordWithZone.id, deviceId: ME_DEVICE, refreshTokenHash: dummyHash, lastSeenAt: new Date() },
          { userId: coordNoZone.id, deviceId: ME_DEVICE, refreshTokenHash: dummyHash, lastSeenAt: new Date() },
        ],
        skipDuplicates: true,
      });

      // ── Mint tokens ─────────────────────────────────────────────────────
      tokenAdmin = mintToken({ sub: admin.id, role: 'SYSTEM_ADMIN', mustChangePassword: true });
      tokenSupervisor = mintToken({ sub: sup1.id, role: 'SUPERVISOR', supervisorId: supRecord.id });
      tokenCoordWithZone = mintToken({ sub: coordWithZone.id, role: 'COORDINADOR', zoneId: urabaZone.id });
      tokenCoordNoZone = mintToken({ sub: coordNoZone.id, role: 'COORDINADOR' });
    }, 30_000);

    afterAll(async () => {
      // Clean up COORDINADOR fixture users (FK-safe order)
      if (coordWithZoneUserId) {
        await prisma.deviceSession.deleteMany({ where: { userId: coordWithZoneUserId } });
        // Disconnect coordinatedZoneId before deleting user (Zone.coordinador @unique relation)
        await prisma.user.update({
          where: { id: coordWithZoneUserId },
          data: { coordinatedZoneId: null },
        });
        await prisma.user.delete({ where: { id: coordWithZoneUserId } });
      }
      if (coordNoZoneUserId) {
        await prisma.deviceSession.deleteMany({ where: { userId: coordNoZoneUserId } });
        await prisma.user.delete({ where: { id: coordNoZoneUserId } });
      }
      // Clean up admin and supervisor device sessions created in this suite
      if (adminUser) {
        await prisma.deviceSession.deleteMany({ where: { userId: adminUser.id, deviceId: ME_DEVICE } });
      }
      if (supervisorUser) {
        await prisma.deviceSession.deleteMany({ where: { userId: supervisorUser.id, deviceId: ME_DEVICE } });
      }
    });

    // ── ME-1: SYSTEM_ADMIN — 200, base shape, no scope fields ─────────────

    it('ME-1: SYSTEM_ADMIN returns 200 with base shape; no zone or supervisor keys', async () => {
      const resp = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resp.body.id).toBe(adminUser.id);
      expect(resp.body.email).toBe(ADMIN_EMAIL);
      expect(resp.body.role).toBe('SYSTEM_ADMIN');
      expect(resp.body.mustChangePassword).toBe(true);
      // Global roles: explicit null on scope fields
      expect(resp.body).toHaveProperty('coordinatedZone', null);
      expect(resp.body).toHaveProperty('supervisor', null);
    });

    // ── ME-5: COORDINADOR with zone ────────────────────────────────────────

    it('ME-5: COORDINADOR with zone returns 200 with coordinatedZone block', async () => {
      const resp = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenCoordWithZone}`)
        .expect(200);

      expect(resp.body.role).toBe('COORDINADOR');
      expect(resp.body.coordinatedZone).toEqual({ id: coordWithZoneId, name: coordWithZoneName });
      expect(resp.body.supervisor).toBeNull();
      // Zone name must come from DB (not from JWT claims)
      expect(resp.body.coordinatedZone.name).toBe('Zona Urabá');
    });

    // ── ME-6: COORDINADOR no zone ─────────────────────────────────────────

    it('ME-6: COORDINADOR without zone returns 200 with coordinatedZone: null', async () => {
      const resp = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenCoordNoZone}`)
        .expect(200);

      expect(resp.body.role).toBe('COORDINADOR');
      // Key must be present with value null (INV-7)
      expect(resp.body).toHaveProperty('coordinatedZone', null);
      expect(resp.body.supervisor).toBeNull();
    });

    // ── ME-7: SUPERVISOR — full supervisor block ───────────────────────────

    it('ME-7: SUPERVISOR returns 200 with full supervisor block; supervisor.id == Supervisor.id', async () => {
      const resp = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenSupervisor}`)
        .expect(200);

      expect(resp.body.role).toBe('SUPERVISOR');
      expect(resp.body.coordinatedZone).toBeNull();

      const sup = resp.body.supervisor;
      expect(sup).toBeDefined();
      // INV-5: supervisor.id must be the Supervisor table PK, NOT User.id
      expect(sup.id).toBe(supervisorRecord.id);
      expect(sup.id).not.toBe(supervisorUser.id);
      expect(sup.area).toBe(supervisorRecord.area);
      expect(sup.zone).toEqual({ id: supervisorZone.id, name: supervisorZone.name });
      expect(sup.municipio).toEqual({ id: supervisorMunicipio.id, name: supervisorMunicipio.name });
    });

    // ── ME-8: mustChangePassword=true → 200 not 403 ───────────────────────

    it('ME-8: user with mustChangePassword=true receives 200 (SkipMustChangePasswordCheck)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resp.body.mustChangePassword).toBe(true);
    });

    // ── ME-9: no token → 401 ──────────────────────────────────────────────

    it('ME-9: no token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    // ── ME-10: invalid token → 401 ────────────────────────────────────────

    it('ME-10: invalid token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt')
        .expect(401);
    });

    // ── ME-11: revoked device session → 401 ──────────────────────────────

    it('ME-11: revoked device session returns 401', async () => {
      // Create a fresh user + session, revoke it, then attempt /auth/me
      const revokedUser = await prisma.user.create({
        data: {
          email: 'revoked-me@test.futuragest',
          passwordHash: 'placeholder',
          role: 'SYSTEM_ADMIN',
          mustChangePassword: false,
        },
      });
      const revokedDeviceId = 'revoked-me-device';
      await prisma.deviceSession.create({
        data: {
          userId: revokedUser.id,
          deviceId: revokedDeviceId,
          refreshTokenHash: 'h',
          revokedAt: new Date(), // immediately revoked
          lastSeenAt: new Date(),
        },
      });

      const token = mintToken({ sub: revokedUser.id, role: 'SYSTEM_ADMIN', deviceId: revokedDeviceId });

      try {
        await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      } finally {
        await prisma.deviceSession.deleteMany({ where: { userId: revokedUser.id } });
        await prisma.user.delete({ where: { id: revokedUser.id } });
      }
    });
  });
});
