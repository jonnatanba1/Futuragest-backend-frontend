import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MinioStorageAdapter } from './infrastructure/minio-storage.adapter';
import { STORAGE_PORT } from './domain/storage.port';

@Module({
  imports: [ConfigModule],
  providers: [
    MinioStorageAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: MinioStorageAdapter,
    },
  ],
  exports: [STORAGE_PORT, MinioStorageAdapter],
})
export class StorageModule {}
