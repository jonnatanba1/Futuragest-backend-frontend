import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationPort, NovedadCreatedPayload } from '../domain/notification.port';
import { FcmNotificationAdapter } from './fcm-notification.adapter';
import { SseNotificationAdapter } from './sse-notification.adapter';

@Injectable()
export class CompositeNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(CompositeNotificationAdapter.name);

  constructor(
    @Inject(FcmNotificationAdapter) private readonly fcm: FcmNotificationAdapter,
    @Inject(SseNotificationAdapter) private readonly sse: SseNotificationAdapter,
  ) {}

  async notifyNovedadCreated(payload: NovedadCreatedPayload): Promise<void> {
    const results = await Promise.allSettled([
      this.fcm.notifyNovedadCreated(payload),
      this.sse.notifyNovedadCreated(payload),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error('[CompositeAdapter] One notification adapter failed', result.reason);
      }
    }
  }
}
