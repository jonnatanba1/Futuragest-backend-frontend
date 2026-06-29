/**
 * T-80 — Org management integration suite (WU-8 FINAL GATE).
 *
 * Covers Deliverables D1–D4 from the org-structure spec.
 *
 * D1 — Role-scoped Zone/Municipio READ endpoints
 *   Scenario 1.1: GLOBAL_ROLES see all zones (>= 2 seeded zones)
 *   Scenario 1.2: COORDINADOR sees only their zone
 *   Scenario 1.3: COORDINADOR sees only their zone's municipios (Zona Urabá → 8)
 *   Scenario 1.4: GLOBAL_ROLES see all 13 seeded municipios
 *   Scenario 1.5: SUPERVISOR → 403 (no org-level read permission)
 *   Scenario 1.8: COORDINADOR with missing zoneId → empty list (fail-closed)
 *   Scenario 1.9: COORDINADOR cannot see other zone's municipios
 *
 * D2 — Assign/Reassign COORDINADOR to a Zone
 *   Scenario 2.1: Fresh assignment success (SYSTEM_ADMIN)
 *   Scenario 2.2: Reassignment — previous holder cleared, @unique not violated
 *   Scenario 2.4: GERENCIA caller → 403
 *   Scenario 2.5: Non-COORDINADOR target user → 400
 *   Scenario 2.6: Non-existent zone → 404
 *   Scenario 2.8: TALENTO_HUMANO caller successfully assigns
 *   Scenario 2.9: SUPERVISOR caller → 403
 *   Scenario 2.10: COORDINADOR caller → 403
 *
 * D3 — Management-User Provisioning (incl. privilege-escalation)
 *   Scenario 3.1: SYSTEM_ADMIN → GERENCIA (201, mustChangePassword=true)
 *   Scenario 3.2: SYSTEM_ADMIN → LIDER_OPERATIVO (201)
 *   Scenario 3.3: blocked role SUPERVISOR → 400
 *   Scenario 3.5: duplicate email → 409
 *   Scenario 3.6: route-level GERENCIA caller → 403
 *   Scenario 3.9: TALENTO_HUMANO → TALENTO_HUMANO (201)
 *   Scenario 3.10: TALENTO_HUMANO → LIDER_OPERATIVO (201)
 *   Scenario 3.11: TALENTO_HUMANO → GERENCIA → 403 (MANDATORY: proves request-scoped DI + escalation guard)
 *   Scenario 3.12: SYSTEM_ADMIN provisions all three management roles
 *
 * D4 — ScopedMunicipioRepository coverage via /org/municipios endpoint
 *   Scenario 4.1: COORDINADOR municipio read uses ScopedMunicipioRepository (own zone only)
 *   Scenario 4.2: GLOBAL_ROLES receive all municipios (pass-through)
 *   Scenario 4.3: Unknown role is denied (fail-closed)
 *
 * JWT minting: uses the same mintToken() pattern from scope-isolation.int-spec.ts
 * (dev JWT_SECRET fallback; tokens bypass the login endpoint to avoid argon2 roundtrips
 * per fixture user). Device sessions are created for all principals.
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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEV_JWT_SECRET = 'futuragest-dev-secret-do-not-use-in-production';
const TEST_DEVICE = 'org-mgmt-test-device';
const TEST_PASSWORD = 'TestPass123!';

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
      deviceId: claims.deviceId ?? TEST_DEVICE,
      mustChangePassword: claims.mustChangePassword ?? false,
    },
    DEV_JWT_SECRET,
    { expiresIn: '15m' },
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Org Management Integration Suite (D1–D4)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // ── Fixture ids ─────────────────────────────────────────────────────────────
  let zoneUrabaId: string;
  let zoneBajoCaucaId: string;

  // Users for read scenarios
  let adminUserId: string;
  let gerentUserId: string;
  let talentoUserId: string;
  let liderUserId: string;
  let coordUrabaUserId: string;
  let supUserId: string;

  // Tokens
  let tokenAdmin: string;
  let tokenGerencia: string;
  let tokenTalento: string;
  let tokenLider: string;
  let tokenCoordUraba: string;
  let tokenCoordNone: string;   // COORDINADOR with no zoneId claim
  let tokenSupervisor: string;
  let tokenGhost: string;

  // Cleanup tracking
  const createdUsers: string[] = [];
  // ── Setup ───────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = createPrismaClient();

    // Resolve seeded zones
    const zoneUraba = await prisma.zone.findFirst({ where: { name: 'Zona Urabá' } });
    const zoneBajoCauca = await prisma.zone.findFirst({ where: { name: 'Zona Bajo Cauca' } });
    if (!zoneUraba || !zoneBajoCauca) {
      throw new Error('Seeded zones not found — run globalSetup first');
    }
    zoneUrabaId = zoneUraba.id;
    zoneBajoCaucaId = zoneBajoCauca.id;

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    // Delete any leftover fixture users from a previous run (idempotent setup)
    const fixtureEmails = [
      'admin-orgtest@futuragest.co',
      'gerencia-orgtest@futuragest.co',
      'talento-orgtest@futuragest.co',
      'lider-orgtest@futuragest.co',
      'coord-uraba-orgtest@futuragest.co',
      'coord-nozone-orgtest@futuragest.co',
      'sup-orgtest@futuragest.co',
      'coord-bajocauca-orgtest@futuragest.co',
      'fresh-coord-assign@futuragest.co',
      'another-coord-assign@futuragest.co',
    ];
    const leftover = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    if (leftover.length > 0) {
      const leftoverIds = leftover.map((u) => u.id);
      await prisma.deviceSession.deleteMany({ where: { userId: { in: leftoverIds } } });
      await prisma.user.deleteMany({ where: { id: { in: leftoverIds } } });
    }

    async function createUser(email: string, role: string, coordinatedZoneId?: string) {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: role as Role,
          mustChangePassword: false,
          ...(coordinatedZoneId ? { coordinatedZoneId } : {}),
        },
      });
      createdUsers.push(user.id);
      // Create device session for JWT-bound routes
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

    const admin = await createUser('admin-orgtest@futuragest.co', 'SYSTEM_ADMIN');
    adminUserId = admin.id;

    const gerent = await createUser('gerencia-orgtest@futuragest.co', 'GERENCIA');
    gerentUserId = gerent.id;

    const talento = await createUser('talento-orgtest@futuragest.co', 'TALENTO_HUMANO');
    talentoUserId = talento.id;

    const lider = await createUser('lider-orgtest@futuragest.co', 'LIDER_OPERATIVO');
    liderUserId = lider.id;

    // Note: coordinatedZoneId is NOT set in DB for fixture users — the scope filter
    // uses the JWT zoneId claim (not the DB column) for row filtering. Setting it in
    // the DB would cause @unique constraint conflicts when multiple test suites run
    // concurrently. The JWT token carries the zone claim instead.
    const coordUraba = await createUser('coord-uraba-orgtest@futuragest.co', 'COORDINADOR');
    coordUrabaUserId = coordUraba.id;

    // COORDINADOR with no zone (for fail-closed test)
    const coordNoZone = await createUser('coord-nozone-orgtest@futuragest.co', 'COORDINADOR');

    const sup = await createUser('sup-orgtest@futuragest.co', 'SUPERVISOR');
    supUserId = sup.id;

    // COORDINADOR for Bajo Cauca (DB coordinatedZoneId not set — zone in JWT only)
    await createUser('coord-bajocauca-orgtest@futuragest.co', 'COORDINADOR');

    // Mint tokens
    tokenAdmin = mintToken({ sub: adminUserId, role: 'SYSTEM_ADMIN' });
    tokenGerencia = mintToken({ sub: gerentUserId, role: 'GERENCIA' });
    tokenTalento = mintToken({ sub: talentoUserId, role: 'TALENTO_HUMANO' });
    tokenLider = mintToken({ sub: liderUserId, role: 'LIDER_OPERATIVO' });
    tokenCoordUraba = mintToken({ sub: coordUrabaUserId, role: 'COORDINADOR', zoneId: zoneUrabaId });
    tokenCoordNone = mintToken({ sub: coordNoZone.id, role: 'COORDINADOR' /* no zoneId */ });
    tokenSupervisor = mintToken({ sub: supUserId, role: 'SUPERVISOR' });
    tokenGhost = mintToken({ sub: adminUserId, role: 'GHOST_ROLE' });
  }, 60_000);

  afterAll(async () => {
    // Clean up provisioned users created during D3 tests (email pattern)
    const provisionedEmails = [
      'gerencia-provision-1@futuragest.co',
      'lider-provision-1@futuragest.co',
      'sup-blocked@futuragest.co',
      'dup-email-test@futuragest.co',
      'talento-provision-2@futuragest.co',
      'lider-provision-2@futuragest.co',
      'dup-email-test@futuragest.co',
    ];
    await prisma.user.deleteMany({ where: { email: { in: provisionedEmails } } });

    // Also clean up any users created with dynamic email patterns in D3 describe blocks
    // (matched by prefix to avoid false positives)
    await prisma.user.deleteMany({
      where: { email: { contains: '-provision-' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '-allthree-' } },
    });

    // Clean up the fixture users (FK-safe: device sessions first)
    for (const userId of createdUsers) {
      await prisma.deviceSession.deleteMany({ where: { userId } });
    }
    if (createdUsers.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }

    await prisma.$disconnect();
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D1 — Zone and Municipio READ endpoints
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D1 — Role-scoped Zone reads (GET /org/zones)', () => {
    it('Scenario 1.1 — SYSTEM_ADMIN sees all zones (>= 2)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const zones = resp.body as Array<{ id: string; name: string }>;
      expect(Array.isArray(zones)).toBe(true);
      expect(zones.length).toBeGreaterThanOrEqual(2);
      const names = zones.map((z) => z.name);
      expect(names).toContain('Zona Urabá');
      expect(names).toContain('Zona Bajo Cauca');
    });

    it('Scenario 1.1 — GERENCIA sees all zones', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .expect(200);

      const zones = resp.body as Array<{ id: string }>;
      expect(zones.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario 1.1 — LIDER_OPERATIVO sees all zones (GLOBAL_ROLES includes LIDER_OPERATIVO)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenLider}`)
        .expect(200);

      const zones = resp.body as Array<{ id: string }>;
      expect(zones.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario 1.2 — COORDINADOR sees only their zone', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenCoordUraba}`)
        .expect(200);

      const zones = resp.body as Array<{ id: string; name: string }>;
      expect(zones).toHaveLength(1);
      expect(zones[0].name).toBe('Zona Urabá');
      expect(zones[0].id).toBe(zoneUrabaId);
    });

    it('Scenario 1.5 — SUPERVISOR is forbidden (403)', async () => {
      await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenSupervisor}`)
        .expect(403);
    });

    it('Scenario 1.8 — COORDINADOR with missing zoneId returns empty list (fail-closed)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenCoordNone}`)
        .expect(200);

      const zones = resp.body as Array<unknown>;
      expect(zones).toHaveLength(0);
    });

    it('Scenario D4.3 — Unknown role is denied (fail-closed)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/zones')
        .set('Authorization', `Bearer ${tokenGhost}`);

      // Either 403 (RolesGuard rejects unknown role) or 200 empty (scope filter denies)
      expect([200, 403]).toContain(resp.status);
      if (resp.status === 200) {
        expect((resp.body as Array<unknown>)).toHaveLength(0);
      }
    });

    it('401 when no token', async () => {
      await request(app.getHttpServer())
        .get('/org/zones')
        .expect(401);
    });
  });

  describe('D1 + D4 — Role-scoped Municipio reads (GET /org/municipios)', () => {
    it('Scenario 1.4 — SYSTEM_ADMIN sees all 13 municipios', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/municipios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const municipios = resp.body as Array<{ id: string }>;
      expect(municipios.length).toBeGreaterThanOrEqual(13);
    });

    it('Scenario 1.3 + 4.1 — COORDINADOR(Urabá) sees exactly 8 Urabá municipios', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/municipios')
        .set('Authorization', `Bearer ${tokenCoordUraba}`)
        .expect(200);

      const municipios = resp.body as Array<{ id: string; zoneId: string }>;
      expect(municipios).toHaveLength(8);
      for (const m of municipios) {
        expect(m.zoneId).toBe(zoneUrabaId);
      }
    });

    it('Scenario 1.9 — COORDINADOR(Urabá) does NOT see Bajo Cauca municipios', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/municipios')
        .set('Authorization', `Bearer ${tokenCoordUraba}`)
        .expect(200);

      const municipios = resp.body as Array<{ id: string; zoneId: string }>;
      for (const m of municipios) {
        expect(m.zoneId).not.toBe(zoneBajoCaucaId);
      }
    });

    it('Scenario 4.2 — GERENCIA sees all 13 municipios (pass-through)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/municipios')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .expect(200);

      const municipios = resp.body as Array<{ id: string }>;
      expect(municipios.length).toBeGreaterThanOrEqual(13);
    });

    it('Scenario 1.5 — SUPERVISOR is forbidden on /org/municipios (403)', async () => {
      await request(app.getHttpServer())
        .get('/org/municipios')
        .set('Authorization', `Bearer ${tokenSupervisor}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D2 — Assign / Reassign COORDINADOR to a Zone
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D2 — Assign COORDINADOR to zone (POST /org/coordinadores/assign)', () => {
    // Create fresh COORDINADOR users for assignment tests to avoid state pollution
    let freshCoordId: string;
    let anotherCoordId: string;

    beforeAll(async () => {
      const passwordHash = await argon2.hash(TEST_PASSWORD);

      // Users were already cleaned up in the outer beforeAll — just create them
      const freshCoord = await prisma.user.create({
        data: {
          email: 'fresh-coord-assign@futuragest.co',
          passwordHash,
          role: 'COORDINADOR',
          mustChangePassword: false,
        },
      });
      freshCoordId = freshCoord.id;
      createdUsers.push(freshCoordId);

      const anotherCoord = await prisma.user.create({
        data: {
          email: 'another-coord-assign@futuragest.co',
          passwordHash,
          role: 'COORDINADOR',
          mustChangePassword: false,
        },
      });
      anotherCoordId = anotherCoord.id;
      createdUsers.push(anotherCoordId);
    });

    // Reset fresh coordinator zone assignment before each relevant test
    beforeEach(async () => {
      // Clear coordinatedZoneId on fresh coordinators to avoid test pollution
      await prisma.user.updateMany({
        where: { id: { in: [freshCoordId, anotherCoordId] } },
        data: { coordinatedZoneId: null },
      });
    });

    it('Scenario 2.1 — SYSTEM_ADMIN fresh assignment (zone has no coordinator)', async () => {
      // Ensure zone Bajo Cauca has no coordinator set to freshCoordId
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ userId: freshCoordId, zoneId: zoneBajoCaucaId })
        .expect(200);

      // Verify DB state
      const user = await prisma.user.findUnique({ where: { id: freshCoordId } });
      expect(user?.coordinatedZoneId).toBe(zoneBajoCaucaId);

      // Restore state
      await prisma.user.update({ where: { id: freshCoordId }, data: { coordinatedZoneId: null } });
    });

    it('Scenario 2.2 — Reassignment: previous holder cleared, @unique preserved', async () => {
      // Assign fresh coord to Bajo Cauca first
      await prisma.user.update({
        where: { id: freshCoordId },
        data: { coordinatedZoneId: zoneBajoCaucaId },
      });
      // Also ensure no other user holds zoneBajoCaucaId (except freshCoordId)
      await prisma.user.updateMany({
        where: { coordinatedZoneId: zoneBajoCaucaId, id: { not: freshCoordId } },
        data: { coordinatedZoneId: null },
      });

      // Reassign zone to anotherCoord
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ userId: anotherCoordId, zoneId: zoneBajoCaucaId })
        .expect(200);

      // freshCoord should now have null coordinatedZoneId
      const oldCoord = await prisma.user.findUnique({ where: { id: freshCoordId } });
      expect(oldCoord?.coordinatedZoneId).toBeNull();

      // anotherCoord should have the zone
      const newCoord = await prisma.user.findUnique({ where: { id: anotherCoordId } });
      expect(newCoord?.coordinatedZoneId).toBe(zoneBajoCaucaId);

      // No @unique violation: only ONE user has this coordinatedZoneId
      const holders = await prisma.user.count({
        where: { coordinatedZoneId: zoneBajoCaucaId },
      });
      expect(holders).toBe(1);

      // Restore state
      await prisma.user.updateMany({
        where: { id: { in: [freshCoordId, anotherCoordId] } },
        data: { coordinatedZoneId: null },
      });
    });

    it('Scenario 2.4 — GERENCIA caller → 403', async () => {
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .send({ userId: freshCoordId, zoneId: zoneUrabaId })
        .expect(403);
    });

    it('Scenario 2.5 — Non-COORDINADOR target (SUPERVISOR) → 400', async () => {
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ userId: supUserId, zoneId: zoneUrabaId })
        .expect(400);
    });

    it('Scenario 2.6 — Non-existent zone → 404', async () => {
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ userId: freshCoordId, zoneId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('Scenario 2.8 — TALENTO_HUMANO caller successfully assigns', async () => {
      // Ensure zone has no current holder for freshCoordId
      await prisma.user.updateMany({
        where: { coordinatedZoneId: zoneBajoCaucaId },
        data: { coordinatedZoneId: null },
      });

      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ userId: freshCoordId, zoneId: zoneBajoCaucaId })
        .expect(200);

      const user = await prisma.user.findUnique({ where: { id: freshCoordId } });
      expect(user?.coordinatedZoneId).toBe(zoneBajoCaucaId);

      // Restore state
      await prisma.user.update({ where: { id: freshCoordId }, data: { coordinatedZoneId: null } });
    });

    it('Scenario 2.9 — SUPERVISOR caller → 403', async () => {
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenSupervisor}`)
        .send({ userId: freshCoordId, zoneId: zoneUrabaId })
        .expect(403);
    });

    it('Scenario 2.10 — COORDINADOR caller → 403', async () => {
      await request(app.getHttpServer())
        .post('/org/coordinadores/assign')
        .set('Authorization', `Bearer ${tokenCoordUraba}`)
        .send({ userId: freshCoordId, zoneId: zoneUrabaId })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D3 — Management-User Provisioning (incl. privilege-escalation guard)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D3 — Provision management user (POST /org/users)', () => {
    it('Scenario 3.1 — SYSTEM_ADMIN provisions GERENCIA (201, mustChangePassword=true)', async () => {
      const email = 'gerencia-provision-1@futuragest.co';
      const resp = await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email, password: 'Temp1234!', role: 'GERENCIA' })
        .expect(201);

      expect(resp.body).toHaveProperty('id');

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      expect(user?.role).toBe('GERENCIA');
      expect(user?.mustChangePassword).toBe(true);
      expect(user?.coordinatedZoneId).toBeNull();
      // Password must be argon2-hashed (not plaintext)
      expect(user?.passwordHash).toMatch(/^\$argon2/);
      expect(user?.passwordHash).not.toBe('Temp1234!');

      // Cleanup
      await prisma.user.delete({ where: { email } });
    });

    it('Scenario 3.2 — SYSTEM_ADMIN provisions LIDER_OPERATIVO (201)', async () => {
      const email = 'lider-provision-1@futuragest.co';
      const resp = await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email, password: 'Temp1234!', role: 'LIDER_OPERATIVO' })
        .expect(201);

      expect(resp.body).toHaveProperty('id');

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.mustChangePassword).toBe(true);
      expect(user?.coordinatedZoneId).toBeNull();

      await prisma.user.delete({ where: { email } });
    });

    it('Scenario 3.3 — blocked role SUPERVISOR → 400', async () => {
      await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email: 'sup-blocked@futuragest.co', password: 'Temp1234!', role: 'SUPERVISOR' })
        .expect(400);

      // No user created
      const count = await prisma.user.count({ where: { email: 'sup-blocked@futuragest.co' } });
      expect(count).toBe(0);
    });

    it('Scenario 3.5 — duplicate email → 409', async () => {
      const email = 'dup-email-test@futuragest.co';

      // Create first user
      await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email, password: 'Temp1234!', role: 'GERENCIA' })
        .expect(201);

      // Attempt duplicate
      await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email, password: 'Temp1234!', role: 'TALENTO_HUMANO' })
        .expect(409);

      // Exactly one row remains
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);

      // Cleanup
      await prisma.user.delete({ where: { email } });
    });

    it('Scenario 3.6 — GERENCIA caller → 403 (route-level guard)', async () => {
      await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenGerencia}`)
        .send({ email: 'blocked@futuragest.co', password: 'Temp1234!', role: 'LIDER_OPERATIVO' })
        .expect(403);

      // No user created
      const count = await prisma.user.count({ where: { email: 'blocked@futuragest.co' } });
      expect(count).toBe(0);
    });

    it('Scenario 3.9 — TALENTO_HUMANO provisions TALENTO_HUMANO (201)', async () => {
      const email = 'talento-provision-2@futuragest.co';
      const resp = await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ email, password: 'Temp1234!', role: 'TALENTO_HUMANO' })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.role).toBe('TALENTO_HUMANO');
      expect(user?.mustChangePassword).toBe(true);

      await prisma.user.delete({ where: { email } });
    });

    it('Scenario 3.10 — TALENTO_HUMANO provisions LIDER_OPERATIVO (201)', async () => {
      const email = 'lider-provision-2@futuragest.co';
      const resp = await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ email, password: 'Temp1234!', role: 'LIDER_OPERATIVO' })
        .expect(201);

      expect(resp.body).toHaveProperty('id');
      await prisma.user.delete({ where: { email } });
    });

    /**
     * Scenario 3.11 — MANDATORY GATE
     *
     * TALENTO_HUMANO attempting to provision GERENCIA MUST return 403.
     * This is the CRITICAL end-to-end proof that:
     * 1. ProvisionManagementUserUseCase is REQUEST-SCOPED (not singleton).
     * 2. ScopeContextHolder.current() returns the per-request actor role (TALENTO_HUMANO).
     * 3. The privilege-escalation guard compares actor rank (2) vs target rank (3) → ForbiddenException.
     * 4. OrgController maps ForbiddenException → HTTP 403.
     *
     * If this test FAILS with 201, it means the use-case was registered as a singleton
     * (empty ScopeContext, actor role undefined → bypasses the rank check).
     */
    it('Scenario 3.11 — TALENTO_HUMANO → GERENCIA → 403 (privilege-escalation guard, request-scoped DI)', async () => {
      const email = 'gerencia-escalation-blocked@futuragest.co';

      await request(app.getHttpServer())
        .post('/org/users')
        .set('Authorization', `Bearer ${tokenTalento}`)
        .send({ email, password: 'Temp1234!', role: 'GERENCIA' })
        .expect(403);

      // No user should have been created
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(0);
    });

    it('Scenario 3.12 — SYSTEM_ADMIN provisions all three management roles', async () => {
      const emails = {
        gerencia: 'gerencia-allthree-1@futuragest.co',
        talento: 'talento-allthree-1@futuragest.co',
        lider: 'lider-allthree-1@futuragest.co',
      };

      for (const [role, email] of [
        ['GERENCIA', emails.gerencia],
        ['TALENTO_HUMANO', emails.talento],
        ['LIDER_OPERATIVO', emails.lider],
      ] as [string, string][]) {
        await request(app.getHttpServer())
          .post('/org/users')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ email, password: 'Temp1234!', role })
          .expect(201);
      }

      // Verify all three were created
      for (const email of Object.values(emails)) {
        const count = await prisma.user.count({ where: { email } });
        expect(count).toBe(1);
      }

      // Cleanup
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
    });
  });

  describe('D5 — GET /org/users (admin user listing)', () => {
    it('SYSTEM_ADMIN lists users without exposing passwordHash', async () => {
      const resp = await request(app.getHttpServer())
        .get('/org/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const users = resp.body as Array<Record<string, unknown>>;
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      for (const u of users) {
        expect(u).toHaveProperty('email');
        expect(u).toHaveProperty('role');
        expect(u).not.toHaveProperty('passwordHash');
      }
    });

    it('SUPERVISOR is forbidden (403)', async () => {
      await request(app.getHttpServer())
        .get('/org/users')
        .set('Authorization', `Bearer ${tokenSupervisor}`)
        .expect(403);
    });
  });
});
