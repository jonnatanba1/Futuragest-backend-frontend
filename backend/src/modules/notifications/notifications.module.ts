/**
 * NotificationsModule — DI wiring for the push notification port and adapters.
 *
 * Adapter selection (env-driven factory, mirrors StorageModule pattern):
 * - FIREBASE_ENABLED==='true' → FcmNotificationAdapter (import-safe skeleton)
 * - default                   → NoOpNotificationAdapter (structured log, no-op)
 *
 * This module is SINGLETON-scoped (not request-scoped) because RecipientResolver
 * performs a global DB query (not request-scoped). NestJS allows singleton providers
 * to be injected into REQUEST-scoped providers (e.g. CreateNovedadUseCase factory).
 *
 * Dependency direction:
 *   notifications → auth (for AUTH_REPOSITORY_PORT, used to purge dead push tokens)
 *   notifications → prisma
 *   novedades → notifications (imports NotificationsModule)
 * auth does NOT import notifications, and notifications does NOT import novedades,
 * so there is NO circular dependency.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AUTH_REPOSITORY_PORT } from '../auth/domain/auth-repository.port';
import type { AuthRepositoryPort } from '../auth/domain/auth-repository.port';
import { NOTIFICATION_PORT } from './domain/notification.port';
import { NoOpNotificationAdapter } from './infrastructure/noop-notification.adapter';
import { FcmNotificationAdapter } from './infrastructure/fcm-notification.adapter';
import { RecipientResolver } from './infrastructure/recipient-resolver';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [
    RecipientResolver,
    NoOpNotificationAdapter,
    {
      provide: FcmNotificationAdapter,
      useFactory: (resolver: RecipientResolver, authRepo: AuthRepositoryPort) =>
        new FcmNotificationAdapter(resolver, authRepo),
      inject: [RecipientResolver, AUTH_REPOSITORY_PORT],
    },
    {
      provide: NOTIFICATION_PORT,
      useFactory: (
        noOp: NoOpNotificationAdapter,
        fcm: FcmNotificationAdapter,
      ) => {
        if (process.env.FIREBASE_ENABLED === 'true') {
          return fcm;
        }
        return noOp;
      },
      inject: [NoOpNotificationAdapter, FcmNotificationAdapter],
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
