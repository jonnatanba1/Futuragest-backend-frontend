import { Controller, Logger, Req, Sse, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Subject, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { Public } from '../../auth/interface/public.decorator';
import { SseAuthGuard } from './sse-auth.guard';
import { SseConnectionRegistry, type SseMessage } from '../infrastructure/sse-connection-registry';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly registry: SseConnectionRegistry) {}

  @Public()
  @UseGuards(SseAuthGuard)
  @Sse('stream')
  stream(@Req() req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.userId as string | undefined;
    if (!userId) {
      this.logger.error('[SSE] Request authenticated but no userId found');
      return;
    }

    const subject = new Subject<SseMessage>();
    this.registry.register(userId, subject);

    req.on('close', () => {
      this.registry.unregister(userId, subject);
      subject.complete();
    });

    return merge(
      subject.asObservable(),
      interval(15000).pipe(map(() => ({ data: '' }) as SseMessage)),
    );
  }
}
