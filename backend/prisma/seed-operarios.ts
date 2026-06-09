/**
 * Dev-only seed: 3 test operarios per supervisor for manual end-to-end testing.
 *
 * Run: pnpm exec tsx prisma/seed-operarios.ts
 * Idempotent: deterministic documento per (supervisor, slot) → re-running upserts
 * in place without creating duplicates.
 *
 * Each operario is assigned to a supervisor so it appears in that supervisor's
 * scope-filtered GET /iam/operarios list. SYSTEM_ADMIN / GERENCIA / TALENTO_HUMANO
 * see all of them (global scope).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

const OPERARIOS_PER_SUPERVISOR = 3;
const DOCUMENTO_BASE = 1030000001;

// Name pools — cycled by global index to give each operario a plausible name.
const FIRST_NAMES = [
  'Carlos', 'María', 'Jhon', 'Luz', 'Andrés', 'Diana', 'Wilson', 'Yuliana',
  'Édgar', 'Paola', 'Hernán', 'Sandra', 'Óscar', 'Marcela', 'Fredy', 'Liliana',
];
const LAST_NAMES = [
  'Restrepo', 'Gómez', 'Velásquez', 'Mosquera', 'Córdoba', 'Higuita', 'Palacios',
  'Cuesta', 'Rentería', 'Asprilla', 'Murillo', 'Borja', 'Perea', 'Lozano',
  'Mena', 'Valencia',
];

async function main() {
  // Old ad-hoc operarios from the first run (single-supervisor seed). Remove so
  // counts stay exactly 3 per supervisor. Safe: no attendances reference them yet.
  await prisma.operario.deleteMany({
    where: { documento: { in: ['1036987001', '1036987002', '1036987003'] } },
  });

  // All supervisors, with their user email for logging. Stable order by createdAt.
  const supervisors = await prisma.supervisor.findMany({
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { email: true } } },
  });

  if (supervisors.length === 0) {
    throw new Error('No supervisors found. Did the main seed run?');
  }

  console.log(`Seeding ${OPERARIOS_PER_SUPERVISOR} operarios for each of ${supervisors.length} supervisors...\n`);

  let globalIndex = 0;
  for (const supervisor of supervisors) {
    const email = supervisor.user?.email ?? supervisor.id;
    for (let j = 0; j < OPERARIOS_PER_SUPERVISOR; j++) {
      const documento = String(DOCUMENTO_BASE + globalIndex);
      const fullName =
        `${FIRST_NAMES[globalIndex % FIRST_NAMES.length]} ` +
        `${LAST_NAMES[globalIndex % LAST_NAMES.length]}`;

      await prisma.operario.upsert({
        where: { documento },
        update: { fullName, supervisorId: supervisor.id, deactivatedAt: null },
        create: { fullName, documento, supervisorId: supervisor.id },
      });
      globalIndex++;
    }
    console.log(`  ${email}: ${OPERARIOS_PER_SUPERVISOR} operarios`);
  }

  const total = await prisma.operario.count({ where: { deactivatedAt: null } });
  console.log(`\nTotal active operarios: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
