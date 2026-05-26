/**
 * Prisma 7 client factory.
 *
 * Prisma 7 uses the WASM query compiler and requires a driver adapter.
 * Use `createPrismaClient(url?)` for seeding / testing instead of `new PrismaClient()` directly.
 *
 * The DATABASE_URL is read from the environment. For tests, load .env.test before calling this.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Create a Prisma client bound to the given connection URL.
 * Falls back to `process.env.DATABASE_URL` if not provided.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'Load the appropriate .env file before calling createPrismaClient().',
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}
