/**
 * Sync script to ensure all existing Municipios have a corresponding InventoryLocation (MUNICIPAL_WAREHOUSE)
 * and all existing Supervisors are assigned to the location of their assigned Municipio.
 *
 * Usage: pnpm exec ts-node prisma/sync-municipal-locations.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

async function main() {
  console.log('Synchronizing municipal inventory locations and supervisor assignments...');

  const municipios = await prisma.municipio.findMany({
    include: {
      supervisors: {
        include: {
          user: true,
        },
      },
    },
  });

  let createdLocations = 0;
  let createdAssignments = 0;

  for (const municipio of municipios) {
    const locationCode = `MW-${municipio.name.toUpperCase().replace(/\s+/g, '_')}`;

    const location = await prisma.inventoryLocation.upsert({
      where: { code: locationCode },
      update: {
        name: `Bodega ${municipio.name}`,
        zoneId: municipio.zoneId,
        municipioId: municipio.id,
      },
      create: {
        code: locationCode,
        name: `Bodega ${municipio.name}`,
        type: 'MUNICIPAL_WAREHOUSE',
        zoneId: municipio.zoneId,
        municipioId: municipio.id,
        active: true,
      },
    });

    createdLocations++;
    console.log(`Location: ${location.name} (${location.code})`);

    const validFrom = new Date('2026-01-01T00:00:00Z');

    for (const supervisor of municipio.supervisors) {
      const existingAssignment = await prisma.inventoryLocationAssignment.findFirst({
        where: {
          locationId: location.id,
          userId: supervisor.userId,
        },
      });

      if (!existingAssignment) {
        await prisma.inventoryLocationAssignment.create({
          data: {
            locationId: location.id,
            userId: supervisor.userId,
            supervisorId: supervisor.id,
            role: 'SUPERVISOR',
            validFrom,
          },
        });
        createdAssignments++;
        console.log(`  Assigned supervisor: ${supervisor.user.email} -> ${location.name}`);
      }
    }
  }

  console.log(`\nSync finished:`);
  console.log(`  Locations processed: ${createdLocations}`);
  console.log(`  Assignments created: ${createdAssignments}`);
}

main()
  .catch((e) => {
    console.error('Error during sync:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
