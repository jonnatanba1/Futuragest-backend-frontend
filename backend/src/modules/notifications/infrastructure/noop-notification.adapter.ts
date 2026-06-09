/**
 * Notifications infrastructure — NoOpNotificationAdapter.
 *
 * Default adapter: logs and resolves immediately.
 * Used when FIREBASE_ENABLED is not set to 'true'.
 * Zero dependencies on firebase-admin.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPort, NovedadCreatedPayload } from '../domain/notification.port';

@Injectable()
export class NoOpNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(NoOpNotificationAdapter.name);

  async notifyNovedadCreated(payload: NovedadCreatedPayload): Promise<void> {
    this.logger.debug(
      `[NoOp] notifyNovedadCreated — no-op (Firebase not enabled). novedadId=${payload.novedadId}`,
    );
  }
}
