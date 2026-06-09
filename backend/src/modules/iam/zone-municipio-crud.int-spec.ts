/**
 * Zone & Municipio CRUD Integration Suite.
 *
 * Covers the 6 new write endpoints added in WU-zones-municipios-crud:
 *
 * ZONES:
 *   ZC-01  POST /org/zones — happy path (SYSTEM_ADMIN) → 201 {id}
 *   ZC-02  POST /org/zones — duplicate name → 409
 *   ZC-03  POST /org/zones — GERENCIA caller → 403
 *   ZC-04  POST /org/zones — no token → 401
 *   ZC-05  PATCH /org/zones/:id — rename happy path → 200 ZoneResponseDto
 *   ZC-06  PATCH /org/zones/:id — not found → 404
 *   ZC-07  PATCH /org/zones/:id — name collides with existing zone → 409
 *   ZC-08  DELETE /org/zones/:id — happy path (no dependents) → 200
 *   ZC-09  DELETE /org/zones/:id — not found → 404
 *   ZC-10  DELETE /org/zones/:id — has municipios → 409
 *   ZC-11  DELETE /org/zones/:id — has supervisors → 409
 *   ZC-12  DELETE /org/zones/:id — has coordinador → 409
 *   ZC-13  PATCH /org/zones/:id — TALENTO_HUMANO caller → 200 (in ORG_WRITE_ROLES)
 *
 * MUNICIPIOS:
 *   MC-01  POST /org/municipios — happy path → 201 {id}
 *   MC-02  POST /org/municipios — duplicate (zoneId,name) → 409
 *   MC-03  POST /org/municipios — unknown zoneId → 400
 *   MC-04  POST /org/municipios — GERENCIA caller → 403
 *   MC-05  PATCH /org/municipios/:id — rename happy path → 200 MunicipioResponseDto
 *   MC-06  PATCH /org/municipios/:id — move to different zone → 200
 *   MC-07  PATCH /org/municipios/:id — not found → 404
 *   MC-08  PATCH /org/municipios/:id — (zoneId,name) collision → 409
 *   MC-09  PATCH /org/municipios/:id — new zoneId not found → 400
 *   MC-10  DELETE /org/municipios/:id — happy path (no supervisors) → 200
 *   MC-11  DELETE /org/municipios/:id — not found → 404
 *   MC-12  DELETE /org/municipios/:id — has supervisors → 409
 *
 * Setup strategy:
 *   - Bootstrap AppModule with mock StoragePort (same pattern as operario-management.int-spec.ts)
 *   - Create a SYSTEM_ADMIN + TALENTO_HUMANO + GERENCIA user with DeviceSessions for auth
 *   - Zones/municipios created per-test and cleaned up per-test / afterAll
 *   - Seeded zones (Zona Urabá, Zona Bajo Cauca) are used for collision and dependents tests
 *   - Teardown is FK-safe
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
const TEST_DEVICE = 'zone-muni-crud-test-device';
const TEST_PASSWORD = 'TestPass123!';

function mintToken(claims: {
  sub: string;
  role: string;
  zoneId?: string;
}): string {
  return jwt.sign(
    {
      sub: claims.sub,
      role: claims.role,
      zoneId: claims.zoneId,
      deviceId: TEST_DEVICE,
      mustChangePassword: false,
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

describe('Zone & Municipio CRUD Integration Suite', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Principal ids
  let adminUserId: string;
  let talentoUserId: string;
  let gerenciaUserId: string;

  // Tokens
  let tokenAdmin: string;
  let tokenTalento: string;
  let tokenGerencia: string;

  // Seeded zone ids (for collision/dependents tests)
  let seededZoneUrabaId: string;

  // Cleanup tracking
  const createdUserIds: string[] = [];
  const createdZoneIds: string[] = [];
  const createdMunicipioIds: string[] = [];

  // ─── Setup ───────────────────────────────────────────────────────────────────

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

    // Locate seeded zones
    const zoneUraba = await prisma.zone.findFirst({ where: { name: 'Zona Urabá' } });
    if (!zoneUraba) throw new Error('Seeded zone "Zona Urabá" not found — run seed first');
    seededZoneUrabaId = zoneUraba.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Clean any leftover fixtures from previous failed runs
    const fixtureEmails = [
      'admin-zone-crud-test@futuragest.co',
      'talento-zone-crud-test@futuragest.co',
      'gerencia-zone-crud-test@futuragest.co',
    ];
    const leftover = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    if (leftover.length > 0) {
      const ids = leftover.map((u) => u.id);
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

    const adminUser = await createUser('admin-zone-crud-test@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = adminUser.id;

    const talentoUser = await createUser('talento-zone-crud-test@futuragest.co', 'TALENTO_HUMANO');
    talentoUserId = talentoUser.id;

    const gerenciaUser = await createUser('gerencia-zone-crud-test@futuragest.co', 'GERENCIA');
    gerenciaUserId = gerenciaUser.id;

    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
    tokenTalento = mintToken({ sub: talentoUserId, role: 'TALENTO_HUMANO' });
    tokenGerencia = mintToken({ sub: gerenciaUserId, role: 'GERENCIA' });
  }, 30_000);

  // ─── Teardown ────────────────────────────────────────────────────────────────

  afterAll(async () => {
    // FK-safe: municipios → supervisors (none created in these tests) → zones → users

    // Clean municipios created during tests (tracked)
    if (createdMunicipioIds.length > 0) {
      // Defensively delete supervisors referencing our municipios (shouldn't exist, but safe)
      await prisma.supervisor.deleteMany({ where: { municipioId: { in: createdMunicipioIds } } });
      await prisma.municipio.deleteMany({ where: { id: { in: createdMunicipioIds } } });
    }

    // Clean zones created during tests (tracked)
    if (createdZoneIds.length > 0) {
      await prisma.municipio.deleteMany({ where: { zoneId: { in: createdZoneIds } } });
      await prisma.supervisor.deleteMany({ where: { zoneId: { in: createdZoneIds } } });
      await prisma.zone.deleteMany({ where: { id: { in: createdZoneIds } } });
    }

    // Clean fixture users
    for (const userId of createdUserIds) {
      await prisma.deviceSession.deleteMany({ where: { userId } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }

    await prisma.$disconnect();
    await app.close();
  });

  // Helper: create a zone via API and track it
  async function createZoneViaApi(name: string, token = tokenAdmin): Promise<string> {
    const resp = await request(app.getHttpServer())
      .post('/org/zones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    const id = resp.body.id as string;
    createdZoneIds.push(id);
    return id;
  }

  // Helper: create a municipio via API and track it
  async function createMunicipioViaApi(
    name: string,
    zoneId: string,
    token = tokenAdmin,
  ): Promise<string> {
    const resp = await request(app.getHttpServer())
      .post('/org/municipios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, zoneId })
      .expect(201);
    const id = resp.body.id as string;
    createdMunicipioIds.push(id);
    return id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZONE — CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /org/zones — create zone', () => {
    it('ZC-01 — SYSTEM_ADMIN creates zone → 201 with id', async () => {
      const name = `Test Zone ZC01 ${Date.now()}`;
      const resp = await request(app.getHttpServer())
        .post('/org/zones')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      const id = resp.body.id as string;
      createdZoneIds.push(id);

      const row = await prisma.zone.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row!.name).toBe(name);
    });

    it('ZC-02 — Duplicate zone name → 409', async () => {
      const name = `Dup Zone ZC02 ${Date.now()}`;
      await createZoneViaApi(name);

      await request(app.getHttpServer())
        .post('/org/zones')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name })
        .expect(409);
    });

    it('ZC-03 — GERENCIA caller → 403', async () => {
      await request(app.getHttpServer())
        .post('/org/zones')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .send({ name: `Gerencia Zone ZC03 ${Date.now()}` })
        .expect(403);
    });

    it('ZC-04 — No token → 401', async () => {
      await request(app.getHttpServer())
        .post('/org/zones')
        .send({ name: `No-auth Zone ZC04 ${Date.now()}` })
        .expect(401);
    });

    it('ZC-13 — TALENTO_HUMANO creates zone → 201', async () => {
      const name = `Talento Zone ZC13 ${Date.now()}`;
      const resp = await request(app.getHttpServer())
        .post('/org/zones')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ name })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      createdZoneIds.push(resp.body.id as string);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZONE — UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /org/zones/:id — update zone', () => {
    it('ZC-05 — Rename zone → 200 ZoneResponseDto shape', async () => {
      const zoneId = await createZoneViaApi(`Zone To Rename ZC05 ${Date.now()}`);
      const newName = `Zone Renamed ZC05 ${Date.now()}`;

      const resp = await request(app.getHttpServer())
        .patch(`/org/zones/${zoneId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: newName })
        .expect(200);

      expect(resp.body.id).toBe(zoneId);
      expect(resp.body.name).toBe(newName);
      expect(resp.body).toHaveProperty('createdAt');
      expect(resp.body).toHaveProperty('updatedAt');

      const row = await prisma.zone.findUnique({ where: { id: zoneId } });
      expect(row!.name).toBe(newName);
    });

    it('ZC-06 — Zone not found → 404', async () => {
      await request(app.getHttpServer())
        .patch('/org/zones/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Does Not Matter' })
        .expect(404);
    });

    it('ZC-07 — Name collides with existing zone → 409', async () => {
      const existing = `Zone Existing ZC07 ${Date.now()}`;
      const target = `Zone Target ZC07 ${Date.now()}`;
      await createZoneViaApi(existing);
      const targetId = await createZoneViaApi(target);

      await request(app.getHttpServer())
        .patch(`/org/zones/${targetId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: existing })
        .expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZONE — DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /org/zones/:id — delete zone', () => {
    it('ZC-08 — Delete zone with no dependents → 200', async () => {
      const name = `Zone To Delete ZC08 ${Date.now()}`;
      // Create directly in DB (not via API) so we control it — also test cleanup
      const zone = await prisma.zone.create({ data: { name } });
      // Do NOT add to createdZoneIds (it will be deleted by the endpoint)

      await request(app.getHttpServer())
        .delete(`/org/zones/${zone.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const row = await prisma.zone.findUnique({ where: { id: zone.id } });
      expect(row).toBeNull();
    });

    it('ZC-09 — Zone not found → 404', async () => {
      await request(app.getHttpServer())
        .delete('/org/zones/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
    });

    it('ZC-10 — Zone has municipios → 409', async () => {
      // Zona Urabá always has municipios from the seed
      await request(app.getHttpServer())
        .delete(`/org/zones/${seededZoneUrabaId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(409);
    });

    it('ZC-11 — Zone has supervisors (created inline) → 409', async () => {
      // Create a zone with no municipio but add a supervisor directly
      const zoneName = `Zone With Supervisor ZC11 ${Date.now()}`;
      const zone = await prisma.zone.create({ data: { name: zoneName } });

      // We need a municipio to create a supervisor (FK), create it in the zone
      const municipio = await prisma.municipio.create({
        data: { name: `Muni ZC11 ${Date.now()}`, zoneId: zone.id },
      });

      // We need a User row to create a Supervisor
      const supUser = await prisma.user.create({
        data: {
          email: `sup-zc11-${Date.now()}@futuragest.co`,
          passwordHash: 'dummy-hash',
          role: 'SUPERVISOR',
          mustChangePassword: false,
        },
      });
      const supervisor = await prisma.supervisor.create({
        data: {
          userId: supUser.id,
          municipioId: municipio.id,
          zoneId: zone.id,
          area: 'BARRIDO',
        },
      });

      try {
        await request(app.getHttpServer())
          .delete(`/org/zones/${zone.id}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(409);
      } finally {
        // Cleanup
        await prisma.supervisor.delete({ where: { id: supervisor.id } });
        await prisma.deviceSession.deleteMany({ where: { userId: supUser.id } });
        await prisma.user.delete({ where: { id: supUser.id } });
        await prisma.municipio.delete({ where: { id: municipio.id } });
        await prisma.zone.delete({ where: { id: zone.id } });
      }
    });

    it('ZC-12 — Zone has coordinador → 409', async () => {
      const zoneName = `Zone With Coord ZC12 ${Date.now()}`;
      const zone = await prisma.zone.create({ data: { name: zoneName } });

      // Create a COORDINADOR user and assign them to this zone
      const coordUser = await prisma.user.create({
        data: {
          email: `coord-zc12-${Date.now()}@futuragest.co`,
          passwordHash: 'dummy-hash',
          role: 'COORDINADOR',
          mustChangePassword: false,
          coordinatedZoneId: zone.id,
        },
      });

      try {
        await request(app.getHttpServer())
          .delete(`/org/zones/${zone.id}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(409);
      } finally {
        // Cleanup (clear coordinatedZoneId first to avoid FK issues)
        await prisma.user.update({
          where: { id: coordUser.id },
          data: { coordinatedZoneId: null },
        });
        await prisma.user.delete({ where: { id: coordUser.id } });
        await prisma.zone.delete({ where: { id: zone.id } });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MUNICIPIO — CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /org/municipios — create municipio', () => {
    let testZoneId: string;

    beforeAll(async () => {
      testZoneId = await createZoneViaApi(`MC Create Zone ${Date.now()}`);
    });

    it('MC-01 — SYSTEM_ADMIN creates municipio → 201 with id', async () => {
      const name = `MC01 Muni ${Date.now()}`;
      const resp = await request(app.getHttpServer())
        .post('/org/municipios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name, zoneId: testZoneId })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      const id = resp.body.id as string;
      createdMunicipioIds.push(id);

      const row = await prisma.municipio.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row!.name).toBe(name);
      expect(row!.zoneId).toBe(testZoneId);
    });

    it('MC-02 — Duplicate (zoneId, name) → 409', async () => {
      const name = `MC02 Dup Muni ${Date.now()}`;
      await createMunicipioViaApi(name, testZoneId);

      await request(app.getHttpServer())
        .post('/org/municipios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name, zoneId: testZoneId })
        .expect(409);
    });

    it('MC-02b — Same name in different zone is allowed', async () => {
      const name = `MC02b Same Name ${Date.now()}`;
      const zone2Id = await createZoneViaApi(`MC02b Zone2 ${Date.now()}`);
      await createMunicipioViaApi(name, testZoneId);

      const resp = await request(app.getHttpServer())
        .post('/org/municipios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name, zoneId: zone2Id })
        .expect(201);

      createdMunicipioIds.push(resp.body.id as string);
    });

    it('MC-03 — Unknown zoneId → 400', async () => {
      await request(app.getHttpServer())
        .post('/org/municipios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: `MC03 Muni ${Date.now()}`, zoneId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('MC-04 — GERENCIA caller → 403', async () => {
      await request(app.getHttpServer())
        .post('/org/municipios')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .send({ name: `MC04 Muni ${Date.now()}`, zoneId: testZoneId })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MUNICIPIO — UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /org/municipios/:id — update municipio', () => {
    let patchZoneId: string;
    let patch2ZoneId: string;

    beforeAll(async () => {
      patchZoneId = await createZoneViaApi(`MC Patch Zone ${Date.now()}`);
      patch2ZoneId = await createZoneViaApi(`MC Patch Zone2 ${Date.now()}`);
    });

    it('MC-05 — Rename municipio → 200 MunicipioResponseDto shape', async () => {
      const muniId = await createMunicipioViaApi(`MC05 Original ${Date.now()}`, patchZoneId);
      const newName = `MC05 Renamed ${Date.now()}`;

      const resp = await request(app.getHttpServer())
        .patch(`/org/municipios/${muniId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: newName })
        .expect(200);

      expect(resp.body.id).toBe(muniId);
      expect(resp.body.name).toBe(newName);
      expect(resp.body.zoneId).toBe(patchZoneId);
      expect(resp.body).toHaveProperty('createdAt');
      expect(resp.body).toHaveProperty('updatedAt');

      const row = await prisma.municipio.findUnique({ where: { id: muniId } });
      expect(row!.name).toBe(newName);
    });

    it('MC-06 — Move municipio to different zone → 200', async () => {
      const name = `MC06 Move ${Date.now()}`;
      const muniId = await createMunicipioViaApi(name, patchZoneId);

      const resp = await request(app.getHttpServer())
        .patch(`/org/municipios/${muniId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ zoneId: patch2ZoneId })
        .expect(200);

      expect(resp.body.zoneId).toBe(patch2ZoneId);
      expect(resp.body.name).toBe(name);

      const row = await prisma.municipio.findUnique({ where: { id: muniId } });
      expect(row!.zoneId).toBe(patch2ZoneId);
    });

    it('MC-07 — Municipio not found → 404', async () => {
      await request(app.getHttpServer())
        .patch('/org/municipios/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Does Not Matter' })
        .expect(404);
    });

    it('MC-08 — (zoneId, name) collision → 409', async () => {
      const existingName = `MC08 Existing ${Date.now()}`;
      const targetName = `MC08 Target ${Date.now()}`;
      await createMunicipioViaApi(existingName, patchZoneId);
      const targetId = await createMunicipioViaApi(targetName, patchZoneId);

      await request(app.getHttpServer())
        .patch(`/org/municipios/${targetId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: existingName })
        .expect(409);
    });

    it('MC-09 — New zoneId not found → 400', async () => {
      const muniId = await createMunicipioViaApi(`MC09 Muni ${Date.now()}`, patchZoneId);

      await request(app.getHttpServer())
        .patch(`/org/municipios/${muniId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ zoneId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MUNICIPIO — DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /org/municipios/:id — delete municipio', () => {
    let deleteZoneId: string;

    beforeAll(async () => {
      deleteZoneId = await createZoneViaApi(`MC Delete Zone ${Date.now()}`);
    });

    it('MC-10 — Delete municipio with no supervisors → 200', async () => {
      const name = `MC10 Del Muni ${Date.now()}`;
      // Create directly so it is NOT in createdMunicipioIds (endpoint will delete it)
      const muni = await prisma.municipio.create({ data: { name, zoneId: deleteZoneId } });

      await request(app.getHttpServer())
        .delete(`/org/municipios/${muni.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const row = await prisma.municipio.findUnique({ where: { id: muni.id } });
      expect(row).toBeNull();
    });

    it('MC-11 — Municipio not found → 404', async () => {
      await request(app.getHttpServer())
        .delete('/org/municipios/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
    });

    it('MC-12 — Municipio has supervisors → 409', async () => {
      const name = `MC12 With Sup ${Date.now()}`;
      const muni = await prisma.municipio.create({ data: { name, zoneId: deleteZoneId } });

      const supUser = await prisma.user.create({
        data: {
          email: `sup-mc12-${Date.now()}@futuragest.co`,
          passwordHash: 'dummy-hash',
          role: 'SUPERVISOR',
          mustChangePassword: false,
        },
      });
      const supervisor = await prisma.supervisor.create({
        data: {
          userId: supUser.id,
          municipioId: muni.id,
          zoneId: deleteZoneId,
          area: 'BARRIDO',
        },
      });

      try {
        await request(app.getHttpServer())
          .delete(`/org/municipios/${muni.id}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(409);
      } finally {
        await prisma.supervisor.delete({ where: { id: supervisor.id } });
        await prisma.deviceSession.deleteMany({ where: { userId: supUser.id } });
        await prisma.user.delete({ where: { id: supUser.id } });
        await prisma.municipio.delete({ where: { id: muni.id } });
      }
    });
  });
});
