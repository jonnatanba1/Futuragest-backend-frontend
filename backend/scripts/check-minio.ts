/**
 * Connectivity check for MinIO — verifies the running instance (e.g. Dokploy)
 * is reachable with the credentials in backend/.env, without booting Nest.
 *
 * Reads MINIO_* from .env at runtime (never prints secret values).
 *
 * Usage: pnpm --filter @futuragest/api exec tsx scripts/check-minio.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load the same .env the integration smoke test uses for MINIO_* vars.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Client as MinioClient } from 'minio';

const endpoint = process.env['MINIO_ENDPOINT'] ?? 'localhost';
const port = parseInt(process.env['MINIO_PORT'] ?? '9000', 10);
const rawUseSSL = process.env['MINIO_USE_SSL'];
const useSSL = rawUseSSL === 'true' || rawUseSSL === '1';
const accessKey = process.env['MINIO_ACCESS_KEY'] ?? '';
const secretKey = process.env['MINIO_SECRET_KEY'] ?? '';

const BUCKET = 'futuragest';

console.log('[check-minio] target config:');
console.log(`  endpoint  = ${endpoint}`);
console.log(`  port      = ${port}`);
console.log(`  useSSL    = ${useSSL}`);
console.log(`  accessKey = ${accessKey ? '(set)' : '(EMPTY!)'}`);
console.log(`  secretKey = ${secretKey ? '(set)' : '(EMPTY!)'}`);

const client = new MinioClient({ endPoint: endpoint, port, useSSL, accessKey, secretKey });

async function main(): Promise<void> {
  try {
    const buckets = await client.listBuckets();
    const names = buckets.map((b) => b.name);
    console.log(`[check-minio] ✅ connected — ${names.length} bucket(s): ${names.join(', ') || '(none)'}`);

    const exists = await client.bucketExists(BUCKET);
    console.log(`[check-minio] bucket "${BUCKET}" exists: ${exists}`);
    process.exit(0);
  } catch (err) {
    console.error(`[check-minio] ❌ connection failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

void main();
