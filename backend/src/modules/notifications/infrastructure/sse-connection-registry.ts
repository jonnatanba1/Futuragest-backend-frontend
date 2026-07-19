import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseMessage {
  data: string;
}

@Injectable()
export class SseConnectionRegistry {
  private readonly logger = new Logger(SseConnectionRegistry.name);
  private readonly connections = new Map<string, Set<Subject<SseMessage>>>();

  register(userId: string, subject: Subject<SseMessage>): void {
    let subjects = this.connections.get(userId);
    if (!subjects) {
      subjects = new Set();
      this.connections.set(userId, subjects);
    }
    subjects.add(subject);
    this.logger.debug(`SSE connection registered for userId=${userId} (total: ${subjects.size})`);
  }

  unregister(userId: string, subject: Subject<SseMessage>): void {
    const subjects = this.connections.get(userId);
    if (!subjects) return;
    subjects.delete(subject);
    if (subjects.size === 0) {
      this.connections.delete(userId);
    }
    this.logger.debug(`SSE connection unregistered for userId=${userId} (remaining: ${subjects.size})`);
  }

  getUserIds(): string[] {
    return Array.from(this.connections.keys());
  }

  dispatch(userId: string, payload: string): void {
    const subjects = this.connections.get(userId);
    if (!subjects || subjects.size === 0) {
      this.logger.debug(`SSE dispatch skipped for userId=${userId} — no active connections`);
      return;
    }
    for (const subject of subjects) {
      subject.next({ data: payload });
    }
  }
}
