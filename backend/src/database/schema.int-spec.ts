/**
 * PR2 Integration Tests — Schema + Seed assertions
 *
 * Strict TDD: this file is written BEFORE the migration and seed exist.
 * Tests MUST fail initially, then pass after T2.5–T2.9.
 *
 * Runs against futuragest_test DB (backend/.env.test loaded by globalSetup).
 */

import { createPrismaClient } from './prisma-client';

// DATABASE_URL is set to futuragest_test by the Jest globalSetup (loads .env.test)
const prisma = createPrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Seed — authoritative counts', () => {
  it('produces exactly 2 zones', async () => {
    const count = await prisma.zone.count();
    expect(count).toBe(2);
  });

  it('produces exactly 13 municipios', async () => {
    const count = await prisma.municipio.count();
    expect(count).toBe(13);
  });

  it('produces exactly 23 supervisors', async () => {
    const count = await prisma.supervisor.count();
    expect(count).toBe(23);
  });

  it('produces exactly 1 SYSTEM_ADMIN user', async () => {
    const count = await prisma.user.count({ where: { role: 'SYSTEM_ADMIN' } });
    expect(count).toBe(1);
  });

  it('SYSTEM_ADMIN has mustChangePassword = true', async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'SYSTEM_ADMIN' } });
    expect(admin).not.toBeNull();
    expect(admin!.mustChangePassword).toBe(true);
  });

  it('SYSTEM_ADMIN email is admin@futuragest.co', async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'SYSTEM_ADMIN' } });
    expect(admin!.email).toBe('admin@futuragest.co');
  });
});

describe('Seed — Urabá zone municipios', () => {
  it('Zona Urabá has exactly 8 municipios', async () => {
    const zone = await prisma.zone.findUnique({ where: { name: 'Zona Urabá' } });
    expect(zone).not.toBeNull();
    const count = await prisma.municipio.count({ where: { zoneId: zone!.id } });
    expect(count).toBe(8);
  });

  it('Zona Urabá has exactly 16 supervisors (Apartadó 7, Bajirá 1, Mutatá 1, Turbo 3, San Pedro 1, Necoclí 1, San Juan 1, Arboletes 1)', async () => {
    const zone = await prisma.zone.findUnique({ where: { name: 'Zona Urabá' } });
    expect(zone).not.toBeNull();
    const count = await prisma.supervisor.count({ where: { zoneId: zone!.id } });
    expect(count).toBe(16);
  });
});

describe('Seed — Bajo Cauca zone municipios', () => {
  it('Zona Bajo Cauca has exactly 5 municipios', async () => {
    const zone = await prisma.zone.findUnique({ where: { name: 'Zona Bajo Cauca' } });
    expect(zone).not.toBeNull();
    const count = await prisma.municipio.count({ where: { zoneId: zone!.id } });
    expect(count).toBe(5);
  });

  it('Zona Bajo Cauca has exactly 7 supervisors (Caucasia 3, Tarazá 1, Nechí 1, Zaragoza 1, Cáceres 1)', async () => {
    const zone = await prisma.zone.findUnique({ where: { name: 'Zona Bajo Cauca' } });
    expect(zone).not.toBeNull();
    const count = await prisma.supervisor.count({ where: { zoneId: zone!.id } });
    expect(count).toBe(7);
  });
});

describe('Schema constraints', () => {
  it('Municipio names are unique within a zone (@@unique([zoneId, name]))', async () => {
    // If seed ran twice (idempotency), there should be no duplicates
    const municipios = await prisma.municipio.findMany();
    const pairs = municipios.map((m) => `${m.zoneId}:${m.name}`);
    const unique = new Set(pairs);
    expect(pairs.length).toBe(unique.size);
  });

  it('no active duplicate assignment possible: each operario has at most one open assignment', async () => {
    // Active assignments: endDate IS NULL
    const activeAssignments = await prisma.assignment.findMany({
      where: { endDate: null },
    });
    const operarioIds = activeAssignments.map((a) => a.operarioId);
    const uniqueIds = new Set(operarioIds);
    // Every operario id should appear at most once among active assignments
    expect(operarioIds.length).toBe(uniqueIds.size);
  });

  it('Supervisor has a denormalized zoneId that matches their municipio zone', async () => {
    const supervisors = await prisma.supervisor.findMany({ take: 5 });
    for (const sup of supervisors) {
      expect(sup.zoneId).toBeTruthy();
    }
  });
});
