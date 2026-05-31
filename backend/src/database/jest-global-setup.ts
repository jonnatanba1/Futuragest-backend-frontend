/**
 * Jest globalSetup for integration tests.
 *
 * Runs ONCE before all test suites.
 * 1. Loads .env.test to set DATABASE_URL → futuragest_test
 * 2. Applies all pending migrations via `prisma migrate deploy`
 * 3. Runs the authoritative seed
 *
 * Using `prisma migrate deploy` (not dev) because:
 * - It does not need a shadow database
 * - It is safe to run in CI and local test environments
 * - It applies only pending migrations idempotently
 */

import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

export default async function globalSetup() {
  // Load test environment — overrides any existing DATABASE_URL
  const envPath = path.resolve(__dirname, '..', '..', '.env.test');
  dotenv.config({ path: envPath, override: true });

  console.log('\n[jest-global-setup] Cleaning up test fixture users from previous runs...');
  await cleanTestFixtures();

  console.log('\n[jest-global-setup] Applying migrations to test DB...');

  const backendDir = path.resolve(__dirname, '..', '..');

  // Apply pending migrations to futuragest_test
  execSync('pnpm exec prisma migrate deploy', {
    cwd: backendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Ensure we're using the test DB URL from .env.test
    },
  });

  // Apply the partial unique index to test DB as well
  // (it was manually added to the migration SQL, so migrate deploy handles it)
  console.log('[jest-global-setup] Migrations applied.');

  // Run seed against test DB
  console.log('[jest-global-setup] Seeding test DB...');
  execSync('pnpm exec tsx prisma/seed.ts', {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[jest-global-setup] Seed complete.\n');
}

/**
 * Deletes all non-seed test fixture users from a previous test run.
 * Seed users are identified by their email patterns:
 *   - admin@futuragest.co  (SYSTEM_ADMIN seed)
 *   - supervisor-N@futuragest.co  (supervisor seed)
 *
 * All other users are test fixtures and are safe to delete before each run.
 * This prevents "Unique constraint failed" errors when a test's beforeAll crashed
 * and afterAll was never invoked to clean up.
 */
async function cleanTestFixtures(): Promise<void> {
  // Dynamic import to avoid loading Prisma at module parse time
  // (DATABASE_URL is not set until dotenv.config() runs above)
  const { createPrismaClient } = await import('./prisma-client');
  const prisma = createPrismaClient();

  try {
    // Delete device sessions and operarios first (FK dependencies on User)
    // Find non-seed users
    const testUsers = await prisma.user.findMany({
      where: {
        AND: [
          { email: { not: 'admin@futuragest.co' } },
          { email: { not: { startsWith: 'supervisor-' } } },
        ],
      },
      select: { id: true },
    });

    if (testUsers.length === 0) {
      console.log('[jest-global-setup] No leftover test fixture users found.');
      return;
    }

    const testUserIds = testUsers.map((u: { id: string }) => u.id);
    console.log(`[jest-global-setup] Cleaning up ${testUserIds.length} test fixture user(s)...`);

    // Clean up in FK-safe order:
    // 1. Operarios (depend on Supervisor)
    // 2. Assignments (depend on Supervisor + Operario)
    // 3. Supervisors (depend on User)
    // 4. DeviceSessions (depend on User)
    // 5. Users
    const supervisors = await prisma.supervisor.findMany({
      where: { userId: { in: testUserIds } },
      select: { id: true },
    });
    const supervisorIds = supervisors.map((s: { id: string }) => s.id);

    if (supervisorIds.length > 0) {
      // Novedad must be deleted BEFORE Attendance (FK dependency: Novedad → Attendance)
      await prisma.novedad.deleteMany({ where: { supervisorId: { in: supervisorIds } } });
      // Attendance must be deleted BEFORE Operario/Supervisor (FK dependency)
      await prisma.attendance.deleteMany({ where: { supervisorId: { in: supervisorIds } } });
      await prisma.assignment.deleteMany({ where: { supervisorId: { in: supervisorIds } } });
      await prisma.operario.deleteMany({ where: { supervisorId: { in: supervisorIds } } });
      await prisma.supervisor.deleteMany({ where: { id: { in: supervisorIds } } });
    }
    await prisma.deviceSession.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });

    console.log('[jest-global-setup] Test fixture cleanup done.');
  } finally {
    await prisma.$disconnect();
  }
}
