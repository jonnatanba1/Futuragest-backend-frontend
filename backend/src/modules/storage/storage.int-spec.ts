/**
 * Integration tests for StoragePort.
 * T5.2 — Smoke test against a real MinIO instance.
 *        Reads MINIO_* vars from .env (loaded at top of file).
 *        If MinIO is unreachable the test is skipped (not failed) —
 *        CI uses the minio service container, so it will always run there.
 * T5.3 — Health check degradation when MinIO is unreachable (wrong port).
 *
 * NOTE: dotenv MUST be loaded before any env-reading imports.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env before anything that reads env vars.
// The test DB is loaded by jest-global-setup via .env.test;
// here we want the MINIO_* vars which live in .env.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import * as http from 'http';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { MinioStorageAdapter } from './infrastructure/minio-storage.adapter';
import { STORAGE_PORT } from './domain/storage.port';

// ─── Helper: probe MinIO reachability ────────────────────────────────────────

function probeMinioReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Hard outer timeout — handles cases where socket hangs without error
    const timer = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, 2000);

    const req = http.get(
      { hostname: host, port, path: '/minio/health/live', timeout: 1500 },
      (res) => {
        clearTimeout(timer);
        resolve(res.statusCode !== undefined);
        res.resume();
      },
    );
    req.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    req.on('timeout', () => {
      clearTimeout(timer);
      req.destroy();
      resolve(false);
    });
  });
}

// ─── T5.2 — Storage smoke ─────────────────────────────────────────────────────

describe('StoragePort integration — MinIO real', () => {
  let adapter: MinioStorageAdapter;
  let minioReachable: boolean;

  beforeAll(async () => {
    const endpoint = process.env['MINIO_ENDPOINT'] ?? 'localhost';
    const port = parseInt(process.env['MINIO_PORT'] ?? '9000', 10);
    minioReachable = await probeMinioReachable(endpoint, port);

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: false })],
      providers: [
        MinioStorageAdapter,
        {
          provide: STORAGE_PORT,
          useExisting: MinioStorageAdapter,
        },
      ],
    }).compile();

    adapter = module.get<MinioStorageAdapter>(MinioStorageAdapter);
    await adapter.onModuleInit();
  }, 15_000);

  it('puts a buffer, then presignedGetUrl returns a non-empty string', async () => {
    if (!minioReachable) {
      console.warn('[T5.2] MinIO unreachable — skipping smoke test (runs in CI)');
      return;
    }

    const key = `test/smoke-${Date.now()}.txt`;
    const data = Buffer.from('storage smoke test');

    await adapter.putObject('futuragest', key, data, 'text/plain');
    const url = await adapter.getPresignedGetUrl('futuragest', key);

    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);

    // Cleanup
    await adapter.removeObject('futuragest', key);
  });
});

// ─── T5.3 — Health check with MinIO down ─────────────────────────────────────

describe('Health check — MinIO unreachable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../app.module');
    const { ConfigService } = await import('@nestjs/config');

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          // Point MinIO to a port that won't respond
          const overrides: Record<string, unknown> = {
            MINIO_ENDPOINT: 'localhost',
            MINIO_PORT: 19999,
            MINIO_USE_SSL: false,
            MINIO_ACCESS_KEY: 'minioadmin',
            MINIO_SECRET_KEY: 'minioadmin',
          };
          if (key in overrides) return overrides[key];
          // Fall back to actual env vars for DB, JWT, etc.
          return process.env[key];
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health returns non-200 or { minio: "down" } when MinIO is unreachable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const request: import('supertest').SuperTestStatic = require('supertest');
    const response = await request(app.getHttpServer()).get('/health');

    const isNon200 = response.status !== HttpStatus.OK;
    const isBodyDown = response.body?.minio === 'down';

    expect(isNon200 || isBodyDown).toBe(true);
  }, 15_000);
});
