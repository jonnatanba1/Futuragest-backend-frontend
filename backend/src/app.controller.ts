import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { MinioStorageAdapter } from './modules/storage/infrastructure/minio-storage.adapter';
import { Public } from './modules/auth/interface/public.decorator';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  postgres: 'up' | 'down';
  minio: 'up' | 'down';
}

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioStorageAdapter,
  ) {}

  @Public()
  @Get('health')
  async health(): Promise<HealthResponse> {
    const [pgUp, minioUp] = await Promise.all([
      this.checkPostgres(),
      this.storage.ping(),
    ]);

    const status = pgUp && minioUp ? 'ok' : 'degraded';
    const body: HealthResponse = {
      status,
      postgres: pgUp ? 'up' : 'down',
      minio: minioUp ? 'up' : 'down',
    };

    if (status === 'degraded') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
