/**
 * sync-delta-pull integration suite — SD-01..SD-24
 *
 * Tests the ?since= delta filter across operarios, attendance, and novedades,
 * the operario tombstone delta mode, and the ?clientRef= attendance recovery
 * endpoint.
 *
 * Fixture setup:
 * - Zone Z1 (seeded): 'Zona Urabá'
 * - Zone Z2 (seeded): 'Zona Bajo Cauca'
 * - Supervisor S1 in Z1, Supervisor S2 in Z2
 * - Operario O1 (active, under S1), Operario O2 (active, under S2)
 * - Attendance A1 (S1, O1), A2 (S2, O2)
 * - Novedad N1 on A1 (S1)
 *
 * cursor strategy: capture actual updatedAt from created entities (NOT new Date())
 * to avoid ms-resolution flakiness.
 *
 * Teardown: Novedad → Attendance → Operario → Supervisor → DeviceSession → User
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request: import('supertest').SuperTestStatic = require('supertest');
import { AppModule } from '../../app.module';
import { createPrismaClient } from '../../database/prisma-client';
import type { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { STORAGE_PORT } from '../storage/domain/storage.port';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';
const TEST_DEVICE = 'delta-pull-test-device';
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

describe('Sync Delta Pull Integration Suite (SD-01..SD-24)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Fixture ids
  let zoneZ1Id: string;
  let zoneZ2Id: string;
  let s1UserId: string;
  let s2UserId: string;
  let s1Id: string;
  let s2Id: string;
  let o1Id: string;
  let o2Id: string;
  let municipioIdZ1: string;
  let municipioIdZ2: string;
  let adminUserId: string;

  // Tokens
  let tokenS1: string;
  let tokenS2: string;
  let tokenAdmin: string;

  // Cleanup tracking
  const createdUserIds: string[] = [];

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
    const zoneZ1 = await prisma.zone.findFirst({ where: { name: 'Zona Urabá' } });
    const zoneZ2 = await prisma.zone.findFirst({ where: { name: 'Zona Bajo Cauca' } });
    if (!zoneZ1 || !zoneZ2) {
      throw new Error('Seeded zones not found — run globalSetup first');
    }
    zoneZ1Id = zoneZ1.id;
    zoneZ2Id = zoneZ2.id;

    // Resolve seeded municipios
    const m1 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ1Id } });
    const m2 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ2Id } });
    if (!m1 || !m2) throw new Error('Seeded municipios not found');
    municipioIdZ1 = m1.id;
    municipioIdZ2 = m2.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Idempotent cleanup of leftovers
    const fixtureEmails = [
      's1-delta@futuragest.co',
      's2-delta@futuragest.co',
      'admin-delta@futuragest.co',
    ];
    const leftover = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    if (leftover.length > 0) {
      const leftoverIds = leftover.map((u) => u.id);
      const leftoverSups = await prisma.supervisor.findMany({
        where: { userId: { in: leftoverIds } },
        select: { id: true },
      });
      const leftoverSupIds = leftoverSups.map((s) => s.id);
      if (leftoverSupIds.length > 0) {
        const leftoverAtts = await prisma.attendance.findMany({
          where: { supervisorId: { in: leftoverSupIds } },
          select: { id: true },
        });
        const leftoverAttIds = leftoverAtts.map((a) => a.id);
        if (leftoverAttIds.length > 0) {
          await prisma.novedad.deleteMany({ where: { attendanceId: { in: leftoverAttIds } } });
        }
        await prisma.attendance.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.operario.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.supervisor.deleteMany({ where: { id: { in: leftoverSupIds } } });
      }
      await prisma.deviceSession.deleteMany({ where: { userId: { in: leftoverIds } } });
      await prisma.user.deleteMany({ where: { id: { in: leftoverIds } } });
    }

    async function createUser(email: string, role: string) {
      const user = await prisma.user.create({
        data: { email, passwordHash, role: role as Role, mustChangePassword: false },
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

    const s1User = await createUser('s1-delta@futuragest.co', 'SUPERVISOR');
    s1UserId = s1User.id;
    const s1Sup = await prisma.supervisor.create({
      data: { userId: s1UserId, municipioId: municipioIdZ1, zoneId: zoneZ1Id, area: 'BARRIDO' },
    });
    s1Id = s1Sup.id;

    const s2User = await createUser('s2-delta@futuragest.co', 'SUPERVISOR');
    s2UserId = s2User.id;
    const s2Sup = await prisma.supervisor.create({
      data: { userId: s2UserId, municipioId: municipioIdZ2, zoneId: zoneZ2Id, area: 'BARRIDO' },
    });
    s2Id = s2Sup.id;

    const o1 = await prisma.operario.create({
      data: { fullName: 'Delta Op 1', documento: 'DELTA-DOC-001', supervisorId: s1Id },
    });
    o1Id = o1.id;

    const o2 = await prisma.operario.create({
      data: { fullName: 'Delta Op 2', documento: 'DELTA-DOC-002', supervisorId: s2Id },
    });
    o2Id = o2.id;

    const adminUser = await createUser('admin-delta@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = adminUser.id;

    tokenS1 = mintToken({ sub: s1UserId, role: 'SUPERVISOR', supervisorId: s1Id, zoneId: zoneZ1Id });
    tokenS2 = mintToken({ sub: s2UserId, role: 'SUPERVISOR', supervisorId: s2Id, zoneId: zoneZ2Id });
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
  }, 60_000);

  afterAll(async () => {
    const supIds = [s1Id, s2Id].filter(Boolean);
    if (supIds.length > 0) {
      const atts = await prisma.attendance.findMany({
        where: { supervisorId: { in: supIds } },
        select: { id: true },
      });
      const attIds = atts.map((a) => a.id);
      if (attIds.length > 0) {
        await prisma.novedad.deleteMany({ where: { attendanceId: { in: attIds } } });
      }
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

  // ─── SD-01: invalid ?since= → 400 ──────────────────────────────────────────

  it('SD-01: GET /iam/operarios?since=not-a-date → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/iam/operarios?since=not-a-date')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });

  it('SD-02: GET /asistencia?since=not-a-date → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/asistencia?since=not-a-date')
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(400);
  });

  it('SD-03: GET /novedades?since=not-a-date → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/novedades?since=not-a-date')
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(400);
  });

  // ─── SD-04: no ?since= → full scoped list (backward compat) ────────────────

  it('SD-04: GET /iam/operarios (no since) → full list includes O1', async () => {
    const res = await request(app.getHttpServer())
      .get('/iam/operarios')
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(o1Id);
    expect(ids).not.toContain(o2Id); // scope-enforced
  });

  it('SD-05: GET /asistencia (no since) → 200 (backward compat)', async () => {
    const res = await request(app.getHttpServer())
      .get('/asistencia')
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('SD-06: GET /novedades (no since) → 200 (backward compat)', async () => {
    const res = await request(app.getHttpServer())
      .get('/novedades')
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ─── SD-07..SD-09: ?since= delta filter returns only changed rows ───────────

  it('SD-07: GET /iam/operarios?since= in the future → empty array (no changes yet)', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(future)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SD-08: GET /iam/operarios?since= captures row updated after cursor', async () => {
    // Capture O1 updatedAt before modification
    const before = await prisma.operario.findUnique({ where: { id: o1Id } });
    expect(before).toBeTruthy();
    const cursorBefore = before!.updatedAt;

    // Modify O1 after cursor (small wait to ensure timestamp advances)
    await new Promise((r) => setTimeout(r, 10));
    await prisma.operario.update({ where: { id: o1Id }, data: { fullName: 'Delta Op 1 Modified' } });

    // Fetch updated O1 and use its actual updatedAt
    const after = await prisma.operario.findUnique({ where: { id: o1Id } });
    expect(after).toBeTruthy();

    // Since = cursor BEFORE the update → O1 should appear
    const since = cursorBefore.toISOString();
    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(since)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(o1Id);
  });

  it('SD-09: GET /iam/operarios?since= with cursor AFTER update → O1 excluded', async () => {
    // Use current time as cursor (all rows have updatedAt <= now)
    const after = await prisma.operario.findUnique({ where: { id: o1Id } });
    expect(after).toBeTruthy();
    // Wait 10ms then use a cursor past the last update
    await new Promise((r) => setTimeout(r, 10));
    const cursor = new Date(after!.updatedAt.getTime() + 5).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).not.toContain(o1Id);
  });

  // ─── SD-10: tombstone inclusion in delta mode ──────────────────────────────

  it('SD-10: operario delta mode includes deactivated tombstones (?since= present)', async () => {
    // Record time before deactivation
    const beforeDeact = await prisma.operario.findUnique({ where: { id: o2Id } });
    expect(beforeDeact).toBeTruthy();
    const cursor = new Date(beforeDeact!.updatedAt.getTime() - 1).toISOString();

    // Deactivate O2 (S2's operario — admin can see all)
    await prisma.operario.update({ where: { id: o2Id }, data: { deactivatedAt: new Date() } });

    // Without ?since= → O2 is excluded by default (deactivatedAt != null)
    const noSince = await request(app.getHttpServer())
      .get('/iam/operarios')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(noSince.status).toBe(200);
    const noSinceIds = noSince.body.map((o: { id: string }) => o.id);
    expect(noSinceIds).not.toContain(o2Id);

    // With ?since= → O2 (tombstone) IS included in delta
    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(o2Id);
  });

  // ─── SD-11: ?includeInactive in non-delta mode still works ─────────────────

  it('SD-11: GET /iam/operarios?includeInactive=true (no since) → includes deactivated', async () => {
    const res = await request(app.getHttpServer())
      .get('/iam/operarios?includeInactive=true')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(o2Id); // deactivated O2 returned with includeInactive
  });

  // ─── SD-12..SD-15: attendance delta filter ─────────────────────────────────

  it('SD-12: GET /asistencia?since= future → empty (no attendance yet created)', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/asistencia?since=${encodeURIComponent(future)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SD-13: GET /asistencia?since= cursor before check-in → returns new record', async () => {
    const cursor = new Date(Date.now() - 500).toISOString();

    // Create an attendance via check-in
    const checkInRes = await request(app.getHttpServer())
      .post('/asistencia/check-in')
      .set('Authorization', `Bearer ${tokenS1}`)
      .send({
        operarioId: o1Id,
        date: '2026-06-01',
        checkInCapturedAt: '2026-06-01T08:00:00.000Z',
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `delta-test-${Date.now()}`,
      });
    expect(checkInRes.status).toBe(201);
    const attId = checkInRes.body.id;
    const attClientRef = checkInRes.body.clientRef;

    // Capture actual updatedAt from the created record
    const attRecord = await prisma.attendance.findUnique({ where: { id: attId } });
    expect(attRecord).toBeTruthy();

    // Since before check-in → attendance should appear
    const res = await request(app.getHttpServer())
      .get(`/asistencia?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toContain(attId);

    // SD-14: ?clientRef= recovery — returns the same record
    const clientRefRes = await request(app.getHttpServer())
      .get(`/asistencia?clientRef=${encodeURIComponent(attClientRef)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(clientRefRes.status).toBe(200);
    expect(Array.isArray(clientRefRes.body)).toBe(true);
    expect(clientRefRes.body.length).toBe(1);
    expect(clientRefRes.body[0].id).toBe(attId);

    // SD-15: ?clientRef= with non-existent ref → 200 []
    const notFoundRes = await request(app.getHttpServer())
      .get(`/asistencia?clientRef=nonexistent-ref-xyz`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(notFoundRes.status).toBe(200);
    expect(notFoundRes.body).toEqual([]);
  });

  // ─── SD-16: scope enforcement on attendance delta ──────────────────────────

  it('SD-16: GET /asistencia?since= scope-enforced (S2 cannot see S1 attendance)', async () => {
    const cursor = new Date(Date.now() - 10_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/asistencia?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenS2}`);
    expect(res.status).toBe(200);
    // S2 should not see any attendance created by S1
    const body = res.body as Array<{ supervisorId: string }>;
    for (const att of body) {
      expect(att.supervisorId).toBe(s2Id);
    }
  });

  // ─── SD-17: ?clientRef= cross-tenant isolation ─────────────────────────────

  it('SD-17: ?clientRef= cross-tenant — S2 cannot see S1 clientRef → 200 []', async () => {
    // Create S1 attendance and try to fetch it as S2
    const s1CheckIn = await request(app.getHttpServer())
      .post('/asistencia/check-in')
      .set('Authorization', `Bearer ${tokenS1}`)
      .send({
        operarioId: o1Id,
        date: '2026-06-02',
        checkInCapturedAt: '2026-06-02T08:00:00.000Z',
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `cross-tenant-ref-${Date.now()}`,
      });
    expect(s1CheckIn.status).toBe(201);
    const s1ClientRef = s1CheckIn.body.clientRef;

    // S2 tries to retrieve S1's attendance by clientRef → 200 [] (fail-closed)
    const res = await request(app.getHttpServer())
      .get(`/asistencia?clientRef=${encodeURIComponent(s1ClientRef)}`)
      .set('Authorization', `Bearer ${tokenS2}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ─── SD-18..SD-21: novedad delta filter ────────────────────────────────────

  it('SD-18: GET /novedades?since= future → empty', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/novedades?since=${encodeURIComponent(future)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SD-19: GET /novedades?since= cursor before novedad creation → returns novedad', async () => {
    const cursor = new Date(Date.now() - 500).toISOString();

    // Need a COMPLETED attendance to create a novedad.
    // First check-in via API
    const checkInRes = await request(app.getHttpServer())
      .post('/asistencia/check-in')
      .set('Authorization', `Bearer ${tokenS1}`)
      .send({
        operarioId: o1Id,
        date: '2026-06-03',
        checkInCapturedAt: '2026-06-03T08:00:00.000Z',
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `novedad-delta-ref-${Date.now()}`,
      });
    expect(checkInRes.status).toBe(201);
    const attId = checkInRes.body.id;

    // Set checkInPhotoKey directly (bypass upload) and complete the record via direct DB update
    // so checkout doesn't require a real file upload in this test.
    await prisma.attendance.update({
      where: { id: attId },
      data: { checkInPhotoKey: 'test-photo-key', completedAt: new Date() },
    });

    // Create novedad (requires completedAt != null)
    const novRes = await request(app.getHttpServer())
      .post(`/asistencia/${attId}/novedades`)
      .set('Authorization', `Bearer ${tokenS1}`)
      .send({ horasExtra: '2.00', motivo: 'delta test' });
    expect(novRes.status).toBe(201);
    const novId = novRes.body.id;

    // Fetch delta → should include novedad
    const res = await request(app.getHttpServer())
      .get(`/novedades?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).toContain(novId);
  });

  // ─── SD-20: novedad delta scope enforcement ─────────────────────────────────

  it('SD-20: GET /novedades?since= scope-enforced (S2 cannot see S1 novedades)', async () => {
    const cursor = new Date(Date.now() - 30_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/novedades?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenS2}`);
    expect(res.status).toBe(200);
    // S2 should only see its own novedades (none in this suite)
    const body = res.body as Array<{ supervisorId: string }>;
    for (const nov of body) {
      expect(nov.supervisorId).toBe(s2Id);
    }
  });

  // ─── SD-21: inclusive cursor (boundary row included) ───────────────────────

  it('SD-21: ?since= cursor is INCLUSIVE (boundary row returned)', async () => {
    // Get O1 current updatedAt and use that exact timestamp as cursor
    const o1Row = await prisma.operario.findUnique({ where: { id: o1Id } });
    expect(o1Row).toBeTruthy();
    const boundaryTs = o1Row!.updatedAt.toISOString();

    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(boundaryTs)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    // O1 updatedAt === boundary → inclusive, MUST be included
    expect(ids).toContain(o1Id);
  });

  // ─── SD-22: operario response includes updatedAt field ──────────────────────

  it('SD-22: GET /iam/operarios response rows include updatedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/iam/operarios')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    for (const op of res.body as Array<{ updatedAt?: unknown }>) {
      expect(op.updatedAt).toBeDefined();
    }
  });

  // ─── SD-23: attendance ?since= and ?clientRef= mutually exclusive ──────────

  it('SD-23: ?clientRef= takes precedence — when both provided, clientRef is used', async () => {
    // Create an attendance for S1
    const checkInRes = await request(app.getHttpServer())
      .post('/asistencia/check-in')
      .set('Authorization', `Bearer ${tokenS1}`)
      .send({
        operarioId: o1Id,
        date: '2026-06-10',
        checkInCapturedAt: '2026-06-10T08:00:00.000Z',
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `precedence-ref-${Date.now()}`,
      });
    expect(checkInRes.status).toBe(201);
    const attClientRef = checkInRes.body.clientRef;

    // Send both ?since= and ?clientRef= — clientRef takes precedence
    const res = await request(app.getHttpServer())
      .get(`/asistencia?since=${encodeURIComponent(new Date(0).toISOString())}&clientRef=${encodeURIComponent(attClientRef)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // clientRef branch returns exactly [record] or []
    expect(res.body.length).toBe(1);
    expect(res.body[0].clientRef).toBe(attClientRef);
  });

  // ─── SD-24: operario scope enforcement on delta mode ──────────────────────

  it('SD-24: GET /iam/operarios?since= scope-enforced (S1 cannot see S2 operarios)', async () => {
    // Reactivate O2 for this test (was deactivated in SD-10)
    await prisma.operario.update({ where: { id: o2Id }, data: { deactivatedAt: null } });

    const cursor = new Date(Date.now() - 10_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/iam/operarios?since=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${tokenS1}`);
    expect(res.status).toBe(200);
    // S1 sees only their scope — O2 (under S2) excluded
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).not.toContain(o2Id);
  });
});
