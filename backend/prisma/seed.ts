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

import { SupervisorArea, HolidayType, SurchargeCategory } from '@prisma/client';
import * as argon2 from 'argon2';
import { createPrismaClient } from '../src/database/prisma-client';
import { HolidayCalculator } from '../src/modules/jornada/domain/holiday-calculator';

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

  // -- 4. Upsert Surcharge Rates (Ley 789/2002, Ley 2466/2025) --
  const rates = [
    { category: SurchargeCategory.RECARGO_NOCTURNO, percentage: 0.35, desde: '2000-01-01T00:00:00Z' },
    { category: SurchargeCategory.HORA_EXTRA_DIURNA, percentage: 0.25, desde: '2000-01-01T00:00:00Z' },
    { category: SurchargeCategory.HORA_EXTRA_NOCTURNA, percentage: 0.75, desde: '2000-01-01T00:00:00Z' },
    // Recargo dominical/festivo escalonado:
    // 80% hasta 30 junio 2026 (Ley 789/2002 Art. 179)
    { category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO, percentage: 0.80, desde: '2000-01-01T00:00:00Z' },
    // 90% desde 1 julio 2026 (Ley 2466/2025)
    { category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO, percentage: 0.90, desde: '2026-07-01T00:00:00Z' },
    // 100% desde 1 julio 2027 (Ley 2466/2025 — segunda etapa)
    { category: SurchargeCategory.RECARGO_DOMINICAL_FESTIVO, percentage: 1.00, desde: '2027-07-01T00:00:00Z' },
  ];

  for (const rate of rates) {
    await prisma.surchargeRate.upsert({
      where: {
        category_vigenteDesde: {
          category: rate.category,
          vigenteDesde: new Date(rate.desde)
        }
      },
      update: { percentage: rate.percentage },
      create: {
        category: rate.category,
        percentage: rate.percentage,
        vigenteDesde: new Date(rate.desde),
        creadoPor: 'SYSTEM'
      }
    });
  }
  console.log('  Surcharge rates seeded (including 2026 July 90% increase).');

  // -- 5. Upsert Jornada Policies (Global) --
  // Ley 2101/2021:
  // - Hasta 2025: 44 horas semanales (8.8h/d)
  // - 16 Julio 2025: nueva jornada base (37.5h/sem, 7.5h/d, 6:00-14:00)
  // - 16 Julio 2026: sin cambio (solo marca hito legal, mismo horario)
  const policies = [
    {
      desde: '2024-01-01T00:00:00Z',
      horasSemanales: 44,
      horasDiarias: 8.8, // 44 / 5 = 8.8
      horaInicio: '07:00',
      horaFin: '17:00',
      diasLaborales: [1,2,3,4,5],
      almuerzoInicio: null,
      almuerzoFin: null,
      toleranciaMin: 5,
    },
    {
      desde: '2025-07-16T00:00:00Z',
      horasSemanales: 37.50,
      horasDiarias: 7.50, // 37.50 / 5 = 7.50 (6:00-14:00 = 8h gross - 0.5h lunch)
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1,2,3,4,5],
      almuerzoInicio: null, // auto at shift midpoint (9:45-10:15)
      almuerzoFin: null,    // auto (almuerzoInicio + 30 min)
      toleranciaMin: 5,
    },
    {
      desde: '2026-07-16T00:00:00Z',
      horasSemanales: 37.50,
      horasDiarias: 7.50,
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1,2,3,4,5],
      almuerzoInicio: null,
      almuerzoFin: null,
      toleranciaMin: 5,
    },
  ];

  // Custom manual upsert for policies:
  for (const p of policies) {
    const exists = await prisma.jornadaPolicy.findFirst({
      where: { operarioId: null, zoneId: null, vigenteDesde: new Date(p.desde) }
    });
    if (!exists) {
      await prisma.jornadaPolicy.create({
        data: {
          horasSemanales: p.horasSemanales,
          horasDiarias: p.horasDiarias,
          horaInicio: p.horaInicio,
          horaFin: p.horaFin,
          diasLaborales: p.diasLaborales,
          almuerzoInicio: p.almuerzoInicio,
          almuerzoFin: p.almuerzoFin,
          toleranciaMin: p.toleranciaMin,
          vigenteDesde: new Date(p.desde)
        }
      });
    } else {
      await prisma.jornadaPolicy.update({
        where: { id: exists.id },
        data: {
          horasSemanales: p.horasSemanales,
          horasDiarias: p.horasDiarias,
          horaInicio: p.horaInicio,
          horaFin: p.horaFin,
          diasLaborales: p.diasLaborales,
          almuerzoInicio: p.almuerzoInicio,
          almuerzoFin: p.almuerzoFin,
          toleranciaMin: p.toleranciaMin,
        }
      });
    }
  }
  console.log('  Jornada policies seeded (6:00-14:00, 7.50h/d, 37.50h/w, lunch auto).');

  // -- 6. Upsert Holidays (2025 and 2026) --
  const yearsToSeed = [2025, 2026];
  for (const year of yearsToSeed) {
    const holidays = HolidayCalculator.generateYear(year);
    for (const holiday of holidays) {
      await prisma.holiday.upsert({
        where: { date: holiday.date },
        update: {},
        create: {
          date: holiday.date,
          name: holiday.name,
          type: holiday.type,
          year: holiday.year
        }
      });
    }
  }
  console.log(`  Holidays seeded for years ${yearsToSeed.join(', ')}.`);

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
