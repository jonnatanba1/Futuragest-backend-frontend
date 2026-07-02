/**
 * Notifications infrastructure — FcmNotificationAdapter (import-safe, real send).
 *
 * IMPORT SAFETY CONTRACT:
 * - NO top-level `import` of firebase-admin.
 * - firebase-admin is a package.json dependency but is loaded DYNAMICALLY.
 * - Dynamic `require('firebase-admin')` is gated on FIREBASE_ENABLED==='true'
 *   and wrapped in try/catch.
 * - If FIREBASE_ENABLED is unset (default in tests), this adapter is NOT bound
 *   by the factory — NoOpNotificationAdapter is used instead.
 *
 * CREDENTIAL LOADING (preferred order):
 * 1. FIREBASE_SERVICE_ACCOUNT_PATH — filesystem path to the service-account JSON
 *    (e.g. ./secrets/firebase-service-account.json). Loaded + parsed at init time.
 * 2. FIREBASE_SERVICE_ACCOUNT_JSON — inline JSON string (backward-compat fallback).
 * 3. Neither set → warning logged, send skipped (no crash).
 *
 * FIRE-AND-FORGET CONTRACT:
 * notifyNovedadCreated NEVER throws. Errors are caught and logged.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { NotificationPort, NovedadCreatedPayload } from '../domain/notification.port';
import type { AuthRepositoryPort } from '../../auth/domain/auth-repository.port';
import { RecipientResolver } from './recipient-resolver';

/**
 * FCM error codes that indicate a permanently dead/invalid registration token.
 * When a send fails with one of these, the owning DeviceSession's pushToken is purged
 * so future sends don't keep targeting a token FCM will never deliver to.
 */
