import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * NestJS-injectable Prisma service.
 *
 * Extends PrismaClient with lifecycle hooks for clean startup/shutdown.
 * Prisma 7 requires a driver adapter — we use @prisma/adapter-pg.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
          'Ensure the environment is loaded before bootstrapping the NestJS application.',
      );
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
