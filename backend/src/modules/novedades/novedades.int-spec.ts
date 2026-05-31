/**
 * Novedades integration suite.
 *
 * Covers NV-01..NV-37 + NV-51..NV-55 (create, approve, reject, cancel, reads, scope).
 * Uses --runInBand (configured in test:int script).
 *
 * Fixture setup:
 * - Zone Z1 (seeded): 'Zona Urabá'
 * - Zone Z2 (seeded): 'Zona Bajo Cauca'
 * - Supervisor S1 in Z1 (synthetic)
 * - Supervisor S2 in Z2 (synthetic — for cross-zone tests)
 * - LIDER_OPERATIVO L1 + DeviceSession (CRITICAL: R5 — AuthGuard validates DeviceSession)
 * - Operario O1 under S1
 * - Attendance A1 (completed, supervisorId=S1, zoneId=Z1)
 * - Attendance A_incomplete (completedAt=null)
 *
 * Teardown: Novedad → Attendance → Operario → Supervisor → DeviceSession → User (FK-safe).
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
const TEST_DEVICE = 'novedades-test-device';
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

// ─── Mock StoragePort (not used by novedades but required by AppModule) ────────

const mockStoragePort = {
  putObject: jest.fn().mockResolvedValue(undefined),
  getPresignedGetUrl: jest.fn().mockResolvedValue('https://minio.example/presigned'),
  getPresignedPutUrl: jest.fn().mockResolvedValue('https://minio.example/presigned-put'),
  removeObject: jest.fn().mockResolvedValue(undefined),
};

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('Novedades Integration Suite (NV-01..NV-37 + SI-01..SI-04)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Fixture state
  let zoneZ1Id: string;
  let zoneZ2Id: string;
  let s1UserId: string;
  let s2UserId: string;
  let s1Id: string; // supervisor.id
  let s2Id: string;
  let l1UserId: string; // LIDER_OPERATIVO user.id
  let o1Id: string; // operario.id
  let a1Id: string; // completed attendance
  let aIncompleteId: string; // incomplete attendance
  let municipioIdZ1: string;
  let municipioIdZ2: string;
  let adminUserId: string;
  let c1UserId: string;
  let c2UserId: string;

  // Tokens
  let tokenS1: string;
  let tokenS2: string;
  let tokenC1: string;
  let tokenC2: string;
  let tokenLider: string;
  let tokenAdmin: string;

  // Track created user ids for cleanup
  const createdUserIds: string[] = [];

  // ── Setup ────────────────────────────────────────────────────────────────────

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

    // Resolve seeded municipios for each zone
    const m1 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ1Id } });
    const m2 = await prisma.municipio.findFirst({ where: { zoneId: zoneZ2Id } });
    if (!m1 || !m2) throw new Error('Seeded municipios not found');
    municipioIdZ1 = m1.id;
    municipioIdZ2 = m2.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Clean leftover fixtures from a previous interrupted run
    const fixtureEmails = [
      's1-novedades@futuragest.co',
      's2-novedades@futuragest.co',
      'c1-novedades@futuragest.co',
      'c2-novedades@futuragest.co',
      'lider-novedades@futuragest.co',
      'admin-novedades@futuragest.co',
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
        await prisma.novedad.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.attendance.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.operario.deleteMany({ where: { supervisorId: { in: leftoverSupIds } } });
        await prisma.supervisor.deleteMany({ where: { id: { in: leftoverSupIds } } });
      }
      await prisma.deviceSession.deleteMany({ where: { userId: { in: leftoverIds } } });
      await prisma.user.deleteMany({ where: { id: { in: leftoverIds } } });
    }

    // Helper: create user + device session
    async function createUser(email: string, role: string) {
      const user = await prisma.user.create({
        data: { email, passwordHash, role: role as 'SUPERVISOR', mustChangePassword: false },
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

    // Create supervisors
    const s1User = await createUser('s1-novedades@futuragest.co', 'SUPERVISOR');
    s1UserId = s1User.id;
    const s1Sup = await prisma.supervisor.create({
      data: { userId: s1UserId, municipioId: municipioIdZ1, zoneId: zoneZ1Id, area: 'BARRIDO' },
    });
    s1Id = s1Sup.id;

    const s2User = await createUser('s2-novedades@futuragest.co', 'SUPERVISOR');
    s2UserId = s2User.id;
    const s2Sup = await prisma.supervisor.create({
      data: { userId: s2UserId, municipioId: municipioIdZ2, zoneId: zoneZ2Id, area: 'BARRIDO' },
    });
    s2Id = s2Sup.id;

    // Create LIDER_OPERATIVO (CRITICAL: needs DeviceSession for AuthGuard — R5)
    const l1User = await createUser('lider-novedades@futuragest.co', 'LIDER_OPERATIVO');
    l1UserId = l1User.id;

    // Create COORDINADOR C1 (Z1) and C2 (Z2)
    const c1User = await createUser('c1-novedades@futuragest.co', 'COORDINADOR');
    c1UserId = c1User.id;
    const c2User = await createUser('c2-novedades@futuragest.co', 'COORDINADOR');
    c2UserId = c2User.id;

    // Create SYSTEM_ADMIN
    const adminUser = await createUser('admin-novedades@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = adminUser.id;

    // Create Operario O1 under S1
    const o1 = await prisma.operario.create({
      data: { fullName: 'Test Operario Nov-1', documento: 'DOC-NOV-001', supervisorId: s1Id },
    });
    o1Id = o1.id;

    // Create completed Attendance A1 (supervisorId=S1, operarioId=O1, zoneId=Z1)
    const a1 = await prisma.attendance.create({
      data: {
        supervisorId: s1Id,
        operarioId: o1Id,
        zoneId: zoneZ1Id,
        date: '2026-05-31',
        checkInCapturedAt: new Date('2026-05-31T07:00:00Z'),
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: 'nov-int-test-a1',
        completedAt: new Date('2026-05-31T17:00:00Z'),
        updatedAt: new Date(),
      },
    });
    a1Id = a1.id;

    // Create incomplete Attendance (for NV-03)
    const aInc = await prisma.attendance.create({
      data: {
        supervisorId: s1Id,
        operarioId: o1Id,
        zoneId: zoneZ1Id,
        date: '2026-05-30',
        checkInCapturedAt: new Date('2026-05-30T07:00:00Z'),
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: 'nov-int-test-incomplete',
        completedAt: null,
        updatedAt: new Date(),
      },
    });
    aIncompleteId = aInc.id;

    // Mint tokens
    tokenS1 = mintToken({ sub: s1UserId, role: 'SUPERVISOR', supervisorId: s1Id, zoneId: zoneZ1Id });
    tokenS2 = mintToken({ sub: s2UserId, role: 'SUPERVISOR', supervisorId: s2Id, zoneId: zoneZ2Id });
    tokenC1 = mintToken({ sub: c1UserId, role: 'COORDINADOR', zoneId: zoneZ1Id });
    tokenC2 = mintToken({ sub: c2UserId, role: 'COORDINADOR', zoneId: zoneZ2Id });
    tokenLider = mintToken({ sub: l1UserId, role: 'LIDER_OPERATIVO' });
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
  }, 30_000);

  afterAll(async () => {
    // FK-safe teardown: Novedad → Attendance → Operario → Supervisor → DeviceSession → User
    const supIds = [s1Id, s2Id].filter(Boolean);
    if (supIds.length > 0) {
      await prisma.novedad.deleteMany({ where: { supervisorId: { in: supIds } } });
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

  // ── Helper: post a novedad ──────────────────────────────────────────────────

  function postNovedad(opts: {
    token: string;
    attendanceId?: string;
    horasExtra?: string;
    motivo?: string;
    extraBody?: Record<string, unknown>;
  }) {
    return request(app.getHttpServer())
      .post(`/asistencia/${opts.attendanceId ?? a1Id}/novedades`)
      .set('Authorization', `Bearer ${opts.token}`)
      .send({
        horasExtra: opts.horasExtra ?? '2.50',
        ...(opts.motivo !== undefined ? { motivo: opts.motivo } : {}),
        ...(opts.extraBody ?? {}),
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE scenarios (NV-01..NV-14)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CREATE scenarios', () => {
    afterEach(async () => {
      // Clean novedades after each create test to keep scenarios independent
      await prisma.novedad.deleteMany({ where: { attendanceId: { in: [a1Id, aIncompleteId] } } });
    });

    it('NV-01 — SUPERVISOR creates novedad on own COMPLETED attendance → 201', async () => {
      const snap = await prisma.attendance.findUnique({ where: { id: a1Id } });

      const resp = await postNovedad({ token: tokenS1, horasExtra: '2.50', motivo: 'Trabajo en turno extra' })
        .expect(201);

      const body = resp.body as Record<string, unknown>;
      expect(body.id).toBeDefined();
      expect(body.status).toBe('PENDING');
      expect(body.supervisorId).toBe(s1Id); // from JWT, not body
      expect(body.zoneId).toBe(zoneZ1Id);   // from JWT, not body
      expect(body.attendanceId).toBe(a1Id);
      expect(body.approvedByUserId).toBeNull();
      expect(body.decidedAt).toBeNull();
      // horasExtra must serialize as STRING (INV: Decimal → JSON string)
      // Prisma Decimal.toString() may strip trailing zeros: "2.50" → "2.5"
      expect(typeof body.horasExtra).toBe('string');
      expect(parseFloat(body.horasExtra as string)).toBeCloseTo(2.5, 2);

      // Assert Attendance row is UNCHANGED (INV-04)
      const snapAfter = await prisma.attendance.findUnique({ where: { id: a1Id } });
      expect(snapAfter).toEqual(snap);
    });

    it('NV-02 — supervisorId/zoneId sourced from JWT, not body (body isolation)', async () => {
      const resp = await postNovedad({
        token: tokenS1,
        horasExtra: '1.00',
        extraBody: {
          supervisorId: 'BOGUS-SUP',
          zoneId: 'BOGUS-ZONE',
          approvedByUserId: 'BOGUS-USER',
        },
      }).expect(201);

      const body = resp.body as Record<string, unknown>;
      expect(body.supervisorId).toBe(s1Id);
      expect(body.zoneId).toBe(zoneZ1Id);
      expect(body.approvedByUserId).toBeNull();
      expect(body.supervisorId).not.toBe('BOGUS-SUP');
    });

    it('NV-03 — create on INCOMPLETE attendance (completedAt null) → 409', async () => {
      await postNovedad({ token: tokenS1, attendanceId: aIncompleteId, horasExtra: '1.00' }).expect(409);

      // No Novedad row should exist
      const count = await prisma.novedad.count({ where: { attendanceId: aIncompleteId } });
      expect(count).toBe(0);
    });

    it('NV-04 — create when PENDING already exists → 409', async () => {
      // Create first novedad
      await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);

      // Try to create another
      await postNovedad({ token: tokenS1, horasExtra: '2.00' }).expect(409);

      // Only one novedad exists
      const count = await prisma.novedad.count({ where: { attendanceId: a1Id, status: 'PENDING' } });
      expect(count).toBe(1);
    });

    it('NV-05 — create when APPROVED already exists → 409', async () => {
      // Create novedad and approve via endpoint
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .patch(`/novedades/${novId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      // Now status is APPROVED — try to create another
      await postNovedad({ token: tokenS1, horasExtra: '2.00' }).expect(409);
    });

    it('NV-06 — create after prior REJECTED → 201 (partial unique allows)', async () => {
      // Create novedad
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      // Reject it
      await request(app.getHttpServer())
        .patch(`/novedades/${novId}/reject`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      // Create a new novedad — should succeed
      const resp2 = await postNovedad({ token: tokenS1, horasExtra: '2.00' }).expect(201);
      expect((resp2.body as Record<string, unknown>).status).toBe('PENDING');

      // Two rows for a1: one REJECTED, one PENDING
      const rows = await prisma.novedad.findMany({ where: { attendanceId: a1Id } });
      expect(rows).toHaveLength(2);
      const statuses = rows.map((r) => r.status).sort();
      expect(statuses).toEqual(['PENDING', 'REJECTED']);
    });

    it('NV-07 — create on attendance not belonging to caller → 404', async () => {
      // S1 tries to create on an attendance that doesn't exist in their scope
      // (We don't have an A2 here, so we use a fake ID — scope filter returns null → 404)
      await postNovedad({ token: tokenS1, attendanceId: 'non-existent-attendance' }).expect(404);
    });

    it('NV-08 — non-SUPERVISOR create (COORDINADOR) → 403', async () => {
      await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenC1}`)
        .send({ horasExtra: '1.00' })
        .expect(403);
    });

    it('NV-09 — non-SUPERVISOR create (LIDER_OPERATIVO) → 403', async () => {
      await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .send({ horasExtra: '1.00' })
        .expect(403);
    });

    it('NV-10 — invalid horasExtra: zero → 400', async () => {
      await postNovedad({ token: tokenS1, horasExtra: '0' }).expect(400);
    });

    it('NV-11 — invalid horasExtra: negative → 400', async () => {
      await postNovedad({ token: tokenS1, horasExtra: '-1.5' }).expect(400);
    });

    it('NV-12 — invalid horasExtra: exceeds maximum (>24) → 400', async () => {
      await postNovedad({ token: tokenS1, horasExtra: '25' }).expect(400);
    });

    it('NV-13 — invalid horasExtra: non-numeric string → 400', async () => {
      await postNovedad({ token: tokenS1, horasExtra: 'abc' }).expect(400);
    });

    it('NV-14 — no token → 401', async () => {
      await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .send({ horasExtra: '1.00' })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVE / REJECT scenarios (NV-15..NV-25)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('APPROVE / REJECT scenarios', () => {
    let novPendingId: string; // fresh PENDING novedad for each test

    beforeEach(async () => {
      // Create a fresh PENDING novedad for S1's A1
      const resp = await postNovedad({ token: tokenS1, horasExtra: '1.50' });
      novPendingId = (resp.body as Record<string, unknown>).id as string;
    });

    afterEach(async () => {
      await prisma.novedad.deleteMany({ where: { attendanceId: a1Id } });
    });

    it('NV-15 — LIDER approves PENDING → 200, approvedByUserId = L1.id from JWT', async () => {
      const resp = await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      const body = resp.body as Record<string, unknown>;
      expect(body.status).toBe('APPROVED');
      expect(body.approvedByUserId).toBe(l1UserId); // from JWT, not body
      expect(body.decidedAt).not.toBeNull();
    });

    it('NV-16 — SYSTEM_ADMIN approves PENDING → 200', async () => {
      const resp = await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect((resp.body as Record<string, unknown>).status).toBe('APPROVED');
      expect((resp.body as Record<string, unknown>).approvedByUserId).toBe(adminUserId);
    });

    it('NV-17 — LIDER rejects PENDING → 200, status = REJECTED', async () => {
      const resp = await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/reject`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      expect((resp.body as Record<string, unknown>).status).toBe('REJECTED');
      expect((resp.body as Record<string, unknown>).approvedByUserId).toBe(l1UserId);
    });

    it('NV-18 — approve already-APPROVED → 409 ImmutableNovedadError', async () => {
      // Approve first
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      // Approve again → 409
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(409);
    });

    it('NV-19 — approve already-REJECTED → 409', async () => {
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/reject`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(409);
    });

    it('NV-20 — reject already-decided (APPROVED) → 409', async () => {
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/reject`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(409);
    });

    it('NV-21 — SUPERVISOR tries to approve → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(403);
    });

    it('NV-22 — COORDINADOR tries to approve → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .set('Authorization', `Bearer ${tokenC1}`)
        .expect(403);
    });

    it('NV-23 — approve non-existent novedad → 404', async () => {
      await request(app.getHttpServer())
        .patch('/novedades/does-not-exist/approve')
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(404);
    });

    it('NV-24 — no token on approve → 401', async () => {
      await request(app.getHttpServer())
        .patch(`/novedades/${novPendingId}/approve`)
        .expect(401);
    });

    it('NV-25 — LIDER approves novedad from Z2 (cross-zone, global visibility) → 200', async () => {
      // Create an attendance + novedad for S2 in Z2
      const o2 = await prisma.operario.create({
        data: { fullName: 'Test Operario Nov-2', documento: 'DOC-NOV-002', supervisorId: s2Id },
      });
      const a2 = await prisma.attendance.create({
        data: {
          supervisorId: s2Id,
          operarioId: o2.id,
          zoneId: zoneZ2Id,
          date: '2026-05-29',
          checkInCapturedAt: new Date('2026-05-29T07:00:00Z'),
          checkInLat: 8.0,
          checkInLng: -75.0,
          clientRef: 'nov-int-test-a2',
          completedAt: new Date('2026-05-29T17:00:00Z'),
          updatedAt: new Date(),
        },
      });

      // Create novedad for S2 (cross-zone — S1 won't see it)
      const n2Resp = await request(app.getHttpServer())
        .post(`/asistencia/${a2.id}/novedades`)
        .set('Authorization', `Bearer ${tokenS2}`)
        .send({ horasExtra: '3.00' })
        .expect(201);
      const n2Id = (n2Resp.body as Record<string, unknown>).id as string;

      // LIDER (no zoneId) approves — should work globally
      const approveResp = await request(app.getHttpServer())
        .patch(`/novedades/${n2Id}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      expect((approveResp.body as Record<string, unknown>).status).toBe('APPROVED');
      expect((approveResp.body as Record<string, unknown>).approvedByUserId).toBe(l1UserId);

      // Cleanup
      await prisma.novedad.deleteMany({ where: { attendanceId: a2.id } });
      await prisma.attendance.delete({ where: { id: a2.id } });
      await prisma.operario.delete({ where: { id: o2.id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL / DELETE scenarios (NV-26..NV-31)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CANCEL / DELETE scenarios', () => {
    afterEach(async () => {
      await prisma.novedad.deleteMany({ where: { attendanceId: a1Id } });
    });

    it('NV-26 — SUPERVISOR owner deletes own PENDING novedad → 204, row gone', async () => {
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .delete(`/novedades/${novId}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(204);

      // Row must not exist
      const count = await prisma.novedad.count({ where: { id: novId } });
      expect(count).toBe(0);
    });

    it('NV-27 — delete APPROVED novedad → 409', async () => {
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .patch(`/novedades/${novId}/approve`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/novedades/${novId}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(409);

      const count = await prisma.novedad.count({ where: { id: novId } });
      expect(count).toBe(1);
    });

    it('NV-28 — delete REJECTED novedad → 409', async () => {
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .patch(`/novedades/${novId}/reject`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/novedades/${novId}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(409);
    });

    it('NV-29 — S1 tries to delete S2\'s novedad → 404 (fail-closed), N2 still exists', async () => {
      // Create a novedad belonging to S2 via direct DB insert (scope filter would block)
      // First create attendance for S2
      const o2 = await prisma.operario.create({
        data: { fullName: 'Test Op NV29', documento: 'DOC-NV29', supervisorId: s2Id },
      });
      const a2 = await prisma.attendance.create({
        data: {
          supervisorId: s2Id,
          operarioId: o2.id,
          zoneId: zoneZ2Id,
          date: '2026-05-28',
          checkInCapturedAt: new Date('2026-05-28T07:00:00Z'),
          checkInLat: 8.0,
          checkInLng: -75.0,
          clientRef: 'nov-int-nv29',
          completedAt: new Date('2026-05-28T17:00:00Z'),
          updatedAt: new Date(),
        },
      });
      // Create novedad as S2
      const n2Resp = await request(app.getHttpServer())
        .post(`/asistencia/${a2.id}/novedades`)
        .set('Authorization', `Bearer ${tokenS2}`)
        .send({ horasExtra: '1.00' })
        .expect(201);
      const n2Id = (n2Resp.body as Record<string, unknown>).id as string;

      // S1 tries to delete S2's novedad → 404
      await request(app.getHttpServer())
        .delete(`/novedades/${n2Id}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(404);

      // N2 still exists
      const count = await prisma.novedad.count({ where: { id: n2Id } });
      expect(count).toBe(1);

      // Cleanup
      await prisma.novedad.delete({ where: { id: n2Id } });
      await prisma.attendance.delete({ where: { id: a2.id } });
      await prisma.operario.delete({ where: { id: o2.id } });
    });

    it('NV-30 — COORDINADOR tries to delete → 403', async () => {
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .delete(`/novedades/${novId}`)
        .set('Authorization', `Bearer ${tokenC1}`)
        .expect(403);
    });

    it('NV-31 — LIDER tries to delete → 403', async () => {
      const createResp = await postNovedad({ token: tokenS1, horasExtra: '1.00' }).expect(201);
      const novId = (createResp.body as Record<string, unknown>).id as string;

      await request(app.getHttpServer())
        .delete(`/novedades/${novId}`)
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IDEMPOTENCY scenarios (SI-01..SI-04) — sync-idempotency PR-A
  // ═══════════════════════════════════════════════════════════════════════════

  describe('IDEMPOTENCY scenarios (SI-01..SI-04)', () => {
    afterEach(async () => {
      // Clean novedades after each idempotency test
      await prisma.novedad.deleteMany({ where: { attendanceId: { in: [a1Id, aIncompleteId] } } });
    });

    it('SI-01 — POST with clientRef (first time) → 201, clientRef stored in DB', async () => {
      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '2.00', clientRef: 'si-01-uuid-x' })
        .expect(201);

      const body = resp.body as Record<string, unknown>;
      expect(body.id).toBeDefined();
      expect(body.clientRef).toBe('si-01-uuid-x');

      const dbRow = await prisma.novedad.findFirst({ where: { attendanceId: a1Id } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.clientRef).toBe('si-01-uuid-x');
    });

    it('SI-02 — replay same clientRef → 200, same id, DB count = 1', async () => {
      // Create first
      const first = await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '2.00', clientRef: 'si-02-uuid-x' })
        .expect(201);
      const firstId = (first.body as Record<string, unknown>).id as string;

      // Replay with different horasExtra — idempotent; must not matter
      const second = await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '3.50', clientRef: 'si-02-uuid-x' })
        .expect(200);

      const secondId = (second.body as Record<string, unknown>).id as string;
      expect(secondId).toBe(firstId);

      const count = await prisma.novedad.count({ where: { attendanceId: a1Id } });
      expect(count).toBe(1);
    });

    it('SI-03 — POST without clientRef (backward compat) → 201, clientRef=null in DB', async () => {
      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '1.00' })
        .expect(201);

      const body = resp.body as Record<string, unknown>;
      expect(body.id).toBeDefined();

      const dbRow = await prisma.novedad.findFirst({ where: { attendanceId: a1Id } });
      expect(dbRow?.clientRef).toBeNull();
    });

    it('SI-04 — new clientRef, active novedad exists → 409 (plain message, not ConflictResponseDto)', async () => {
      // Create first novedad (no clientRef — creates PENDING)
      await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '1.00' })
        .expect(201);

      // Try again with a NEW clientRef — should hit partial unique index
      const resp = await request(app.getHttpServer())
        .post(`/asistencia/${a1Id}/novedades`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .send({ horasExtra: '3.00', clientRef: 'si-04-uuid-z' })
        .expect(409);

      const body = resp.body as Record<string, unknown>;
      // Must NOT be a ConflictResponseDto (no error: 'CONFLICT' + conflicting field)
      expect(body.error).not.toBe('CONFLICT');
      expect(body.conflicting).toBeUndefined();

      const count = await prisma.novedad.count({ where: { attendanceId: a1Id } });
      expect(count).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // READ scenarios (NV-32..NV-37)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('READ scenarios', () => {
    let novS1Id: string; // novedad owned by S1 in Z1

    beforeAll(async () => {
      // Create a persistent novedad for S1 (used across read tests)
      const resp = await postNovedad({ token: tokenS1, horasExtra: '2.00' });
      novS1Id = (resp.body as Record<string, unknown>).id as string;
    });

    afterAll(async () => {
      await prisma.novedad.deleteMany({ where: { id: novS1Id } });
    });

    it('NV-32 — SUPERVISOR list returns only own novedades', async () => {
      const resp = await request(app.getHttpServer())
        .get('/novedades')
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(200);

      const body = resp.body as Record<string, unknown>[];
      // All returned novedades must belong to S1
      expect(body.every((n) => n.supervisorId === s1Id)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it('NV-33 — COORDINADOR (Z1) list returns novedades from Z1 (cross-supervisor)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/novedades')
        .set('Authorization', `Bearer ${tokenC1}`)
        .expect(200);

      const body = resp.body as Record<string, unknown>[];
      // All returned novedades must be in Z1
      expect(body.every((n) => n.zoneId === zoneZ1Id)).toBe(true);
      // Should include our S1 novedad
      expect(body.some((n) => n.id === novS1Id)).toBe(true);
    });

    it('NV-34 — LIDER list returns ALL novedades (global)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/novedades')
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      const body = resp.body as Record<string, unknown>[];
      // Should see our novedad (no zone restriction)
      expect(body.some((n) => n.id === novS1Id)).toBe(true);
    });

    it('NV-35 — SUPERVISOR detail of own novedad → 200', async () => {
      const resp = await request(app.getHttpServer())
        .get(`/novedades/${novS1Id}`)
        .set('Authorization', `Bearer ${tokenS1}`)
        .expect(200);

      expect((resp.body as Record<string, unknown>).id).toBe(novS1Id);
    });

    it('NV-36 — SUPERVISOR detail of another\'s novedad → 404 (fail-closed)', async () => {
      // S2 tries to get S1's novedad → scope filter returns null → 404
      await request(app.getHttpServer())
        .get(`/novedades/${novS1Id}`)
        .set('Authorization', `Bearer ${tokenS2}`)
        .expect(404);
    });

    it('NV-37 — COORDINADOR Z2 detail of Z1 novedad → 404 (fail-closed)', async () => {
      // C2 (zoneId=Z2) tries to get a Z1 novedad → zone filter returns null → 404
      await request(app.getHttpServer())
        .get(`/novedades/${novS1Id}`)
        .set('Authorization', `Bearer ${tokenC2}`)
        .expect(404);
    });
  });
});
