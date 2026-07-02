/**
 * NotificationsModule — DI wiring for the push notification port and adapters.
 *
 * Adapter selection (env-driven factory, mirrors StorageModule pattern):
 * - FIREBASE_ENABLED==='true' → CompositeNotificationAdapter (FCM + SSE)
 * - default                   → SseNotificationAdapter (SSE only, always active)
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
import { SseConnectionRegistry } from './infrastructure/sse-connection-registry';
import { SseNotificationAdapter } from './infrastructure/sse-notification.adapter';
import { CompositeNotificationAdapter } from './infrastructure/composite-notification.adapter';
import { RecipientResolver } from './infrastructure/recipient-resolver';
import { SseAuthGuard } from './interface/sse-auth.guard';
import { NotificationsController } from './interface/notifications.controller';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    RecipientResolver,
    NoOpNotificationAdapter,
    SseConnectionRegistry,
    SseAuthGuard,
    {
      provide: FcmNotificationAdapter,
      useFactory: (resolver: RecipientResolver, authRepo: AuthRepositoryPort) =>
        new FcmNotificationAdapter(resolver, authRepo),
      inject: [RecipientResolver, AUTH_REPOSITORY_PORT],
    },
    {
      provide: SseNotificationAdapter,
      useFactory: (registry: SseConnectionRegistry) =>
        new SseNotificationAdapter(registry),
      inject: [SseConnectionRegistry],
    },
    {
      provide: NOTIFICATION_PORT,
      useFactory: (
        fcm: FcmNotificationAdapter,
        sse: SseNotificationAdapter,
      ) => {
        if (process.env.FIREBASE_ENABLED === 'true') {
          return new CompositeNotificationAdapter(fcm, sse);
        }
        return sse;
      },
      inject: [FcmNotificationAdapter, SseNotificationAdapter],
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
