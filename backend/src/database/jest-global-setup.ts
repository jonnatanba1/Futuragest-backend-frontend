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
