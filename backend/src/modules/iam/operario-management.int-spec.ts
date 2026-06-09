/**
 * T-23 + T-24 + PR-2 — Operario Management Integration Suite (PR-1 + PR-2).
 *
 * Covers PR-1 OP-* scenarios:
 *   OP-01, OP-02 (create happy path — SYSTEM_ADMIN, TALENTO_HUMANO)
 *   OP-03 (dup documento → 409)
 *   OP-04 (bad supervisorId → 400)
 *   OP-05, OP-06 (missing required fields → 400)
 *   OP-07 (COORDINADOR → 403)
 *   OP-09 (no token → 401)
 *   OP-24 (deactivate active → 200)
 *   OP-25, OP-26 (list active/inactive filter)
 *   OP-27 (deactivate already-inactive → 409)
 *   OP-28 (reactivate → 200)
 *   OP-29 (reactivate already-active → 409)
 *   OP-30 (deactivate non-existent → 404)
 *   OP-32 (TALENTO_HUMANO can deactivate/reactivate)
 *   OP-35 (attendance history preserved after deactivation)
 *
 * Covers PR-2 OP-* scenarios:
 *   OP-10 (all-valid CSV → 200, all rows persisted)
 *   OP-11 (mixed CSV: dup documento + unknown supervisor → partial success)
 *   OP-12 (in-file dup documento → first occurrence wins)
 *   OP-13 (all-invalid CSV → imported:0, nothing persisted)
 *   OP-14 (empty CSV → 400)
 *   OP-15 (malformed CSV → 400)
 *   OP-16 (LIDER_OPERATIVO → 403)
 *   OP-17 (supervisor resolved by email — supervisorId linkage)
 *
 * Fixture setup:
 *   - Seeded zones (Zona Urabá for S1)
 *   - Supervisor S1 (SYSTEM_ADMIN actor for write ops)
 *   - Supervisor S2 (for OP-17 in PR-2; here just used to have two supervisors)
 *   - TALENTO_HUMANO user with DeviceSession
 *   - COORDINADOR user (for 403 test)
 *   - Operarios created per-test inside describe blocks
 *
 * Teardown: FK-safe order (Attendance → Novedad → Operario → Supervisor → DeviceSession → User)
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
const TEST_DEVICE = 'operario-mgmt-test-device';
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

describe('Operario Management Integration Suite (PR-1)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Fixture ids
  let zoneZ1Id: string;
  let s1UserId: string;
  let s1Id: string;
  let s2UserId: string;
  let s2Id: string;
  let adminUserId: string;
  let talentoUserId: string;
  let coordUserId: string;
  let liderUserId: string;

  // Tokens
  let tokenAdmin: string;
  let tokenTalento: string;
  let tokenCoord: string;
  let tokenLider: string;

  // Cleanup tracking
  const createdUserIds: string[] = [];
  const createdOperarioIds: string[] = [];

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

    // Resolve seeded municipio for supervisors
    const municipioRow = await prisma.municipio.findFirst({ where: { zoneId: zoneZ1Id } });
    if (!municipioRow) throw new Error('No seeded municipio in Zona Urabá');
    const municipio = municipioRow;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Clean up any leftover fixtures
    const fixtureEmails = [
      'admin-operario-test@futuragest.co',
      's1-operario-test@futuragest.co',
      's2-operario-test@futuragest.co',
      'talento-operario-test@futuragest.co',
      'coord-operario-test@futuragest.co',
      'lider-operario-test@futuragest.co',
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

    async function createUser(email: string, role: string) {
      const user = await prisma.user.create({
        data: { email, passwordHash, role: role as any, mustChangePassword: false },
      });
      createdUserIds.push(user.id);
      await prisma.deviceSession.create({
        data: {
          userId: user.id,
          deviceId: TEST_DEVICE,
          refreshTokenHash: await argon2.hash('dummy-refresh'),
        },
      });
      return user;
    }

    async function createSupervisor(email: string) {
      const user = await createUser(email, 'SUPERVISOR');
      const supervisor = await prisma.supervisor.create({
        data: {
          userId: user.id,
          municipioId: municipio.id,
          zoneId: zoneZ1Id,
          area: 'BARRIDO',
        },
      });
      return { userId: user.id, supervisorId: supervisor.id };
    }

    // Admin user (no supervisor row needed)
    const adminUser = await createUser('admin-operario-test@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = adminUser.id;

    // Supervisor S1 for scope
    const s1 = await createSupervisor('s1-operario-test@futuragest.co');
    s1UserId = s1.userId;
    s1Id = s1.supervisorId;

    // Supervisor S2 (for supervisor resolution tests in PR-2)
    const s2 = await createSupervisor('s2-operario-test@futuragest.co');
    s2UserId = s2.userId;
    s2Id = s2.supervisorId;

    // TALENTO_HUMANO user
    const talentoUser = await createUser('talento-operario-test@futuragest.co', 'TALENTO_HUMANO');
    talentoUserId = talentoUser.id;

    // COORDINADOR user
    const coordUser = await createUser('coord-operario-test@futuragest.co', 'COORDINADOR');
    coordUserId = coordUser.id;

    // LIDER_OPERATIVO user (for OP-16)
    const liderUser = await createUser('lider-operario-test@futuragest.co', 'LIDER_OPERATIVO');
    liderUserId = liderUser.id;

    // Mint tokens
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
    tokenTalento = mintToken({ sub: talentoUserId, role: 'TALENTO_HUMANO' });
    tokenCoord = mintToken({ sub: coordUserId, role: 'COORDINADOR', zoneId: zoneZ1Id });
    tokenLider = mintToken({ sub: liderUserId, role: 'LIDER_OPERATIVO' });
  }, 30_000);

  afterAll(async () => {
    // FK-safe cleanup: Attendance → Operario → Supervisor → DeviceSession → User
    if (createdOperarioIds.length > 0) {
      await prisma.attendance.deleteMany({ where: { operarioId: { in: createdOperarioIds } } });
      await prisma.operario.deleteMany({ where: { id: { in: createdOperarioIds } } });
    }

    // Delete any operarios under s1/s2 that weren't tracked
    await prisma.operario.deleteMany({ where: { supervisorId: { in: [s1Id, s2Id].filter(Boolean) } } });

    // Delete supervisors
    await prisma.supervisor.deleteMany({ where: { id: { in: [s1Id, s2Id].filter(Boolean) } } });

    // DeviceSessions and Users
    for (const userId of createdUserIds) {
      await prisma.deviceSession.deleteMany({ where: { userId } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }

    await prisma.$disconnect();
    await app.close();
  });

  // Helper to create an operario and track its id for cleanup
  async function createOperario(
    supervisorId: string,
    documento: string,
    fullName = 'Test Worker',
    token = tokenAdmin,
  ) {
    const resp = await request(app.getHttpServer())
      .post('/iam/operarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName, documento, supervisorId })
      .expect(201);

    const id = resp.body.id as string;
    createdOperarioIds.push(id);
    return id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /iam/operarios — create', () => {
    it('OP-01 — SYSTEM_ADMIN creates operario (happy path)', async () => {
      const resp = await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ fullName: 'Juan Perez', documento: 'op01-12345678', supervisorId: s1Id })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      const id = resp.body.id as string;
      createdOperarioIds.push(id);

      const row = await prisma.operario.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row!.fullName).toBe('Juan Perez');
      expect(row!.documento).toBe('op01-12345678');
      expect(row!.supervisorId).toBe(s1Id);
      expect(row!.deactivatedAt).toBeNull();
    });

    it('OP-02 — TALENTO_HUMANO creates operario', async () => {
      const resp = await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ fullName: 'Ana Lopez', documento: 'op02-99887766', supervisorId: s1Id })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      createdOperarioIds.push(resp.body.id);

      const row = await prisma.operario.findUnique({ where: { id: resp.body.id } });
      expect(row!.deactivatedAt).toBeNull();
    });

    it('OP-03 — Duplicate documento → 409', async () => {
      const documento = 'op03-dup-doc-11111';
      const id = await createOperario(s1Id, documento, 'First');

      await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ fullName: 'Second', documento, supervisorId: s1Id })
        .expect(409);

      const count = await prisma.operario.count({ where: { documento } });
      expect(count).toBe(1);
    });

    it('OP-04 — Unknown supervisorId → 400', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ fullName: 'Test', documento: 'op04-22222222', supervisorId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);

      const count = await prisma.operario.count({ where: { documento: 'op04-22222222' } });
      expect(count).toBe(0);
    });

    it('OP-05 — Missing fullName → 400', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ documento: 'op05-33333333', supervisorId: s1Id })
        .expect(400);
    });

    it('OP-06 — Missing documento → 400', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ fullName: 'Test', supervisorId: s1Id })
        .expect(400);
    });

    it('OP-07 — COORDINADOR → 403', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .set('Authorization', `Bearer ${tokenCoord}`)
        .send({ fullName: 'Test', documento: 'op07-44444444', supervisorId: s1Id })
        .expect(403);

      const count = await prisma.operario.count({ where: { documento: 'op07-44444444' } });
      expect(count).toBe(0);
    });

    it('OP-09 — No token → 401', async () => {
      await request(app.getHttpServer())
        .post('/iam/operarios')
        .send({ fullName: 'Test', documento: 'op09-66666666', supervisorId: s1Id })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEACTIVATE / REACTIVATE scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /iam/operarios/:id/deactivate + reactivate', () => {
    let opId: string;

    beforeEach(async () => {
      // Fresh active operario for each test
      const doc = `deact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      opId = await createOperario(s1Id, doc);
    });

    it('OP-24 — Deactivate active operario → 200, deactivatedAt set', async () => {
      const resp = await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resp.body.active).toBe(false);
      expect(resp.body.deactivatedAt).not.toBeNull();

      const row = await prisma.operario.findUnique({ where: { id: opId } });
      expect(row!.deactivatedAt).not.toBeNull();
    });

    it('OP-27 — Deactivate already-inactive → 409', async () => {
      // First deactivation
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const beforeRow = await prisma.operario.findUnique({ where: { id: opId } });
      const firstDeactivatedAt = beforeRow!.deactivatedAt;

      // Second deactivation — must be 409
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(409);

      // deactivatedAt must not have changed
      const afterRow = await prisma.operario.findUnique({ where: { id: opId } });
      expect(afterRow!.deactivatedAt?.toISOString()).toBe(firstDeactivatedAt?.toISOString());
    });

    it('OP-28 — Reactivate inactive operario → 200, deactivatedAt cleared', async () => {
      // Deactivate first
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      // Reactivate
      const resp = await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/reactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resp.body.active).toBe(true);
      expect(resp.body.deactivatedAt).toBeNull();

      const row = await prisma.operario.findUnique({ where: { id: opId } });
      expect(row!.deactivatedAt).toBeNull();
    });

    it('OP-29 — Reactivate already-active → 409', async () => {
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/reactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(409);
    });

    it('OP-30 — Deactivate non-existent → 404', async () => {
      await request(app.getHttpServer())
        .patch('/iam/operarios/00000000-0000-0000-0000-000000000000/deactivate')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
    });

    it('OP-32 — TALENTO_HUMANO can deactivate and reactivate', async () => {
      // Deactivate with TALENTO_HUMANO
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenTalento}`)
        .expect(200);

      // Reactivate with TALENTO_HUMANO
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/reactivate`)
        .set('Authorization', `Bearer ${tokenTalento}`)
        .expect(200);

      const row = await prisma.operario.findUnique({ where: { id: opId } });
      expect(row!.deactivatedAt).toBeNull();
    });

    it('OP-35 — Deactivation does NOT delete existing attendance rows', async () => {
      // Create a minimal attendance record for opId under S1
      const today = new Date().toISOString().split('T')[0];
      const clientRef = `op35-test-${Date.now()}`;
      await prisma.attendance.create({
        data: {
          supervisorId: s1Id,
          operarioId: opId,
          zoneId: zoneZ1Id,
          date: today,
          checkInCapturedAt: new Date(),
          checkInReceivedAt: new Date(),
          checkInLat: 0,
          checkInLng: 0,
          clientRef,
        },
      });

      const beforeCount = await prisma.attendance.count({ where: { operarioId: opId } });
      expect(beforeCount).toBe(1);

      // Deactivate
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      // Attendance rows must be unchanged
      const afterCount = await prisma.attendance.count({ where: { operarioId: opId } });
      expect(afterCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CSV IMPORT scenarios (PR-2: OP-10..17)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /iam/operarios/import — CSV import', () => {
    // Helper to build CSV buffer inline
    function csvBuf(rows: Array<{ fullName: string; documento: string; supervisorEmail: string }>): Buffer {
      const header = 'fullName,documento,supervisorEmail\n';
      const body = rows.map((r) => `${r.fullName},${r.documento},${r.supervisorEmail}`).join('\n') + '\n';
      return Buffer.from(header + body, 'utf-8');
    }

    // Cleanup tracking for import-created operarios
    const importedDocs: string[] = [];

    afterEach(async () => {
      // Clean up operarios created by import tests (by documento)
      if (importedDocs.length > 0) {
        const rows = await prisma.operario.findMany({
          where: { documento: { in: [...importedDocs] } },
          select: { id: true },
        });
        const ids = rows.map((r) => r.id);
        if (ids.length > 0) {
          await prisma.attendance.deleteMany({ where: { operarioId: { in: ids } } });
          await prisma.operario.deleteMany({ where: { id: { in: ids } } });
        }
        importedDocs.length = 0;
      }
    });

    it('OP-10 — all-valid CSV: 3 rows imported, all persisted with correct supervisorId', async () => {
      const s1Email = 's1-operario-test@futuragest.co';
      const docs = [`imp-op10a-${Date.now()}`, `imp-op10b-${Date.now()}`, `imp-op10c-${Date.now()}`];
      importedDocs.push(...docs);

      const buf = csvBuf([
        { fullName: 'Worker A', documento: docs[0], supervisorEmail: s1Email },
        { fullName: 'Worker B', documento: docs[1], supervisorEmail: s1Email },
        { fullName: 'Worker C', documento: docs[2], supervisorEmail: s1Email },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body.imported).toBe(3);
      expect(resp.body.failed).toBe(0);
      expect(resp.body.errors).toHaveLength(0);

      // Assert all 3 rows persisted
      const count = await prisma.operario.count({ where: { documento: { in: docs } } });
      expect(count).toBe(3);

      // Assert deactivatedAt=null (active)
      const created = await prisma.operario.findFirst({ where: { documento: docs[0] } });
      expect(created!.deactivatedAt).toBeNull();
    });

    it('OP-17 — supervisor resolved by email: created operario.supervisorId == S2.id', async () => {
      const s2Email = 's2-operario-test@futuragest.co';
      const doc = `imp-op17-${Date.now()}`;
      importedDocs.push(doc);

      const buf = csvBuf([{ fullName: 'Test Worker', documento: doc, supervisorEmail: s2Email }]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body.imported).toBe(1);

      // Assert supervisorId matches S2
      const row = await prisma.operario.findFirst({ where: { documento: doc } });
      expect(row).not.toBeNull();
      expect(row!.supervisorId).toBe(s2Id);
    });

    it('OP-11 — mixed CSV: valid + dup documento + unknown supervisor → partial success', async () => {
      // Pre-create one operario with a known documento
      const existingDoc = `imp-op11-existing-${Date.now()}`;
      await prisma.operario.create({
        data: { fullName: 'Existing', documento: existingDoc, supervisorId: s1Id, deactivatedAt: null },
      });
      importedDocs.push(existingDoc);

      const validDoc1 = `imp-op11-valid1-${Date.now()}`;
      const validDoc2 = `imp-op11-valid4-${Date.now()}`;
      const unknownSupEmail = 'nobody-unknown@x.com';
      const s1Email = 's1-operario-test@futuragest.co';

      importedDocs.push(validDoc1, validDoc2);

      const buf = csvBuf([
        { fullName: 'Row 1 Valid', documento: validDoc1, supervisorEmail: s1Email },
        { fullName: 'Row 2 Dup DB', documento: existingDoc, supervisorEmail: s1Email },
        { fullName: 'Row 3 Bad Sup', documento: `imp-op11-row3-${Date.now()}`, supervisorEmail: unknownSupEmail },
        { fullName: 'Row 4 Valid', documento: validDoc2, supervisorEmail: s1Email },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body.imported).toBe(2);
      expect(resp.body.failed).toBe(2);
      expect(resp.body.errors).toHaveLength(2);

      const errorDocs = (resp.body.errors as Array<{ documento: string }>).map((e) => e.documento);
      expect(errorDocs).toContain(existingDoc);

      // Rows 1 and 4 persisted; rows 2 and 3 not
      const validCount = await prisma.operario.count({ where: { documento: { in: [validDoc1, validDoc2] } } });
      expect(validCount).toBe(2);
    });

    it('OP-12 — in-file dup documento: first occurrence persisted, second is error', async () => {
      const dupDoc = `imp-op12-dup-${Date.now()}`;
      const uniqueDoc = `imp-op12-unique-${Date.now()}`;
      const s1Email = 's1-operario-test@futuragest.co';

      importedDocs.push(dupDoc, uniqueDoc);

      const buf = csvBuf([
        { fullName: 'Row 1 First', documento: dupDoc, supervisorEmail: s1Email },
        { fullName: 'Row 2 Unique', documento: uniqueDoc, supervisorEmail: s1Email },
        { fullName: 'Row 3 Second dup', documento: dupDoc, supervisorEmail: s1Email },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body.imported).toBe(2); // rows 1 and 2
      expect(resp.body.failed).toBe(1);   // row 3
      expect(resp.body.errors[0].row).toBe(3);
      expect(resp.body.errors[0].documento).toBe(dupDoc);

      // First occurrence of dupDoc IS persisted
      const dupCount = await prisma.operario.count({ where: { documento: dupDoc } });
      expect(dupCount).toBe(1);
    });

    it('OP-13 — all-invalid CSV: imported:0, NOTHING persisted', async () => {
      const unknownEmail = 'nobody-allbad@x.com';
      const docs = [`imp-op13a-${Date.now()}`, `imp-op13b-${Date.now()}`, `imp-op13c-${Date.now()}`];
      // Do NOT push to importedDocs — nothing should be created

      const buf = csvBuf([
        { fullName: 'Row 1', documento: docs[0], supervisorEmail: unknownEmail },
        { fullName: 'Row 2', documento: docs[1], supervisorEmail: unknownEmail },
        { fullName: 'Row 3', documento: docs[2], supervisorEmail: unknownEmail },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(200);

      expect(resp.body.imported).toBe(0);
      expect(resp.body.failed).toBe(3);
      expect(resp.body.errors).toHaveLength(3);

      // Assert nothing persisted
      const count = await prisma.operario.count({ where: { documento: { in: docs } } });
      expect(count).toBe(0);
    });

    it('OP-14 — empty CSV (header only, no data rows) → 400', async () => {
      const emptyBuf = Buffer.from('fullName,documento,supervisorEmail\n', 'utf-8');

      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', emptyBuf, { filename: 'empty.csv', contentType: 'text/csv' })
        .expect(400);
    });

    it('OP-15 — malformed CSV (binary garbage) → 400', async () => {
      // A buffer that is not valid CSV (mismatched quotes confuse csv-parse)
      const badBuf = Buffer.from(
        'fullName,documento,supervisorEmail\n"unclosed quote,12345,sup@test.co\n',
        'utf-8',
      );

      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', badBuf, { filename: 'bad.csv', contentType: 'text/csv' })
        .expect(400);
    });

    it('OP-16 — LIDER_OPERATIVO → 403', async () => {
      const buf = csvBuf([
        { fullName: 'Test', documento: `imp-op16-${Date.now()}`, supervisorEmail: 's1-operario-test@futuragest.co' },
      ]);

      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenLider}`)
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(403);
    });

    it('no token → 401', async () => {
      const buf = csvBuf([
        { fullName: 'Test', documento: `imp-noauth-${Date.now()}`, supervisorEmail: 's1-operario-test@futuragest.co' },
      ]);

      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .attach('file', buf, { filename: 'operarios.csv', contentType: 'text/csv' })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // XLSX IMPORT scenarios (PR-3: OP-18, OP-19, OP-20)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /iam/operarios/import — XLSX import', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs');

    async function xlsxBuf(
      rows: Array<{ fullName: string; documento: string; supervisorEmail: string }>,
    ): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Operarios');
      sheet.addRow(['fullName', 'documento', 'supervisorEmail']);
      for (const r of rows) {
        sheet.addRow([r.fullName, r.documento, r.supervisorEmail]);
      }
      const result = await wb.xlsx.writeBuffer();
      return Buffer.from(result);
    }

    const importedDocs: string[] = [];

    afterEach(async () => {
      if (importedDocs.length > 0) {
        const rows = await prisma.operario.findMany({
          where: { documento: { in: [...importedDocs] } },
          select: { id: true },
        });
        const ids = rows.map((r) => r.id);
        if (ids.length > 0) {
          await prisma.attendance.deleteMany({ where: { operarioId: { in: ids } } });
          await prisma.operario.deleteMany({ where: { id: { in: ids } } });
        }
        importedDocs.length = 0;
      }
    });

    it('OP-18 — all-valid XLSX: 3 rows imported, all persisted, active', async () => {
      const s1Email = 's1-operario-test@futuragest.co';
      const docs = [
        `xlsx-op18a-${Date.now()}`,
        `xlsx-op18b-${Date.now()}`,
        `xlsx-op18c-${Date.now()}`,
      ];
      importedDocs.push(...docs);

      const buf = await xlsxBuf([
        { fullName: 'Worker A', documento: docs[0], supervisorEmail: s1Email },
        { fullName: 'Worker B', documento: docs[1], supervisorEmail: s1Email },
        { fullName: 'Worker C', documento: docs[2], supervisorEmail: s1Email },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, {
          filename: 'operarios.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(200);

      expect(resp.body.imported).toBe(3);
      expect(resp.body.failed).toBe(0);
      expect(resp.body.errors).toHaveLength(0);

      const count = await prisma.operario.count({ where: { documento: { in: docs } } });
      expect(count).toBe(3);

      // All active (deactivatedAt=null)
      const created = await prisma.operario.findFirst({ where: { documento: docs[0] } });
      expect(created!.deactivatedAt).toBeNull();
    });

    it('OP-19 — mixed XLSX: one invalid row → partial success', async () => {
      const s1Email = 's1-operario-test@futuragest.co';
      const unknownEmail = 'nobody-xlsx@x.com';
      const validDoc1 = `xlsx-op19-v1-${Date.now()}`;
      const invalidDoc = `xlsx-op19-inv-${Date.now()}`;
      const validDoc2 = `xlsx-op19-v2-${Date.now()}`;
      importedDocs.push(validDoc1, invalidDoc, validDoc2);

      const buf = await xlsxBuf([
        { fullName: 'Row 1 Valid', documento: validDoc1, supervisorEmail: s1Email },
        { fullName: 'Row 2 Bad Sup', documento: invalidDoc, supervisorEmail: unknownEmail },
        { fullName: 'Row 3 Valid', documento: validDoc2, supervisorEmail: s1Email },
      ]);

      const resp = await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', buf, {
          filename: 'operarios.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(200);

      expect(resp.body.imported).toBe(2);
      expect(resp.body.failed).toBe(1);
      expect(resp.body.errors).toHaveLength(1);
      expect(resp.body.errors[0].row).toBe(2);

      const validCount = await prisma.operario.count({
        where: { documento: { in: [validDoc1, validDoc2] } },
      });
      expect(validCount).toBe(2);
    });

    it('OP-20 — wrong mimetype (text/plain) → 400', async () => {
      const csvContent = Buffer.from(
        'fullName,documento,supervisorEmail\nTest,99999,s1-operario-test@futuragest.co\n',
        'utf-8',
      );

      await request(app.getHttpServer())
        .post('/iam/operarios/import')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .attach('file', csvContent, { filename: 'data.txt', contentType: 'text/plain' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST FILTER scenarios (OP-25, OP-26, OP-36, OP-37)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /iam/operarios — includeInactive filter', () => {
    let activeOpId: string;
    let inactiveOpId: string;

    beforeAll(async () => {
      const docActive = `list-active-${Date.now()}`;
      const docInactive = `list-inactive-${Date.now()}`;

      activeOpId = await createOperario(s1Id, docActive, 'Active Worker');
      inactiveOpId = await createOperario(s1Id, docInactive, 'Inactive Worker');

      // Deactivate inactiveOpId
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${inactiveOpId}/deactivate`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
    });

    it('OP-25 — default list excludes inactive operarios', async () => {
      const resp = await request(app.getHttpServer())
        .get('/iam/operarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const ids = (resp.body as Array<{ id: string }>).map((o) => o.id);
      expect(ids).toContain(activeOpId);
      expect(ids).not.toContain(inactiveOpId);
    });

    it('OP-26 — ?includeInactive=true includes inactive operarios', async () => {
      const resp = await request(app.getHttpServer())
        .get('/iam/operarios?includeInactive=true')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const ids = (resp.body as Array<{ id: string }>).map((o) => o.id);
      expect(ids).toContain(activeOpId);
      expect(ids).toContain(inactiveOpId);

      const inactiveEntry = (resp.body as Array<{ id: string; deactivatedAt?: string | null }>)
        .find((o) => o.id === inactiveOpId);
      // deactivatedAt will be present from DB but not in the DTO shape unless mapped
      // The raw Prisma object has deactivatedAt; DTO mapping happens in use-cases not list endpoint
      expect(inactiveEntry).toBeDefined();
    });
  });

  describe('PATCH /iam/operarios/:id — reassign supervisor', () => {
    it('SYSTEM_ADMIN reassigns an operario to another supervisor → 200', async () => {
      const opId = await createOperario(s1Id, '90000001', 'Reassign Me');
      const resp = await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ supervisorId: s2Id })
        .expect(200);
      expect((resp.body as { supervisorId: string }).supervisorId).toBe(s2Id);
    });

    it('reassign to a non-existent supervisor → 400', async () => {
      const opId = await createOperario(s1Id, '90000002', 'Bad Reassign');
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ supervisorId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('COORDINADOR (non write-role) is forbidden → 403', async () => {
      const opId = await createOperario(s1Id, '90000003', 'No Perms');
      await request(app.getHttpServer())
        .patch(`/iam/operarios/${opId}`)
        .set('Authorization', `Bearer ${tokenCoord}`)
        .send({ supervisorId: s2Id })
        .expect(403);
    });
  });
});