// NOTE: 'messaging/invalid-argument' is deliberately NOT in this set. FCM returns that
// code both for bad tokens AND for malformed message PAYLOADS — treating it as a dead
// token would let a single payload bug purge every recipient's pushToken fleet-wide.
const DEAD_TOKEN_ERROR_CODES = new Set<string>([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** FCM hard limit: sendEachForMulticast rejects messages with more than 500 tokens. */
const FCM_MULTICAST_LIMIT = 500;

@Injectable()
export class FcmNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(FcmNotificationAdapter.name);

  constructor(
    private readonly recipientResolver: RecipientResolver,
    private readonly authRepo: AuthRepositoryPort,
  ) {}

  async notifyNovedadCreated(payload: NovedadCreatedPayload): Promise<void> {
    if (process.env.FIREBASE_ENABLED !== 'true') {
      this.logger.debug('[FcmAdapter] FIREBASE_ENABLED is not true — skipping send.');
      return;
    }

    try {
      const recipients = await this.recipientResolver.getActivePushTokens();

      if (recipients.length === 0) {
        this.logger.debug('[FcmAdapter] No eligible push tokens — nothing to send.');
        return;
      }

      // tokens[i] maps 1:1 to recipients[i] — preserved so send results can be
      // mapped back to the owning DeviceSession for dead-token purging.
      const tokens = recipients.map((r) => r.pushToken);

      // Dynamic require gated on FIREBASE_ENABLED — firebase-admin is NOT loaded at module load time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let admin: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        admin = require('firebase-admin');
      } catch {
        this.logger.warn(
          '[FcmAdapter] firebase-admin could not be loaded. ' +
            'Ensure it is installed and FIREBASE_SERVICE_ACCOUNT_PATH is configured.',
        );
        return;
      }

      // Initialize firebase-admin lazily (idempotent — safe to call per-request)
      if (!admin.apps?.length) {
        const serviceAccount = this.loadServiceAccount();
        if (!serviceAccount) {
          this.logger.warn(
            '[FcmAdapter] FIREBASE_ENABLED=true but no credentials found. ' +
              'Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON — skipping send.',
          );
          return;
        }
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      // Build the multicast message body (tokens are attached per batch below).
      // Copy is tipoNovedad-driven so LLEGADA_TARDE and HORAS_EXTRA each get their
      // own title/body. data carries tipoNovedad so the Flutter tap handler can
      // route to the right screen (LlegadasTardeScreen vs LiderNovedadesScreen).
      const isLateArrival = payload.tipoNovedad === 'LLEGADA_TARDE';
      const notification = isLateArrival
        ? {
            title: 'Nueva llegada tarde',
            body: `Se registró una llegada tarde de ${payload.minutosTarde ?? 0} minutos pendiente de revisión.`,
          }
        : {
            title: 'Nueva novedad de horas extra',
            body: `Se registraron ${payload.horasExtra} horas extra pendientes de aprobación.`,
          };
      const baseMessage = {
        notification,
        // FCM data fields must be string values only
        data: {
          novedadId: payload.novedadId,
          tipoNovedad: payload.tipoNovedad ?? 'HORAS_EXTRA',
          type: 'NOVEDAD_CREATED',
        },
      };

      // FCM rejects multicasts with >500 tokens, so chunk into batches of ≤500.
      // aggregatedResponses[i] maps 1:1 to recipients[i] across ALL batches — a batch
      // that fails wholesale contributes `undefined` placeholders to keep alignment.
      const aggregatedResponses: Array<
        { success: boolean; error?: { code?: string } } | undefined
      > = [];
      let successCount = 0;
      let failureCount = 0;
      // Tokens whose whole batch threw (no per-token verdict). Counted in the failure
      // metric of the summary log, but kept OUT of failureCount so the purge gate
      // semantics are unchanged (thrown batches are never purge candidates).
      let batchFailureCount = 0;
      let batchCount = 0;

      for (let start = 0; start < tokens.length; start += FCM_MULTICAST_LIMIT) {
        const batchTokens = tokens.slice(start, start + FCM_MULTICAST_LIMIT);
        batchCount++;
        try {
          const response = await admin
            .messaging()
            .sendEachForMulticast({ ...baseMessage, tokens: batchTokens });
          successCount += response.successCount;
          failureCount += response.failureCount;
          // Defensive guard: never trust the SDK to return exactly one response per
          // token. A short (or long) array would shift indices for every later entry
          // and could purge the WRONG recipient's token — discard the batch's
          // per-token results instead and keep alignment with undefined padding.
          const responses: unknown[] = Array.isArray(response.responses) ? response.responses : [];
          if (responses.length !== batchTokens.length) {
            this.logger.error(
              `[FcmAdapter] Batch ${batchCount} returned ${responses.length} response(s) for ` +
                `${batchTokens.length} token(s) — discarding per-token results to preserve ` +
                'recipient index alignment (no purge for this batch)',
            );
            aggregatedResponses.push(...new Array<undefined>(batchTokens.length).fill(undefined));
          } else {
            aggregatedResponses.push(
              ...(responses as Array<{ success: boolean; error?: { code?: string } }>),
            );
          }
        } catch (batchErr) {
          // A batch-level failure must not abort the remaining batches.
          this.logger.error(
            `[FcmAdapter] Batch ${batchCount} send failed (${batchTokens.length} token(s), ` +
              `offset ${start}) — continuing with remaining batches`,
            batchErr,
          );
          batchFailureCount += batchTokens.length;
          // No per-token results for this batch — pad to keep recipient index alignment.
          aggregatedResponses.push(...new Array<undefined>(batchTokens.length).fill(undefined));
        }
      }

      this.logger.log(
        `[FcmAdapter] Sent to ${tokens.length} device(s) in ${batchCount} batch(es). ` +
          `Success: ${successCount}, Failure: ${failureCount + batchFailureCount}`,
      );

      // Purge dead tokens: aggregatedResponses[i] maps 1:1 to recipients[i].
      // Fully failure-isolated — a purge error never escapes the fire-and-forget path.
      if (failureCount > 0) {
        await this.purgeDeadTokens(aggregatedResponses, recipients);
      }
    } catch (err) {
      // Never rethrow — fire-and-forget invariant
      this.logger.error('[FcmNotificationAdapter] Failed to send push notification', err);
    }
  }

  /**
   * Walk the multicast responses and clear the push token for any recipient whose send
   * failed with a permanently-dead-token error code.
   *
   * responses[i] corresponds to recipients[i] (FCM preserves multicast ordering; batch
   * aggregation preserves it across chunks). `undefined` entries (whole-batch send
   * failures) carry no per-token verdict and are skipped.
   * Each clearPushToken call is independently try/caught so a single repo failure does
   * not abort the rest of the purge, and the method NEVER throws (fire-and-forget invariant).
   */
  private async purgeDeadTokens(
    responses: Array<{ success: boolean; error?: { code?: string } } | undefined>,
    recipients: Array<{ userId: string; deviceId: string; pushToken: string }>,
  ): Promise<void> {
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      if (!resp || resp.success) continue;

      const code = resp.error?.code ?? 'unknown';
      const recipient = recipients[i];
      if (!recipient) continue;

      if (DEAD_TOKEN_ERROR_CODES.has(code)) {
        try {
          await this.authRepo.clearPushToken(recipient.userId, recipient.deviceId);
          this.logger.warn(
            `[FcmNotificationAdapter] Purged dead push token — code: ${code}, ` +
              `userId: ${recipient.userId}, deviceId: ${recipient.deviceId}`,
          );
        } catch (purgeErr) {
          // Isolated: a purge failure must not break the loop or escape fire-and-forget.
          this.logger.error(
            `[FcmNotificationAdapter] Failed to purge dead token for userId: ${recipient.userId}, ` +
              `deviceId: ${recipient.deviceId}`,
            purgeErr,
          );
        }
      } else {
        this.logger.warn(
          `[FcmNotificationAdapter] Token send failed (not purged) — code: ${code}, ` +
            `userId: ${recipient.userId}, deviceId: ${recipient.deviceId}`,
        );
      }
    }
  }

  /**
   * Resolves the Firebase service-account credentials object.
   *
   * Priority:
   * 1. FIREBASE_SERVICE_ACCOUNT_PATH — path to a JSON file
   * 2. FIREBASE_SERVICE_ACCOUNT_JSON — inline JSON string
   * 3. Returns null if neither is set.
   */
  private loadServiceAccount(): object | null {
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (filePath) {
      try {
        const resolved = path.resolve(filePath);
        const raw = fs.readFileSync(resolved, 'utf8');
        return JSON.parse(raw) as object;
      } catch (err) {
        this.logger.error(
          `[FcmAdapter] Failed to read service-account file at "${filePath}"`,
          err,
        );
        return null;
      }
    }

    const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (inlineJson) {
      try {
        return JSON.parse(inlineJson) as object;
      } catch (err) {
        this.logger.error('[FcmAdapter] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', err);
        return null;
      }
    }

    return null;
  }
}
