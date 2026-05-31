/**
 * Asistencia integration suite.
 *
 * Covers AT-01..AT-11, AT-18..AT-29 (check-in, check-out, signature, reads).
 * StoragePort is MOCKED — no real MinIO calls.
 * Uses --runInBand (configured in test:int script).
 *
 * Fixture setup:
 * - Zone Z1 (seeded): 'Zona Urabá'
 * - Zone Z2 (seeded): 'Zona Bajo Cauca'
 * - Supervisor S1 in Z1 (synthetic test supervisor)
 * - Supervisor S2 in Z2 (synthetic — for cross-scope tests)
 * - Operario O1 under S1
 * - Operario O2 under S2
 * - COORDINADOR C1 in Z1, C2 in Z2
 * - SYSTEM_ADMIN for global reads
 *
 * Teardown: Attendance → Operarios → Supervisors → DeviceSessions → Users (FK-safe).
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

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';
const TEST_DEVICE = 'asistencia-test-device';
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

// ─── Mock StoragePort ──────────────────────────────────────────────────────────

const mockStoragePort = {
  putObject: jest.fn().mockResolvedValue(undefined),
  getPresignedGetUrl: jest.fn().mockResolvedValue('https://minio.example/presigned'),
  getPresignedPutUrl: jest.fn().mockResolvedValue('https://minio.example/presigned-put'),
  removeObject: jest.fn().mockResolvedValue(undefined),
};

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('Asistencia Integration Suite', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Fixture ids
  let zoneZ1Id: string;
  let zoneZ2Id: string;
  let s1UserId: string;
  let s2UserId: string;
  let s1Id: string; // supervisor.id
  let s2Id: string;
  let o1Id: string; // operario.id
  let o2Id: string;
  let c1UserId: string;
  let c2UserId: string;
  let adminUserId: string;
  let municipioIdZ1: string;
  let municipioIdZ2: string;

  // Tokens
  let tokenS1: string;
  let tokenS2: string;
  let tokenC1: string;
  let tokenC2: string;
  let tokenAdmin: string;
  let tokenCoord: string; // alias for tokenC1

  // Cleanup tracking
  const createdUserIds: string[] = [];

  // ── Setup ────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Build module with mocked StoragePort
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
    const zoneZ1 = await prisma.zone.findFirst({ where: { name: 'Zona Urabá' } });
    const zoneZ2 = await prisma.zone.findFirst({ where: { name: 'Zona Bajo Cauca' } });
    if (!zoneZ1 || !zoneZ2) {
      throw new Error('Seeded zones not found — run globalSetup first');
    }
    zoneZ1Id = zoneZ1.id;
    zoneZ2Id = zoneZ2.id;

    // Resolve seeded municipios for each zone
    const m1 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ1Id } });
    const m2 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ2Id } });
    if (!m1 || !m2) throw new Error('Seeded municipios not found');
    municipioIdZ1 = m1.id;
    municipioIdZ2 = m2.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Clean leftover test fixtures from a previous run (idempotent)
    const fixtureEmails = [
      's1-asistencia@futuragest.co',
      's2-asistencia@futuragest.co',
      'c1-asistencia@futuragest.co',
      'c2-asistencia@futuragest.co',
      'admin-asistencia@futuragest.co',
    ];
    const leftover = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    if (leftover.length > 0) {
      const leftoverIds = leftover.map((u) => u.id);
      // Find supervisors for cleanup
      const leftoverSups = await prisma.supervisor.findMany({
        where: { userId: { in: leftoverIds } },
        select: { id: true },
      });
      const leftoverSupIds = leftoverSups.map((s) => s.id);
      if (leftoverSupIds.length > 0) {
        await prisma.attendance.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.operario.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.supervisor.deleteMany({ where: { id: { in: leftoverSupIds } } });
      }
      await prisma.deviceSession.deleteMany({ where: { userId: { in: leftoverIds } } });
      await prisma.user.deleteMany({ where: { id: { in: leftoverIds } } });
    }

    async function createUser(email: string, role: string) {
      const user = await prisma.user.create({
        data: { email, passwordHash, role: role as any, mustChangePassword: false },
      });
      createdUserIds.push(user.id);
      await prisma.deviceSession.upsert({
        where: { userId_deviceId: { userId: user.id, deviceId: TEST_DEVICE } },
        update: { revokedAt: null },
        create: {
          userId: user.id,
          deviceId: TEST_DEVICE,
          refreshTokenHash: await argon2.hash('dummy-refresh'),
        },
      });
      return user;
    }

    // Create test supervisor S1 in Zone Z1
    const s1User = await createUser('s1-asistencia@futuragest.co', 'SUPERVISOR');
    s1UserId = s1User.id;
    const s1Sup = await prisma.supervisor.create({
      data: {
        userId: s1UserId,
        municipioId: municipioIdZ1,
        zoneId: zoneZ1Id,
        area: 'BARRIDO',
      },
    });
    s1Id = s1Sup.id;

    // Create test supervisor S2 in Zone Z2
    const s2User = await createUser('s2-asistencia@futuragest.co', 'SUPERVISOR');
    s2UserId = s2User.id;
    const s2Sup = await prisma.supervisor.create({
      data: {
        userId: s2UserId,
        municipioId: municipioIdZ2,
        zoneId: zoneZ2Id,
        area: 'BARRIDO',
      },
    });
    s2Id = s2Sup.id;

    // Create Operario O1 under S1
    const o1 = await prisma.operario.create({
      data: { fullName: 'Test Operario 1', documento: 'DOC-TEST-001', supervisorId: s1Id },
    });
    o1Id = o1.id;

    // Create Operario O2 under S2
    const o2 = await prisma.operario.create({
      data: { fullName: 'Test Operario 2', documento: 'DOC-TEST-002', supervisorId: s2Id },
    });
    o2Id = o2.id;

    // Create COORDINADOR C1 for Z1 and C2 for Z2
    const c1User = await createUser('c1-asistencia@futuragest.co', 'COORDINADOR');
    c1UserId = c1User.id;
    const c2User = await createUser('c2-asistencia@futuragest.co', 'COORDINADOR');
    c2UserId = c2User.id;

    // Create SYSTEM_ADMIN
    const adminUser = await createUser('admin-asistencia@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = adminUser.id;

    // Mint tokens
    tokenS1 = mintToken({ sub: s1UserId, role: 'SUPERVISOR', supervisorId: s1Id, zoneId: zoneZ1Id });
    tokenS2 = mintToken({ sub: s2UserId, role: 'SUPERVISOR', supervisorId: s2Id, zoneId: zoneZ2Id });
    tokenC1 = mintToken({ sub: c1UserId, role: 'COORDINADOR', zoneId: zoneZ1Id });
    tokenC2 = mintToken({ sub: c2UserId, role: 'COORDINADOR', zoneId: zoneZ2Id });
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
    tokenCoord = tokenC1;
  }, 60_000);

  afterAll(async () => {
    // FK-safe teardown: Attendance → Operarios → Supervisors → DeviceSessions → Users
    const supIds = [s1Id, s2Id].filter(Boolean);
    if (supIds.length > 0) {
      await prisma.attendance.deleteMany({ where: { supervisorId: { in: supIds } } });
      await prisma.operario.deleteMany({ where: { supervisorId: { in: supIds } } });
      await prisma.supervisor.deleteMany({ where: { id: { in: supIds } } });
    }
    for (const userId of createdUserIds) {
      await prisma.deviceSession.deleteMany({ where: { userId } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  // Helper to create attendance via check-in (returns supertest Test, not a Promise)
  function checkIn(opts: {
    token: string;
    operarioId?: string;
    date?: string;
    lat?: number;
    lng?: number;
    clientRef?: string;
    extraBody?: Record<string, unknown>;
  }) {
    return request(app.getHttpServer())
      .post('/asistencia/check-in')
      .set('Authorization', `Bearer ${opts.token}`)
      .send({
        operarioId: opts.operarioId ?? o1Id,
        date: opts.date ?? '2026-05-31',
        checkInCapturedAt: new Date().toISOString(),
        checkInLat: opts.lat ?? 7.5,
        checkInLng: opts.lng ?? -76.5,
        clientRef: opts.clientRef ?? `test-ref-${Date.now()}-${Math.random()}`,
        ...(opts.extraBody ?? {}),
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK-IN scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Check-in', () => {
    it('AT-01 — SUPERVISOR check-in for own operario → 201 with supervisorId/zoneId from JWT', async () => {
      const clientRef = `test-ci-01-${Date.now()}`;
      const resp = await checkIn({ token: tokenS1, clientRef }).expect(201);

      const body = resp.body as any;
      expect(body.id).toBeDefined();
      expect(body.supervisorId).toBe(s1Id);   // from JWT, not body
      expect(body.zoneId).toBe(zoneZ1Id);      // from JWT, not body
      expect(body.operarioId).toBe(o1Id);
      expect(body.completedAt).toBeNull();
      expect(body.signatureKey).toBeNull();
      expect(body.checkInReceivedAt).toBeDefined();

      // Cleanup
      await prisma.attendance.deleteMany({ where: { clientRef } });
    });

    it('AT-02 — supervisorId/zoneId in body are IGNORED; JWT scope values persist', async () => {
      const clientRef = `test-ci-02-${Date.now()}`;
      const resp = await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          operarioId: o1Id,
          date: '2026-05-31',
          checkInCapturedAt: new Date().toISOString(),
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef,
          supervisorId: 'BOGUS-ID',
          zoneId: 'BOGUS-ZONE',
        })
        .expect(201);

      const body = resp.body as any;
      expect(body.supervisorId).toBe(s1Id);
      expect(body.zoneId).toBe(zoneZ1Id);

      await prisma.attendance.deleteMany({ where: { clientRef } });
    });

    it('AT-04 — idempotent clientRef: first call → 201; second call with same clientRef → EXACTLY 200 with same record', async () => {
      const clientRef = `test-ci-04-${Date.now()}`;

      // First call → 201 Created (new row)
      const first = await checkIn({ token: tokenS1, clientRef }).expect(201);
      const firstId = (first.body as any).id;

      // Second call → 200 OK (existing record returned, no new row created)
      const second = await checkIn({ token: tokenS1, clientRef }).expect(200);
      expect((second.body as any).id).toBe(firstId);

      // Only one row exists
      const count = await prisma.attendance.count({ where: { clientRef } });
      expect(count).toBe(1);

      await prisma.attendance.deleteMany({ where: { clientRef } });
    });

    it('AT-03 — duplicate operario+date with DIFFERENT clientRef → 409', async () => {
      const date = '2025-01-01';
      const firstRef = `test-ci-03a-${Date.now()}`;
      const secondRef = `test-ci-03b-${Date.now()}`;

      // Create first attendance
      await checkIn({ token: tokenS1, date, clientRef: firstRef }).expect(201);

      // Attempt second with same operario+date but different clientRef → 409
      await checkIn({ token: tokenS1, date, clientRef: secondRef }).expect(409);

      // Only one row exists
      const count = await prisma.attendance.count({
        where: { operarioId: o1Id, date },
      });
      expect(count).toBe(1);

      await prisma.attendance.deleteMany({ where: { date, operarioId: o1Id } });
    });

    it('AT-09 — no token → 401', async () => {
      await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .send({ operarioId: o1Id, date: '2026-05-31', checkInLat: 7.5, checkInLng: -76.5, clientRef: 'x' })
        .expect(401);
    });

    it('AT-06 — non-SUPERVISOR role (COORDINADOR) check-in → 403', async () => {
      await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .set('Authorization', `Bearer ${tokenC1}`)
        .send({ operarioId: o1Id, date: '2026-05-31', checkInLat: 7.5, checkInLng: -76.5, clientRef: 'coord-ref' })
        .expect(403);
    });

    it('AT-07 — GPS lat out of range → 400', async () => {
      await checkIn({ token: tokenS1, lat: 999 }).expect(400);
    });

    it('AT-08 — GPS lng out of range → 400', async () => {
      await checkIn({ token: tokenS1, lng: 200 }).expect(400);
    });

    it('AT-10 — missing clientRef → 400 (ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ operarioId: o1Id, date: '2026-05-31', checkInLat: 7.5, checkInLng: -76.5 })
        .expect(400);
    });

    it('AT-05 — operario from different supervisor → 404 (fail-closed)', async () => {
      // o2Id belongs to S2, but we use S1 token
      await checkIn({ token: tokenS1, operarioId: o2Id }).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNATURE scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Signature upload', () => {
    let attId: string;
    const sigDate = '2025-02-01';
    const sigRef = `sig-test-${Date.now()}`;

    beforeAll(async () => {
      // Create an attendance record for signature tests
      const resp = await checkIn({ token: tokenS1, date: sigDate, clientRef: sigRef }).expect(201);
      attId = (resp.body as any).id;
      jest.clearAllMocks();
    });

    afterAll(async () => {
      await prisma.attendance.deleteMany({ where: { id: attId } });
    });

    it('AT-11 — upload signature for own in-progress record → 200 + signatureKey set', async () => {
      const expectedKey = `signatures/${s1Id}/${attId}.png`;
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);

      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'signature.png',
          contentType: 'image/png',
        })
        .expect(200);

      const body = resp.body as any;
      expect(body.attendanceId).toBe(attId);
      expect(body.signatureKey).toBe(expectedKey);

      // Verify StoragePort.putObject was called
      expect(mockStoragePort.putObject).toHaveBeenCalledWith(
        'futuragest',
        expectedKey,
        expect.any(Buffer),
        'image/png',
      );

      // Verify DB updated
      const dbRecord = await prisma.attendance.findUnique({ where: { id: attId } });
      expect(dbRecord?.signatureKey).toBe(expectedKey);
    });

    it('AT-12 — upload signature for out-of-scope record (S2 token) → 404', async () => {
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS2}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'signature.png',
          contentType: 'image/png',
        })
        .expect(404);
    });

    it('AT-17 — wrong mime type → 422', async () => {
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from('%PDF'), {
          filename: 'signature.pdf',
          contentType: 'application/pdf',
        })
        .expect(422);
    });

    it('AT-16 — re-upload overwrites signatureKey (idempotent)', async () => {
      const expectedKey = `signatures/${s1Id}/${attId}.png`;
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);

      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'signature2.png',
          contentType: 'image/png',
        })
        .expect(200);

      expect((resp.body as any).signatureKey).toBe(expectedKey);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK-OUT scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Check-out', () => {
    it('AT-19 — check-out WITHOUT signature → 422 SignatureRequiredError', async () => {
      const clientRef = `co-no-sig-${Date.now()}`;
      const ciResp = await checkIn({ token: tokenS1, date: '2025-03-01', clientRef }).expect(201);
      const attId = (ciResp.body as any).id;

      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(422);

      // completedAt must remain null
      const db = await prisma.attendance.findUnique({ where: { id: attId } });
      expect(db?.completedAt).toBeNull();

      await prisma.attendance.deleteMany({ where: { id: attId } });
    });

    it('AT-18 — check-out WITH signature → 200 + completedAt set', async () => {
      const clientRef = `co-with-sig-${Date.now()}`;
      const date = '2025-03-02';
      const ciResp = await checkIn({ token: tokenS1, date, clientRef }).expect(201);
      const attId = (ciResp.body as any).id;

      // Upload signature first
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'sig.png',
          contentType: 'image/png',
        })
        .expect(200);

      // Now check-out
      const coResp = await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(200);

      const body = coResp.body as any;
      expect(body.completedAt).not.toBeNull();
      expect(body.checkOutCapturedAt).not.toBeNull();
      expect(body.checkOutReceivedAt).not.toBeNull();

      await prisma.attendance.deleteMany({ where: { id: attId } });
    });

    it('AT-20 — check-out already-completed record → 409', async () => {
      const clientRef = `co-immut-${Date.now()}`;
      const date = '2025-03-03';
      const ciResp = await checkIn({ token: tokenS1, date, clientRef }).expect(201);
      const attId = (ciResp.body as any).id;

      // Upload signature
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'sig.png',
          contentType: 'image/png',
        });

      // First check-out → 200
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(200);

      // Second check-out → 409
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(409);

      await prisma.attendance.deleteMany({ where: { id: attId } });
    });

    it('AT-21 — check-out record from another supervisor → 404', async () => {
      const clientRef = `co-scope-${Date.now()}`;
      const ciResp = await checkIn({ token: tokenS1, date: '2025-03-04', clientRef }).expect(201);
      const attId = (ciResp.body as any).id;

      // S2 cannot check-out S1's record
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS2}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(404);

      await prisma.attendance.deleteMany({ where: { id: attId } });
    });

    it('AT-22 — non-SUPERVISOR check-out → 403', async () => {
      await request(app.getHttpServer())
        .post('/asistencia/some-id/check-out')
        .set('Authorization', `Bearer ${tokenC1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(403);
    });

    it('AT-23 — check-out invalid GPS → 400', async () => {
      const clientRef = `co-gps-${Date.now()}`;
      const date = '2025-03-05';
      const ciResp = await checkIn({ token: tokenS1, date, clientRef }).expect(201);
      const attId = (ciResp.body as any).id;

      // Upload signature so we get past SignatureRequiredError
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89]), { filename: 'sig.png', contentType: 'image/png' });

      await request(app.getHttpServer())
        .post(`/asistencia/${attId}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 999, checkOutLng: -76.5 })
        .expect(400);

      await prisma.attendance.deleteMany({ where: { id: attId } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // READ scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Reads (list + detail)', () => {
    let s1AttId: string;
    let s2AttId: string;
    const listDate = '2025-04-01';
    const listRefS1 = `list-s1-${Date.now()}`;
    const listRefS2 = `list-s2-${Date.now()}`;

    beforeAll(async () => {
      // Create one attendance for S1/O1 and one for S2/O2
      const r1 = await checkIn({ token: tokenS1, date: listDate, clientRef: listRefS1 }).expect(201);
      s1AttId = (r1.body as any).id;

      const r2 = await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .set('Authorization', `Bearer ${tokenS2}`)
        .send({
          operarioId: o2Id,
          date: listDate,
          checkInCapturedAt: new Date().toISOString(),
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef: listRefS2,
        })
        .expect(201);
      s2AttId = (r2.body as any).id;
    });

    afterAll(async () => {
      await prisma.attendance.deleteMany({ where: { id: { in: [s1AttId, s2AttId] } } });
    });

    it('AT-24 — SUPERVISOR S1 GET list → only sees own records (not S2)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/asistencia')
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(200);

      const records = resp.body as Array<{ id: string; supervisorId: string }>;
      expect(Array.isArray(records)).toBe(true);
      const ids = records.map((r) => r.id);
      expect(ids).toContain(s1AttId);
      expect(ids).not.toContain(s2AttId);
      // All returned records belong to S1
      for (const r of records) {
        expect(r.supervisorId).toBe(s1Id);
      }
    });

    it('AT-25 — COORDINADOR C1 (Z1) GET list → sees S1 records but not S2 (different zone)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/asistencia')
        .set('Authorization', `Bearer ${tokenC1}`)
        .expect(200);

      const records = resp.body as Array<{ id: string; zoneId: string }>;
      const ids = records.map((r) => r.id);
      expect(ids).toContain(s1AttId);
      expect(ids).not.toContain(s2AttId);
      // All returned records are in Z1
      for (const r of records) {
        expect(r.zoneId).toBe(zoneZ1Id);
      }
    });

    it('AT-26 — SYSTEM_ADMIN GET list → sees all records (both S1 and S2)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/asistencia')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const ids = (resp.body as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(s1AttId);
      expect(ids).toContain(s2AttId);
    });

    it('AT-27 — SUPERVISOR S1 GET detail of own record → 200', async () => {
      const resp = await request(app.getHttpServer())
        .get(`/asistencia/${s1AttId}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(200);

      expect((resp.body as any).id).toBe(s1AttId);
    });

    it('AT-28 — SUPERVISOR S1 GET detail of S2 record → 404 (fail-closed)', async () => {
      await request(app.getHttpServer())
        .get(`/asistencia/${s2AttId}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(404);
    });

    it('AT-29 — COORDINADOR C2 (Z2) GET detail of S1 record (Z1) → 404 (fail-closed)', async () => {
      await request(app.getHttpServer())
        .get(`/asistencia/${s1AttId}`)
        .set('Authorization', `Bearer ${tokenC2}`)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNATURE GET scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Signature GET', () => {
    let attWithSigId: string;
    let attNoSigId: string;
    const sigGetDate = '2025-05-01';
    const sigGetRef1 = `sig-get-1-${Date.now()}`;
    const sigGetRef2 = `sig-get-2-${Date.now()}`;

    beforeAll(async () => {
      // Create attendance with signature
      const r1 = await checkIn({ token: tokenS1, date: sigGetDate, clientRef: sigGetRef1 }).expect(201);
      attWithSigId = (r1.body as any).id;
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post(`/asistencia/${attWithSigId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'sig.png',
          contentType: 'image/png',
        });

      // Create attendance without signature
      const r2 = await checkIn({ token: tokenS1, date: '2025-05-02', clientRef: sigGetRef2 }).expect(201);
      attNoSigId = (r2.body as any).id;
    });

    afterAll(async () => {
      await prisma.attendance.deleteMany({ where: { id: { in: [attWithSigId, attNoSigId] } } });
    });

    it('AT-13 — SUPERVISOR GET signature for own record → 200 with url', async () => {
      mockStoragePort.getPresignedGetUrl.mockResolvedValueOnce('https://minio.example/presigned');

      const resp = await request(app.getHttpServer())
        .get(`/asistencia/${attWithSigId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(200);

      expect((resp.body as any).url).toBeDefined();
      expect(mockStoragePort.getPresignedGetUrl).toHaveBeenCalled();
    });

    it('AT-14 — GET signature when none uploaded → 404', async () => {
      await request(app.getHttpServer())
        .get(`/asistencia/${attNoSigId}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(404);
    });

    it('AT-16 — COORDINADOR C1 (Z1) GET signature for Z1 record → 200', async () => {
      mockStoragePort.getPresignedGetUrl.mockResolvedValueOnce('https://minio.example/presigned');

      const resp = await request(app.getHttpServer())
        .get(`/asistencia/${attWithSigId}/signature`)
        .set('Authorization', `Bearer ${tokenC1}`)
        .expect(200);

      expect((resp.body as any).url).toBeDefined();
    });

    it('AT-17 — COORDINADOR C2 (Z2) GET signature for Z1 record → 404 (cross-zone fail-closed)', async () => {
      await request(app.getHttpServer())
        .get(`/asistencia/${attWithSigId}/signature`)
        .set('Authorization', `Bearer ${tokenC2}`)
        .expect(404);
    });

    it('AT-15 — upload to completed record → 409', async () => {
      // Create a fresh attendance, upload signature, checkout, then try re-upload
      const ref = `completed-sig-${Date.now()}`;
      const date = '2025-05-03';
      const r = await checkIn({ token: tokenS1, date, clientRef: ref }).expect(201);
      const id = (r.body as any).id;

      // Upload signature
      mockStoragePort.putObject.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'sig.png',
          contentType: 'image/png',
        });

      // Check-out to complete record
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ checkOutCapturedAt: new Date().toISOString(), checkOutLat: 7.5, checkOutLng: -76.5 })
        .expect(200);

      // Now try to upload signature again → 409
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/signature`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'sig2.png',
          contentType: 'image/png',
        })
        .expect(409);

      await prisma.attendance.deleteMany({ where: { id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PR-B: CHECK-OUT IDEMPOTENCY + BY-CLIENT-REF + STRUCTURED 409
  // Scenarios: SI-09..SI-27
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Check-out idempotency (SI-09..SI-14)', () => {
    // Helper: create an attendance with signature set directly in DB
    async function createAttendanceWithSig(opts: {
      date: string;
      clientRef: string;
      token: string;
      operarioId?: string;
    }): Promise<{ id: string; clientRef: string }> {
      const ciResp = await checkIn({
        token: opts.token,
        date: opts.date,
        clientRef: opts.clientRef,
        operarioId: opts.operarioId,
      }).expect(201);
      const id = (ciResp.body as any).id as string;
      // Set signatureKey directly so we bypass signature upload
      await prisma.attendance.update({
        where: { id },
        data: { signatureKey: `signatures/${s1Id}/${id}.png` },
      });
      return { id, clientRef: opts.clientRef };
    }

    it('SI-09 — check-out with checkOutClientRef (first time) → 200, ref stored', async () => {
      const { id } = await createAttendanceWithSig({
        date: '2025-06-01',
        clientRef: `si09-${Date.now()}`,
        token: tokenS1,
      });

      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI09',
        })
        .expect(200);

      const body = resp.body as any;
      expect(body.completedAt).not.toBeNull();
      expect(body.checkOutClientRef).toBe('CREF-SI09');

      const db = await prisma.attendance.findUnique({ where: { id } });
      expect(db?.checkOutClientRef).toBe('CREF-SI09');
      expect(db?.completedAt).not.toBeNull();

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-10 — replay same checkOutClientRef → 200, same completedAt, no field change', async () => {
      const { id } = await createAttendanceWithSig({
        date: '2025-06-02',
        clientRef: `si10-${Date.now()}`,
        token: tokenS1,
      });

      // First check-out
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI10',
        })
        .expect(200);

      const dbAfterFirst = await prisma.attendance.findUnique({ where: { id } });
      const completedAtFirst = dbAfterFirst?.completedAt;

      // Replay with same ref but different GPS/timestamp — must return same record
      const replayResp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date(Date.now() + 60_000).toISOString(),
          checkOutLat: 9.0,
          checkOutLng: -77.0,
          checkOutClientRef: 'CREF-SI10',
        })
        .expect(200);

      const replayBody = replayResp.body as any;
      expect(replayBody.id).toBe(id);

      // completedAt must be unchanged
      const dbAfterReplay = await prisma.attendance.findUnique({ where: { id } });
      expect(dbAfterReplay?.completedAt?.toISOString()).toBe(completedAtFirst?.toISOString());
      expect(dbAfterReplay?.checkOutLat).toBe(7.5); // original value

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-11 — different checkOutClientRef on completed → 409 structured ConflictResponseDto', async () => {
      const { id } = await createAttendanceWithSig({
        date: '2025-06-03',
        clientRef: `si11-${Date.now()}`,
        token: tokenS1,
      });

      // First check-out
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI11',
        })
        .expect(200);

      // Double-checkout with different ref
      const conflictResp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-OTHER',
        })
        .expect(409);

      const body = conflictResp.body as any;
      expect(body.error).toBe('CONFLICT');
      expect(body.conflictType).toBe('DOUBLE_CHECKOUT');
      expect(body.conflicting.id).toBe(id);
      expect(body.conflicting.completedAt).not.toBeNull();
      expect(body.conflicting.operarioId).toBe(o1Id);

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-12 — no checkOutClientRef on completed record → 409 structured', async () => {
      const { id } = await createAttendanceWithSig({
        date: '2025-06-04',
        clientRef: `si12-${Date.now()}`,
        token: tokenS1,
      });

      // First check-out
      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI12',
        })
        .expect(200);

      // Double-checkout without ref
      const conflictResp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
        })
        .expect(409);

      const body = conflictResp.body as any;
      expect(body.error).toBe('CONFLICT');
      expect(body.conflictType).toBe('DOUBLE_CHECKOUT');

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-13 — check-out WITHOUT checkOutClientRef on active record → 200, backward compat', async () => {
      const { id } = await createAttendanceWithSig({
        date: '2025-06-05',
        clientRef: `si13-${Date.now()}`,
        token: tokenS1,
      });

      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
        })
        .expect(200);

      expect((resp.body as any).completedAt).not.toBeNull();

      const db = await prisma.attendance.findUnique({ where: { id } });
      expect(db?.checkOutClientRef).toBeNull();

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-14 — check-out: no signature → 422 (unchanged)', async () => {
      const clientRef = `si14-${Date.now()}`;
      const ciResp = await checkIn({ token: tokenS1, date: '2025-06-06', clientRef }).expect(201);
      const id = (ciResp.body as any).id;

      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-NEW',
        })
        .expect(422);

      await prisma.attendance.deleteMany({ where: { id } });
    });
  });

  describe('Check-out by check-in clientRef (SI-19..SI-23)', () => {
    async function createAttendanceWithSig(opts: {
      date: string;
      clientRef: string;
      token: string;
      operarioId?: string;
    }): Promise<{ id: string; clientRef: string }> {
      const ciResp = await checkIn({
        token: opts.token,
        date: opts.date,
        clientRef: opts.clientRef,
        operarioId: opts.operarioId,
      }).expect(201);
      const id = (ciResp.body as any).id as string;
      await prisma.attendance.update({
        where: { id },
        data: { signatureKey: `signatures/${s1Id}/${id}.png` },
      });
      return { id, clientRef: opts.clientRef };
    }

    it('SI-19 — check-out by check-in clientRef (own attendance) → 200 completed', async () => {
      const checkInClientRef = `si19-cin-${Date.now()}`;
      const { id } = await createAttendanceWithSig({
        date: '2025-06-07',
        clientRef: checkInClientRef,
        token: tokenS1,
      });

      const resp = await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInClientRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
        })
        .expect(200);

      const body = resp.body as any;
      expect(body.id).toBe(id);
      expect(body.completedAt).not.toBeNull();
      expect(body.clientRef).toBe(checkInClientRef);

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-20 — by-clientRef attendance NOT owned by actor → 404 (fail-closed)', async () => {
      // A2 belongs to S2, S1 cannot access it
      const checkInRef = `si20-cin-${Date.now()}`;
      const ciResp = await request(app.getHttpServer())
        .post('/asistencia/check-in')
        .set('Authorization', `Bearer ${tokenS2}`)
        .send({
          operarioId: o2Id,
          date: '2025-06-08',
          checkInCapturedAt: new Date().toISOString(),
          checkInLat: 7.5,
          checkInLng: -76.5,
          clientRef: checkInRef,
        })
        .expect(201);
      const id = (ciResp.body as any).id;

      await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
        })
        .expect(404);

      // A2 must remain in-progress
      const db = await prisma.attendance.findUnique({ where: { id } });
      expect(db?.completedAt).toBeNull();

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-21 — by-clientRef unknown clientRef → 404', async () => {
      await request(app.getHttpServer())
        .post('/asistencia/by-client-ref/CHECKIN-REF-UNKNOWN-SI21/check-out')
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
        })
        .expect(404);
    });

    it('SI-22 — by-clientRef + checkOutClientRef idempotency compose: replay → 200 same record', async () => {
      const checkInClientRef = `si22-cin-${Date.now()}`;
      const { id } = await createAttendanceWithSig({
        date: '2025-06-09',
        clientRef: checkInClientRef,
        token: tokenS1,
      });

      // First checkout via by-client-ref
      await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInClientRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI22',
        })
        .expect(200);

      const dbAfterFirst = await prisma.attendance.findUnique({ where: { id } });

      // Replay
      const replayResp = await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInClientRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date(Date.now() + 60_000).toISOString(),
          checkOutLat: 9.0,
          checkOutLng: -77.0,
          checkOutClientRef: 'CREF-SI22',
        })
        .expect(200);

      expect((replayResp.body as any).id).toBe(id);
      const dbAfterReplay = await prisma.attendance.findUnique({ where: { id } });
      expect(dbAfterReplay?.completedAt?.toISOString()).toBe(dbAfterFirst?.completedAt?.toISOString());

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-23 — by-clientRef: completed + different checkOutClientRef → 409 structured', async () => {
      const checkInClientRef = `si23-cin-${Date.now()}`;
      const { id } = await createAttendanceWithSig({
        date: '2025-06-10',
        clientRef: checkInClientRef,
        token: tokenS1,
      });

      // First checkout
      await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInClientRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI23',
        })
        .expect(200);

      // Double-checkout via by-client-ref with different ref
      const conflictResp = await request(app.getHttpServer())
        .post(`/asistencia/by-client-ref/${checkInClientRef}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-OTHER',
        })
        .expect(409);

      const body = conflictResp.body as any;
      expect(body.error).toBe('CONFLICT');
      expect(body.conflictType).toBe('DOUBLE_CHECKOUT');

      await prisma.attendance.deleteMany({ where: { id } });
    });
  });

  describe('Structured 409 response (SI-24..SI-27)', () => {
    it('SI-24 — check-in duplicate operario+date, different clientRef → 409 structured ConflictResponseDto', async () => {
      const date = '2025-06-20';
      const firstRef = `si24-a-${Date.now()}`;
      const secondRef = `si24-b-${Date.now()}`;

      await checkIn({ token: tokenS1, date, clientRef: firstRef }).expect(201);

      const conflictResp = await checkIn({ token: tokenS1, date, clientRef: secondRef }).expect(409);

      const body = conflictResp.body as any;
      expect(body.error).toBe('CONFLICT');
      expect(body.conflictType).toBe('DUPLICATE_ATTENDANCE_DATE');
      expect(body.conflicting).toBeDefined();
      expect(body.conflicting.operarioId).toBe(o1Id);
      expect(body.conflicting.date).toBe(date);
      expect(body.conflicting.id).toBeDefined();
      expect(body.message).toBeDefined();

      // Only one row
      const count = await prisma.attendance.count({ where: { operarioId: o1Id, date } });
      expect(count).toBe(1);

      await prisma.attendance.deleteMany({ where: { operarioId: o1Id, date } });
    });

    it('SI-25 — check-in SAME clientRef → 200 (idempotent, NOT ConflictResponseDto)', async () => {
      const date = '2025-06-21';
      const ref = `si25-${Date.now()}`;

      await checkIn({ token: tokenS1, date, clientRef: ref }).expect(201);
      const resp = await checkIn({ token: tokenS1, date, clientRef: ref }).expect(200);

      // Must be plain AttendanceDto — no "error" or "conflicting" fields
      const body = resp.body as any;
      expect(body.error).toBeUndefined();
      expect(body.conflicting).toBeUndefined();
      expect(body.id).toBeDefined();

      await prisma.attendance.deleteMany({ where: { operarioId: o1Id, date } });
    });

    it('SI-26 — double-checkout structured 409 body shape matches SI-24', async () => {
      const clientRef = `si26-cin-${Date.now()}`;
      const ciResp = await checkIn({ token: tokenS1, date: '2025-06-22', clientRef }).expect(201);
      const id = (ciResp.body as any).id;
      await prisma.attendance.update({
        where: { id },
        data: { signatureKey: `signatures/${s1Id}/${id}.png` },
      });

      await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-SI26',
        })
        .expect(200);

      const conflictResp = await request(app.getHttpServer())
        .post(`/asistencia/${id}/check-out`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({
          checkOutCapturedAt: new Date().toISOString(),
          checkOutLat: 7.5,
          checkOutLng: -76.5,
          checkOutClientRef: 'CREF-DIFF',
        })
        .expect(409);

      const body = conflictResp.body as any;
      expect(body.error).toBe('CONFLICT');
      expect(body.conflictType).toBe('DOUBLE_CHECKOUT');
      expect(body.conflicting.id).toBe(id);
      expect(body.conflicting.completedAt).not.toBeNull();
      expect(body.conflicting.operarioId).toBeDefined();
      expect(body.conflicting.checkOutClientRef).toBe('CREF-SI26');

      await prisma.attendance.deleteMany({ where: { id } });
    });

    it('SI-27 — InactiveOperarioError (409) is NOT a structured ConflictResponseDto', async () => {
      // Create and deactivate a fresh operario
      const inactiveOp = await prisma.operario.create({
        data: {
          fullName: 'SI-27 Inactive',
          documento: `doc-si27-${Date.now()}`,
          supervisorId: s1Id,
          deactivatedAt: new Date(),
        },
      });

      const resp = await checkIn({
        token: tokenS1,
        operarioId: inactiveOp.id,
        clientRef: `si27-${Date.now()}`,
      }).expect(409);

      const body = resp.body as any;
      // Standard NestJS ConflictException shape — no structured body
      expect(body.error).not.toBe('CONFLICT');
      expect(body.conflicting).toBeUndefined();
      expect(body.statusCode).toBe(409);

      await prisma.operario.deleteMany({ where: { id: inactiveOp.id } });
    });
  });

  // ─── PR-3: OP-33 / OP-34 — Inactive operario check-in guard ───────────────

  describe('POST /asistencia/check-in — inactive operario guard (PR-3)', () => {
    let inactiveOpId: string;
    let activeOpId: string;

    beforeAll(async () => {
      // Create a fresh operario under S1 and deactivate it
      const inactiveOp = await prisma.operario.create({
        data: {
          fullName: 'Inactive Operario OP-33',
          documento: `doc-inactive-op33-${Date.now()}`,
          supervisorId: s1Id,
          deactivatedAt: new Date(), // deactivated immediately
        },
      });
      inactiveOpId = inactiveOp.id;

      // Create a fresh active operario under S1 (for OP-34 regression)
      const activeOp = await prisma.operario.create({
        data: {
          fullName: 'Active Operario OP-34',
          documento: `doc-active-op34-${Date.now()}`,
          supervisorId: s1Id,
          deactivatedAt: null,
        },
      });
      activeOpId = activeOp.id;
    });

    afterAll(async () => {
      // Clean up attendance rows and operarios created for this describe block
      if (inactiveOpId) {
        await prisma.attendance.deleteMany({ where: { operarioId: inactiveOpId } });
        await prisma.operario.deleteMany({ where: { id: inactiveOpId } });
      }
      if (activeOpId) {
        await prisma.attendance.deleteMany({ where: { operarioId: activeOpId } });
        await prisma.operario.deleteMany({ where: { id: activeOpId } });
      }
    });

    it('OP-33 — check-in on INACTIVE operario → 409 (ConflictException / InactiveOperarioError)', async () => {
      await checkIn({
        token: tokenS1,
        operarioId: inactiveOpId,
        clientRef: `op33-${Date.now()}`,
      }).expect(409);

      // No Attendance row created
      const count = await prisma.attendance.count({ where: { operarioId: inactiveOpId } });
      expect(count).toBe(0);
    });

    it('OP-34 — check-in on ACTIVE operario → 201 (regression guard)', async () => {
      const ref = `op34-${Date.now()}`;
      await checkIn({
        token: tokenS1,
        operarioId: activeOpId,
        date: new Date().toISOString().split('T')[0],
        clientRef: ref,
      }).expect(201);

      // Attendance row created
      const count = await prisma.attendance.count({ where: { operarioId: activeOpId } });
      expect(count).toBe(1);

      // activeOpId remains active (deactivatedAt unchanged)
      const op = await prisma.operario.findUnique({ where: { id: activeOpId } });
      expect(op!.deactivatedAt).toBeNull();
    });
  });
});
