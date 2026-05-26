/**
 * Authoritative seed for FuturaGest.
 *
 * Run: pnpm exec prisma db seed
 * Idempotent: re-running produces the same counts without unique-constraint errors.
 *
 * Authoritative data (as per REQ-3.1, REQ-3.2, REQ-6.1, REQ-6.2):
 * - 2 zones: Zona Urabá, Zona Bajo Cauca
 * - 13 municipios (8 Urabá + 5 Bajo Cauca)
 * - 23 supervisors (16 Urabá + 7 Bajo Cauca)
 * - 1 SYSTEM_ADMIN (admin@futuragest.co, mustChangePassword: true)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend/ so DATABASE_URL is available before Prisma client init
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { SupervisorArea } from '@prisma/client';
import * as argon2 from 'argon2';
import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

// ---------------------------------------------------------------------------
// Authoritative data
// ---------------------------------------------------------------------------

const ZONES = [
  { name: 'Zona Urabá' },
  { name: 'Zona Bajo Cauca' },
] as const;

// Municipios per zone with supervisor counts
// Urabá: Apartadó 7, Bajirá 1, Mutatá 1, Turbo 3, San Pedro de Urabá 1, Necoclí 1,
//        San Juan de Urabá 1, Arboletes 1  → 8 municipios, 16 supervisors
// Bajo Cauca: Caucasia 3, Tarazá 1, Nechí 1, Zaragoza 1, Cáceres 1 → 5 municipios, 7 supervisors
const ZONE_DATA: Array<{
  zoneName: string;
  municipios: Array<{ name: string; supervisorCount: number }>;
}> = [
  {
    zoneName: 'Zona Urabá',
    municipios: [
      { name: 'Apartadó', supervisorCount: 7 },
      { name: 'Bajirá', supervisorCount: 1 },
      { name: 'Mutatá', supervisorCount: 1 },
      { name: 'Turbo', supervisorCount: 3 },
      { name: 'San Pedro de Urabá', supervisorCount: 1 },
      { name: 'Necoclí', supervisorCount: 1 },
      { name: 'San Juan de Urabá', supervisorCount: 1 },
      { name: 'Arboletes', supervisorCount: 1 },
    ],
  },
  {
    zoneName: 'Zona Bajo Cauca',
    municipios: [
      { name: 'Caucasia', supervisorCount: 3 },
      { name: 'Tarazá', supervisorCount: 1 },
      { name: 'Nechí', supervisorCount: 1 },
      { name: 'Zaragoza', supervisorCount: 1 },
      { name: 'Cáceres', supervisorCount: 1 },
    ],
  },
];

// Placeholder password for seeded users — must be changed on first login
const PLACEHOLDER_PASSWORD = 'ChangeMe@2024!';

// Supervisor areas to rotate through for placeholder seeding
const AREAS: SupervisorArea[] = [
  SupervisorArea.BARRIDO,
  SupervisorArea.RECOLECCION,
  SupervisorArea.SUPERNUMERARIO,
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding FuturaGest database...');

  const placeholderHash = await argon2.hash(PLACEHOLDER_PASSWORD);
  const adminHash = await argon2.hash(PLACEHOLDER_PASSWORD);

  // -- 1. Upsert zones --
  const zoneMap = new Map<string, string>(); // name → id

  for (const zone of ZONES) {
    const upserted = await prisma.zone.upsert({
      where: { name: zone.name },
      update: {},
      create: { name: zone.name },
    });
    zoneMap.set(zone.name, upserted.id);
    console.log(`  Zone: ${zone.name} (${upserted.id})`);
  }

  // -- 2. Upsert municipios and supervisors --
  let supervisorIndex = 0;

  for (const zoneData of ZONE_DATA) {
    const zoneId = zoneMap.get(zoneData.zoneName)!;

    for (const municipioData of zoneData.municipios) {
      // Upsert municipio
      const municipio = await prisma.municipio.upsert({
        where: { zoneId_name: { zoneId, name: municipioData.name } },
        update: {},
        create: { name: municipioData.name, zoneId },
      });
      console.log(`    Municipio: ${municipioData.name} (${municipio.id})`);

      // Upsert supervisors for this municipio
      for (let i = 0; i < municipioData.supervisorCount; i++) {
        const idx = supervisorIndex + i;
        const email = `supervisor-${idx + 1}@futuragest.co`;
        const area = AREAS[idx % AREAS.length];

        // Upsert user for supervisor
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            passwordHash: placeholderHash,
            role: 'SUPERVISOR',
            mustChangePassword: true,
          },
        });

        // Upsert supervisor (unique on userId)
        await prisma.supervisor.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            municipioId: municipio.id,
            zoneId,
            area,
          },
        });
      }

      supervisorIndex += municipioData.supervisorCount;
    }
  }

  // -- 3. Upsert SYSTEM_ADMIN --
  await prisma.user.upsert({
    where: { email: 'admin@futuragest.co' },
    update: {},
    create: {
      email: 'admin@futuragest.co',
      passwordHash: adminHash,
      role: 'SYSTEM_ADMIN',
      mustChangePassword: true,
    },
  });
  console.log('  SYSTEM_ADMIN: admin@futuragest.co (mustChangePassword: true)');

  // -- Summary --
  const zoneCount = await prisma.zone.count();
  const municipioCount = await prisma.municipio.count();
  const supervisorCount = await prisma.supervisor.count();
  const adminCount = await prisma.user.count({ where: { role: 'SYSTEM_ADMIN' } });

  console.log('\nSeed complete:');
  console.log(`  Zones:       ${zoneCount}`);
  console.log(`  Municipios:  ${municipioCount}`);
  console.log(`  Supervisors: ${supervisorCount}`);
  console.log(`  Admins:      ${adminCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
