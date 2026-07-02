import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPort, NovedadCreatedPayload } from '../domain/notification.port';
import { SseConnectionRegistry } from './sse-connection-registry';

@Injectable()
export class SseNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(SseNotificationAdapter.name);

  constructor(private readonly registry: SseConnectionRegistry) {}

  notifyNovedadCreated(payload: NovedadCreatedPayload): Promise<void> {
    try {
      const data = JSON.stringify({ ...payload, type: 'novedad-created' });
      const userIds = this.registry.getUserIds();

      if (userIds.length === 0) {
        this.logger.debug('[SseAdapter] No active SSE connections — nothing to dispatch.');
        return Promise.resolve();
      }

      for (const userId of userIds) {
        this.registry.dispatch(userId, data);
      }
      this.logger.debug(`[SseAdapter] Dispatched to ${userIds.length} user(s).`);
    } catch (err) {
      this.logger.error('[SseAdapter] Failed to dispatch SSE notification', err);
    }
    return Promise.resolve();
  }
}
