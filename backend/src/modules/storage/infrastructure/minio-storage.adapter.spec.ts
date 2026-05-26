/**
 * Unit tests for MinioStorageAdapter.
 * Mock the minio client — no real MinIO needed.
 * Written RED before the adapter implementation (T5.1 TDD step).
 */

jest.mock('minio');

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { MinioStorageAdapter } from './minio-storage.adapter';

const MockMinioClient = MinioClient as jest.MockedClass<typeof MinioClient>;

// Shared mock instance returned by new Client()
const mockInstance = {
  putObject: jest.fn(),
  presignedGetObject: jest.fn(),
  presignedPutObject: jest.fn(),
  removeObject: jest.fn(),
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
} as unknown as jest.Mocked<InstanceType<typeof MinioClient>>;

beforeEach(() => {
  jest.clearAllMocks();
  MockMinioClient.mockImplementation(() => mockInstance as unknown as MinioClient);

  // Default mock resolutions
  mockInstance.bucketExists.mockResolvedValue(true);
  mockInstance.makeBucket.mockResolvedValue(undefined);
  mockInstance.putObject.mockResolvedValue({ etag: 'abc', versionId: null });
  mockInstance.presignedGetObject.mockResolvedValue('https://minio.local/bucket/key?signed=1');
  mockInstance.presignedPutObject.mockResolvedValue('https://minio.local/bucket/key?put-signed=1');
  mockInstance.removeObject.mockResolvedValue(undefined);
});

async function buildAdapter(): Promise<MinioStorageAdapter> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MinioStorageAdapter,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            const cfg: Record<string, unknown> = {
              MINIO_ENDPOINT: 'localhost',
              MINIO_PORT: 9000,
              MINIO_USE_SSL: false,
              MINIO_ACCESS_KEY: 'minioadmin',
              MINIO_SECRET_KEY: 'minioadmin',
            };
            return cfg[key];
          },
        },
      },
    ],
  }).compile();

  const adapter = module.get<MinioStorageAdapter>(MinioStorageAdapter);
  // Trigger onModuleInit without actually connecting
  await adapter.onModuleInit();
  return adapter;
}

describe('MinioStorageAdapter', () => {
  describe('putObject', () => {
    it('resolves without throwing', async () => {
      const adapter = await buildAdapter();
      await expect(
        adapter.putObject('futuragest', 'test/file.pdf', Buffer.from('hello'), 'application/pdf'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getPresignedGetUrl', () => {
    it('returns a non-empty string', async () => {
      const adapter = await buildAdapter();
      const url = await adapter.getPresignedGetUrl('futuragest', 'test/file.pdf');
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('getPresignedPutUrl', () => {
    it('returns a non-empty string', async () => {
      const adapter = await buildAdapter();
      const url = await adapter.getPresignedPutUrl('futuragest', 'test/file.pdf');
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('removeObject', () => {
    it('resolves without throwing', async () => {
      const adapter = await buildAdapter();
      await expect(adapter.removeObject('futuragest', 'test/file.pdf')).resolves.toBeUndefined();
    });
  });
});
