import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { StoragePort } from '../domain/storage.port';

const DEFAULT_EXPIRY_SECONDS = 3600;
// Timeout for connectivity checks. Kept short so test bootstraps stay within
// Jest's default 5-second beforeAll budget even when MinIO is unreachable.
const CONNECT_TIMEOUT_MS = 2000;

/** Race a promise against a hard timeout. Rejects with a timeout error if exceeded. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`MinIO request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

@Injectable()
export class MinioStorageAdapter implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: MinioClient;

  constructor(private readonly config: ConfigService) {
    // ConfigService returns env var values as strings — coerce types explicitly.
    const rawUseSSL = config.get<string | boolean>('MINIO_USE_SSL');
    const useSSL =
      rawUseSSL === true || rawUseSSL === 'true' || rawUseSSL === '1';

    const rawPort = config.get<string | number>('MINIO_PORT');
    const port =
      typeof rawPort === 'number' ? rawPort : parseInt(String(rawPort ?? '9000'), 10);

    this.client = new MinioClient({
      endPoint: config.get<string>('MINIO_ENDPOINT') ?? 'localhost',
      port,
      useSSL,
      accessKey: config.get<string>('MINIO_ACCESS_KEY') ?? '',
      secretKey: config.get<string>('MINIO_SECRET_KEY') ?? '',
    });
  }

  async onModuleInit(): Promise<void> {
    const bucket = 'futuragest';
    try {
      const exists = await withTimeout(this.client.bucketExists(bucket), CONNECT_TIMEOUT_MS);
      if (!exists) {
        await withTimeout(this.client.makeBucket(bucket), CONNECT_TIMEOUT_MS);
        this.logger.log(`Bucket "${bucket}" created.`);
      } else {
        this.logger.log(`Bucket "${bucket}" already exists.`);
      }
    } catch (err) {
      this.logger.error(`MinIO onModuleInit failed: ${(err as Error).message}`);
      // Do not throw — let the health check report degraded status
    }
  }

  async putObject(
    bucket: string,
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.putObject(bucket, key, data, data.length, {
      'Content-Type': contentType,
    });
  }

  async getPresignedGetUrl(
    bucket: string,
    key: string,
    expirySeconds: number = DEFAULT_EXPIRY_SECONDS,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expirySeconds);
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    expirySeconds: number = DEFAULT_EXPIRY_SECONDS,
  ): Promise<string> {
    return this.client.presignedPutObject(bucket, key, expirySeconds);
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  /**
   * Ping MinIO to verify connectivity.
   * Used by the health endpoint.
   */
  async ping(): Promise<boolean> {
    try {
      await withTimeout(this.client.listBuckets(), CONNECT_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  }
}
