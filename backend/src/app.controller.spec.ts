import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaService } from './database/prisma.service';
import { MinioStorageAdapter } from './modules/storage/infrastructure/minio-storage.adapter';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockStorage = {
  ping: jest.fn(),
};

async function buildController(): Promise<AppController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: MinioStorageAdapter, useValue: mockStorage },
    ],
  }).compile();
  return module.get<AppController>(AppController);
}

describe('AppController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('health()', () => {
    it('returns { status: "ok", postgres: "up", minio: "up" } when both deps are healthy', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockStorage.ping.mockResolvedValue(true);

      const controller = await buildController();
      const result = await controller.health();

      expect(result).toEqual({ status: 'ok', postgres: 'up', minio: 'up' });
    });

    it('throws HTTP 503 with { status: "degraded", minio: "down" } when MinIO is unreachable', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockStorage.ping.mockResolvedValue(false);

      const controller = await buildController();
      await expect(controller.health()).rejects.toThrow(HttpException);

      try {
        await controller.health();
      } catch (err) {
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = httpErr.getResponse() as Record<string, unknown>;
        expect(body.status).toBe('degraded');
        expect(body.minio).toBe('down');
        expect(body.postgres).toBe('up');
      }
    });

    it('throws HTTP 503 with { status: "degraded", postgres: "down" } when Postgres is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      mockStorage.ping.mockResolvedValue(true);

      const controller = await buildController();

      try {
        await controller.health();
        fail('Expected an exception');
      } catch (err) {
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = httpErr.getResponse() as Record<string, unknown>;
        expect(body.status).toBe('degraded');
        expect(body.postgres).toBe('down');
        expect(body.minio).toBe('up');
      }
    });
  });
});
