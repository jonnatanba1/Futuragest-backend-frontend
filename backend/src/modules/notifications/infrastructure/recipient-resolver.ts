/**
 * Notifications infrastructure — RecipientResolver.
 *
 * SYSTEM-LEVEL raw query: resolves active LIDER_OPERATIVO device push tokens.
 *
 * SCOPE RATIONALE (documented as required):
 * This query intentionally bypasses request-scoped scope filtering.
 * Justification: LIDER_OPERATIVO is a GLOBAL role (not zone-scoped) — all active
 * LIDER_OPERATIVO users can approve any novedad regardless of zone. Push notifications
 * must reach ALL active approvers, not just those in the creator's zone.
 * User and DeviceSession are NOT scoped models, so this is NOT a scope-isolation bypass.
 * The meta-guard does not apply here. This file is the ONLY authorized location for
 * this system-level query (sanctioned by design).
 *
 * SYSTEM_ADMIN inclusion: configurable via PUSH_NOTIFY_SYSTEM_ADMIN env var.
 * Default: false (LIDER_OPERATIVO only) per PN spec.
 */

import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * A single eligible push recipient.
 * The (userId, deviceId) pair identifies the exact DeviceSession that owns the token —
 * needed to prune dead tokens after a failed send (see FcmNotificationAdapter).
 */
export interface PushRecipient {
  userId: string;
  deviceId: string;
  pushToken: string;
}

@Injectable()
export class RecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns active push recipients for all eligible approvers.
   * Eligible = LIDER_OPERATIVO (+ optionally SYSTEM_ADMIN) with:
   *   - revokedAt IS NULL (active session)
   *   - pushToken IS NOT NULL (registered for push)
   *
   * Returns { userId, deviceId, pushToken } tuples so the caller can map each
   * send result back to the owning session and prune dead tokens.
   */
  async getActivePushTokens(): Promise<PushRecipient[]> {
    const includeSystemAdmin = process.env.PUSH_NOTIFY_SYSTEM_ADMIN === 'true';

    const roles: Role[] = includeSystemAdmin
      ? ['LIDER_OPERATIVO', 'SYSTEM_ADMIN']
      : ['LIDER_OPERATIVO'];

    // ORM query: system-level lookup across all zones and users (see scope rationale above).
    // Replaces the prior $queryRawUnsafe — type-safe, injection-safe, and self-documenting.
    const rows = await this.prisma.deviceSession.findMany({
      where: {
        user: { role: { in: roles } },
        revokedAt: null,
        pushToken: { not: null },
      },
      select: { userId: true, deviceId: true, pushToken: true },
    });

    // pushToken is typed string | null by Prisma; the `not: null` filter guarantees non-null,
    // but we narrow defensively to satisfy the PushRecipient contract.
    return rows
      .filter((r): r is { userId: string; deviceId: string; pushToken: string } => r.pushToken !== null)
      .map((r) => ({ userId: r.userId, deviceId: r.deviceId, pushToken: r.pushToken }));
  }
}
