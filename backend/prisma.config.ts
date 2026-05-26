import * as dotenv from 'dotenv';
import * as path from 'path';
import { defineConfig } from '@prisma/config';

// Load .env without overriding — existing env vars (e.g. DATABASE_URL from jest-global-setup) win
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Load .env.test separately to extract the test DB URL for use as shadow DB
// Only used when running `prisma migrate dev` (local dev, not CI or test runs)
const testEnvResult = dotenv.config({ path: path.resolve(__dirname, '.env.test') });
const testDbUrl = testEnvResult.parsed?.DATABASE_URL;

const mainUrl = process.env.DATABASE_URL!;

// Only set shadowDatabaseUrl when it differs from the main URL
// (avoids the "shadow = main" error when running migrate deploy against test DB)
const shadowUrl = testDbUrl && testDbUrl !== mainUrl ? testDbUrl : undefined;

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: mainUrl,
    ...(shadowUrl ? { shadowDatabaseUrl: shadowUrl } : {}),
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
