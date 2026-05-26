/**
 * One-off cleanup script — removes leftover test fixture data
 * from the test DB (created by integration tests interrupted before afterAll).
 *
 * Usage: pnpm --filter @futuragest/api exec tsx scripts/clean-test-fixtures.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test — this script always targets the test DB
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

import { createPrismaClient } from '../src/database/prisma-client';

const prisma = createPrismaClient();

async function main() {
  // Find test users (NOT the seeded admin)
  const testUsers = await prisma.user.findMany({
    where: {
      AND: [
        { email: { contains: 'scope-test' } },
        { NOT: { email: 'admin@futuragest.co' } },
      ],
    },
    select: { id: true, email: true },
  });

  console.log(`Found ${testUsers.length} test users to clean:`);
  testUsers.forEach((u) => console.log('  -', u.email));

  if (!testUsers.length) {
    console.log('Nothing to clean.');
    await prisma.$disconnect();
    return;
  }

  const userIds = testUsers.map((u) => u.id);

  // Get supervisor IDs for these users
  const supervisors = await prisma.supervisor.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const supervisorIds = supervisors.map((s) => s.id);

  // Remove in FK-safe order: Assignments → Operarios → Supervisors → DeviceSessions → Users
  if (supervisorIds.length) {
    const assignments = await prisma.assignment.deleteMany({
      where: { supervisorId: { in: supervisorIds } },
    });
    console.log(`  Deleted ${assignments.count} assignments`);

    const operarios = await prisma.operario.deleteMany({
      where: { supervisorId: { in: supervisorIds } },
    });
    console.log(`  Deleted ${operarios.count} operarios`);
  }

  const supDel = await prisma.supervisor.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`  Deleted ${supDel.count} supervisors`);

  const sessions = await prisma.deviceSession.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`  Deleted ${sessions.count} device sessions`);

  const users = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`  Deleted ${users.count} users`);

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(console.error);
