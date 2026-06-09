/**
 * SUP-01..06 — Create Supervisor Integration Suite.
 *
 * POST /iam/supervisors — compound User + Supervisor write.
 *
 * Scenarios:
 *   SUP-01 — SYSTEM_ADMIN creates supervisor (happy path): 201 { id },
 *            User row has role SUPERVISOR + mustChangePassword=true,
 *            Supervisor row linked correctly.
 *   SUP-02 — TALENTO_HUMANO creates supervisor: 201 (same write roles).
 *   SUP-03 — Duplicate email → 409 Conflict.
 *   SUP-04 — Bad area value → 400 (ValidationPipe rejects before handler).
 *   SUP-05 — Municipio not in zone → 400.
 *   SUP-06 — SUPERVISOR role caller → 403 (wrong role).
 *
 * Teardown: FK-safe order (Supervisor → DeviceSession → User).
 * Uses seeded zones/municipios from jest-global-setup.ts.
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
import { STORAGE_PORT } from '../storage/domain/storage.port';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';
const TEST_DEVICE = 'sup-create-test-device';
const TEST_PASSWORD = 'TestPass123!';

function mintToken(claims: {
  sub: string;
  role: string;
  zoneId?: string;
  supervisorId?: string;
  mustChangePassword?: boolean;
}): string {
  return jwt.sign(
    {
      sub: claims.sub,
      role: claims.role,
      zoneId: claims.zoneId,
      supervisorId: claims.supervisorId,
      deviceId: TEST_DEVICE,
      mustChangePassword: claims.mustChangePassword ?? false,
    },
    DEV_JWT_SECRET,
    { expiresIn: '15m' },
  );
}

const mockStoragePort = {
  putObject: jest.fn().mockResolvedValue(undefined),
  getPresignedGetUrl: jest.fn().mockResolvedValue('https://minio.example/presigned'),
  getPresignedPutUrl: jest.fn().mockResolvedValue('https://minio.example/presigned-put'),
  removeObject: jest.fn().mockResolvedValue(undefined),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Create Supervisor Integration Suite (SUP-01..06)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Fixture ids
  let zoneZ1Id: string;
  let zoneZ2Id: string;        // Different zone for municipio-mismatch test
  let municipioM1Id: string;   // In zoneZ1
  let municipioM2Id: string;   // In zoneZ2 (for mismatch test)
  let adminUserId: string;
  let talentoUserId: string;
  let existingSupervisorUserId: string;
  let existingSupervisorId: string;

  // Tokens
  let tokenAdmin: string;
  let tokenTalento: string;
  let tokenSupervisor: string;

  // Cleanup tracking
  const createdUserIds: string[] = [];
  const createdSupervisorIds: string[] = [];

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STORAGE_PORT)
      .useValue(mockStoragePort)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = createPrismaClient();

    // Resolve seeded zones
    const zoneUraba = await prisma.zone.findFirst({ where: { name: 'Zona Urabá' } });
    if (!zoneUraba) throw new Error('Seeded zone Zona Urabá not found');
    zoneZ1Id = zoneUraba.id;

    // Pick a second zone for the mismatch test — any zone that is not zoneZ1
    const zoneTwo = await prisma.zone.findFirst({ where: { id: { not: zoneZ1Id } } });
    if (!zoneTwo) throw new Error('Need at least 2 seeded zones for mismatch test');
    zoneZ2Id = zoneTwo.id;

    // Resolve seeded municipio in zoneZ1
    const muni1 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ1Id } });
    if (!muni1) throw new Error('No seeded municipio in Zona Urabá');
    municipioM1Id = muni1.id;

    // Resolve or create a municipio in zoneZ2 for the mismatch test
    let muni2 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ2Id } });
    if (!muni2) {
      muni2 = await prisma.municipio.create({
        data: { name: 'Test-Muni-Z2', zoneId: zoneZ2Id },
      });
    }
    municipioM2Id = muni2.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Clean leftover fixture users
    const fixtureEmails = [
      'admin-sup-create-test@futuragest.co',
      'talento-sup-create-test@futuragest.co',
      'existing-sup-create-test@futuragest.co',
    ];
    const leftover = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    if (leftover.length > 0) {
      const ids = leftover.map((u) => u.id);
      const sups = await prisma.supervisor.findMany({ where: { userId: { in: ids } }, select: { id: true } });
      const supIds = sups.map((s) => s.id);
      if (supIds.length > 0) {
        await prisma.novedad.deleteMany({ where: { supervisorId: { in: supIds } } });
        await prisma.attendance.deleteMany({ where: { supervisorId: { in: supIds } } });
        await prisma.operario.deleteMany({ where: { supervisorId: { in: supIds } } });
        await prisma.supervisor.deleteMany({ where: { id: { in: supIds } } });
      }
      await prisma.deviceSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    // Admin user
    const adminUser = await prisma.user.create({
      data: { email: 'admin-sup-create-test@futuragest.co', passwordHash, role: 'SYSTEM_ADMIN', mustChangePassword: false },
    });
    adminUserId = adminUser.id;
    createdUserIds.push(adminUserId);
    await prisma.deviceSession.create({
      data: { userId: adminUserId, deviceId: TEST_DEVICE, refreshTokenHash: await argon2.hash('dummy') },
    });

    // TALENTO_HUMANO user
    const talentoUser = await prisma.user.create({
      data: { email: 'talento-sup-create-test@futuragest.co', passwordHash, role: 'TALENTO_HUMANO', mustChangePassword: false },
    });
    talentoUserId = talentoUser.id;
    createdUserIds.push(talentoUserId);
    await prisma.deviceSession.create({
      data: { userId: talentoUserId, deviceId: TEST_DEVICE, refreshTokenHash: await argon2.hash('dummy') },
    });

    // Existing supervisor (for SUP-06 forbidden test + SUP-03 email collision)
    const existingSupUser = await prisma.user.create({
      data: { email: 'existing-sup-create-test@futuragest.co', passwordHash, role: 'SUPERVISOR', mustChangePassword: false },
    });
    existingSupervisorUserId = existingSupUser.id;
    createdUserIds.push(existingSupervisorUserId);
    await prisma.deviceSession.create({
      data: { userId: existingSupervisorUserId, deviceId: TEST_DEVICE, refreshTokenHash: await argon2.hash('dummy') },
    });
    const existingSup = await prisma.supervisor.create({
      data: { userId: existingSupervisorUserId, municipioId: municipioM1Id, zoneId: zoneZ1Id, area: 'BARRIDO' },
    });
    existingSupervisorId = existingSup.id;
    createdSupervisorIds.push(existingSupervisorId);

    // Mint tokens
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
    tokenTalento = mintToken({ sub: talentoUserId, role: 'TALENTO_HUMANO' });
    tokenSupervisor = mintToken({ sub: existingSupervisorUserId, role: 'SUPERVISOR', supervisorId: existingSupervisorId, zoneId: zoneZ1Id });
  }, 30_000);

  afterAll(async () => {
    // FK-safe cleanup: Operario → Supervisor → DeviceSession → User
    // Remove any supervisors created by the tests (tracked by id lookups)
    if (createdSupervisorIds.length > 0) {
      await prisma.operario.deleteMany({ where: { supervisorId: { in: createdSupervisorIds } } });
      await prisma.supervisor.deleteMany({ where: { id: { in: createdSupervisorIds } } });
    }
    // Remove all user-side fixtures (DeviceSessions + Users)
    for (const userId of createdUserIds) {
      await prisma.deviceSession.deleteMany({ where: { userId } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }

    await prisma.$disconnect();
    await app.close();
  });

  // ─── Helper ───────────────────────────────────────────────────────────────

  /**
   * Builds a valid create-supervisor body; individual fields can be overridden.
   * Uses a timestamp-based email to guarantee uniqueness across test runs.
   */
  function makeBody(overrides: Partial<{
    email: string;
    password: string;
    area: string;
    zoneId: string;
    municipioId: string;
  }> = {}) {
    return {
      email: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.co`,
      password: 'Secure1234!',
      area: 'BARRIDO',
      zoneId: zoneZ1Id,
      municipioId: municipioM1Id,
      ...overrides,
    };
  }

  // ─── SUP-01 — Happy path (SYSTEM_ADMIN) ──────────────────────────────────

  it('SUP-01 — SYSTEM_ADMIN creates supervisor: 201, User + Supervisor persisted correctly', async () => {
    const body = makeBody();

    const resp = await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(body)
      .expect(201);

    expect(resp.body).toHaveProperty('id');
    const supId = resp.body.id as string;
    createdSupervisorIds.push(supId);

    // Verify Supervisor row
    const sup = await prisma.supervisor.findUnique({ where: { id: supId } });
    expect(sup).not.toBeNull();
    expect(sup!.zoneId).toBe(zoneZ1Id);
    expect(sup!.municipioId).toBe(municipioM1Id);
    expect(sup!.area).toBe('BARRIDO');

    // Verify User row
    const user = await prisma.user.findUnique({ where: { id: sup!.userId } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(body.email);
    expect(user!.role).toBe('SUPERVISOR');
    expect(user!.mustChangePassword).toBe(true);
    // passwordHash must never equal the plaintext
    expect(user!.passwordHash).not.toBe(body.password);

    // Track user for cleanup
    createdUserIds.push(user!.id);
  });

  // ─── SUP-02 — TALENTO_HUMANO ──────────────────────────────────────────────

  it('SUP-02 — TALENTO_HUMANO creates supervisor: 201', async () => {
    const body = makeBody({ area: 'RECOLECCION' });

    const resp = await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenTalento}`)
      .send(body)
      .expect(201);

    const supId = resp.body.id as string;
    createdSupervisorIds.push(supId);

    const sup = await prisma.supervisor.findUnique({ where: { id: supId } });
    expect(sup!.area).toBe('RECOLECCION');
    const user = await prisma.user.findUnique({ where: { id: sup!.userId } });
    createdUserIds.push(user!.id);
  });

  // ─── SUP-03 — Duplicate email → 409 ──────────────────────────────────────

  it('SUP-03 — Duplicate email → 409, no partial rows', async () => {
    const body = makeBody({ email: 'existing-sup-create-test@futuragest.co' });

    await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(body)
      .expect(409);

    // Supervisor count for that email must remain 1 (the pre-created fixture)
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    expect(user).not.toBeNull(); // user exists (fixture)
    const supCount = await prisma.supervisor.count({ where: { userId: user!.id } });
    expect(supCount).toBe(1);
  });

  // ─── SUP-04 — Bad area → 400 (ValidationPipe) ────────────────────────────

  it('SUP-04 — Invalid area value → 400', async () => {
    const body = makeBody({ area: 'INVALID_AREA' });

    await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(body)
      .expect(400);
  });

  // ─── SUP-05 — Municipio not in zone → 400 ────────────────────────────────

  it('SUP-05 — Municipio not in zone → 400', async () => {
    // zoneZ1Id + municipioM2Id (which belongs to zoneZ2) → mismatch
    const body = makeBody({ zoneId: zoneZ1Id, municipioId: municipioM2Id });

    await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(body)
      .expect(400);
  });

  // ─── SUP-06 — SUPERVISOR role → 403 ──────────────────────────────────────

  it('SUP-06 — SUPERVISOR caller → 403', async () => {
    const body = makeBody();

    await request(app.getHttpServer())
      .post('/iam/supervisors')
      .set('Authorization', `Bearer ${tokenSupervisor}`)
      .send(body)
      .expect(403);
  });

  // ─── No token → 401 ──────────────────────────────────────────────────────

  it('No token → 401', async () => {
    const body = makeBody();

    await request(app.getHttpServer())
      .post('/iam/supervisors')
      .send(body)
      .expect(401);
  });
});
