/**
 * Idempotently links existing municipios and supervisors to inventory.
 *
 * This script never creates municipios, supervisors, or users. It only creates
 * the missing municipal warehouse and a current CUSTODIAN assignment for each
 * existing supervisor in that municipio.
 *
 * Usage: pnpm exec tsx prisma/sync-municipal-locations.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

function municipalWarehouseCode(municipioId: string): string {
  return `MW-${municipioId.replaceAll('-', '').toUpperCase()}`;
}

async function main() {
  const municipios = await prisma.municipio.findMany({
    include: {
      supervisors: {
        include: { user: { select: { email: true } } },
      },
    },
    orderBy: [{ zoneId: 'asc' }, { name: 'asc' }],
  });

  let createdLocations = 0;
  let createdAssignments = 0;

  for (const municipio of municipios) {
    const result = await prisma.$transaction(async (tx) => {
      let location = await tx.inventoryLocation.findFirst({
        where: {
          municipioId: municipio.id,
          type: 'MUNICIPAL_WAREHOUSE',
          active: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      let locationCreated = false;
      if (!location) {
        location = await tx.inventoryLocation.create({
          data: {
            code: municipalWarehouseCode(municipio.id),
            name: `Bodega ${municipio.name}`,
            type: 'MUNICIPAL_WAREHOUSE',
            zoneId: municipio.zoneId,
            municipioId: municipio.id,
            active: true,
            inventoryEnabled: false,
          },
        });
        locationCreated = true;
      }

      let assignmentsCreated = 0;
      const now = new Date();
      for (const supervisor of municipio.supervisors) {
        const activeAssignment = await tx.inventoryLocationAssignment.findFirst({
          where: {
            locationId: location.id,
            userId: supervisor.userId,
            supervisorId: supervisor.id,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
        });
        if (activeAssignment) continue;

        await tx.inventoryLocationAssignment.create({
          data: {
            locationId: location.id,
            userId: supervisor.userId,
            supervisorId: supervisor.id,
            role: 'CUSTODIAN',
            validFrom: now,
          },
        });
        assignmentsCreated += 1;
      }

      return { location, locationCreated, assignmentsCreated };
    });

    createdLocations += Number(result.locationCreated);
    createdAssignments += result.assignmentsCreated;
    console.log(
      `${result.location.code}: ${municipio.name} — ${municipio.supervisors.length} supervisor(es) vinculados`,
    );
  }

  console.log(
    `Sync finished: ${municipios.length} municipios processed, ${createdLocations} locations created, ${createdAssignments} assignments created.`,
  );
}

main()
  .catch((error) => {
    console.error('Municipal inventory synchronization failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
