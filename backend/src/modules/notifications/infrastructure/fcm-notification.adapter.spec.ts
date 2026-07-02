/**
 * Unit spec — FcmNotificationAdapter
 *
 * PN-11 — FcmAdapter (FIREBASE_ENABLED=false) resolves without throwing.
 * PN-12 — FcmAdapter never imports firebase-admin at top level (import-safe).
 * PN-13 — when enabled + tokens present → builds correct title/body/data and calls sendEachForMulticast.
 * PN-14 — when tokens are empty → no send, resolves without throwing.
 * PN-15 — when sendEachForMulticast rejects → caught, never rethrows (fire-and-forget).
 * PN-16 — credential loading prefers FIREBASE_SERVICE_ACCOUNT_PATH over inline JSON.
 * PN-17 — credential loading falls back to FIREBASE_SERVICE_ACCOUNT_JSON when PATH is absent.
 * PN-18 — when neither credential var is set → warns and skips (no crash).
 * PN-21 — dead-token error (UNREGISTERED) → clearPushToken called with the matching userId/deviceId.
 * PN-22 — non-dead-token failure → clearPushToken NOT called.
 * PN-23 — clearPushToken rejection is isolated (purge error never escapes fire-and-forget).
 */

import { Logger } from '@nestjs/common';
import { FcmNotificationAdapter } from './fcm-notification.adapter';
import type { RecipientResolver, PushRecipient } from './recipient-resolver';
import type { AuthRepositoryPort } from '../../auth/domain/auth-repository.port';
import type { NovedadCreatedPayload } from '../domain/notification.port';

// ---------------------------------------------------------------------------
// firebase-admin mock — module-level, so the dynamic require() returns this
// ---------------------------------------------------------------------------
const mockSendEachForMulticast = jest.fn();
const mockCert = jest.fn().mockReturnValue({ _isCert: true });
const mockInitializeApp = jest.fn();
const mockApps: unknown[] = [];

// Named factory so PN-12 can restore the standard mock after swapping in a
// throwing factory (module-not-found simulation) inside an isolated registry.
const mockFirebaseAdminFactory = () => ({
  apps: mockApps,
  credential: { cert: mockCert },
  initializeApp: mockInitializeApp,
  messaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
});

jest.mock('firebase-admin', () => mockFirebaseAdminFactory());

// ---------------------------------------------------------------------------
// fs mock — used for FIREBASE_SERVICE_ACCOUNT_PATH loading
// ---------------------------------------------------------------------------
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  readFileSync: jest.fn(),
}));

import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PAYLOAD: NovedadCreatedPayload = {
  novedadId: 'nov-uuid-1',
  tipoNovedad: 'HORAS_EXTRA',
  horasExtra: '2.50',
  supervisorId: 'sup-1',
  zoneId: 'zone-1',
};

const LATE_PAYLOAD: NovedadCreatedPayload = {
  novedadId: 'nov-late-1',
  tipoNovedad: 'LLEGADA_TARDE',
  horasExtra: '0',
  minutosTarde: 17,
  supervisorId: 'sup-1',
  zoneId: 'zone-1',
};

const SERVICE_ACCOUNT_OBJ = { type: 'service_account', project_id: 'test-project' };

/** Build PushRecipient tuples from a list of token strings (deterministic ids). */
function toRecipients(tokens: string[]): PushRecipient[] {
  return tokens.map((pushToken, i) => ({
    userId: `user-${i}`,
    deviceId: `device-${i}`,
    pushToken,
  }));
}

function makeAuthRepo(): jest.Mocked<Pick<AuthRepositoryPort, 'clearPushToken'>> {
  return {
    clearPushToken: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build an adapter. Accepts either token strings (auto-mapped to recipient tuples)
 * or explicit PushRecipient tuples. Returns the adapter plus the auth-repo spy.
 */
function makeAdapterWithRepo(
  tokensOrRecipients: string[] | PushRecipient[] = ['tok-a', 'tok-b'],
  authRepo: jest.Mocked<Pick<AuthRepositoryPort, 'clearPushToken'>> = makeAuthRepo(),
): { adapter: FcmNotificationAdapter; authRepo: jest.Mocked<Pick<AuthRepositoryPort, 'clearPushToken'>> } {
  const recipients: PushRecipient[] =
    tokensOrRecipients.length > 0 && typeof tokensOrRecipients[0] === 'string'
      ? toRecipients(tokensOrRecipients as string[])
      : (tokensOrRecipients as PushRecipient[]);

  const resolver = {
    getActivePushTokens: jest.fn().mockResolvedValue(recipients),
  } as unknown as RecipientResolver;

  const adapter = new FcmNotificationAdapter(resolver, authRepo as unknown as AuthRepositoryPort);
  return { adapter, authRepo };
}

function makeAdapter(tokens: string[] = ['tok-a', 'tok-b']): FcmNotificationAdapter {
  return makeAdapterWithRepo(tokens).adapter;
}

// ---------------------------------------------------------------------------
// Shared env helpers
// ---------------------------------------------------------------------------
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ---------------------------------------------------------------------------
// PN-11 / PN-12 — FIREBASE_ENABLED not set (default, safe path)
// ---------------------------------------------------------------------------
describe('FcmNotificationAdapter (FIREBASE_ENABLED not set)', () => {
  let adapter: FcmNotificationAdapter;

  beforeEach(() => {
    adapter = new FcmNotificationAdapter(
      undefined as unknown as RecipientResolver,
      undefined as unknown as AuthRepositoryPort,
    );
  });

  it('PN-11 — notifyNovedadCreated resolves without throwing when Firebase is not configured', async () => {
    const orig = process.env.FIREBASE_ENABLED;
    delete process.env.FIREBASE_ENABLED;
    try {
      await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
    } finally {
      if (orig !== undefined) process.env.FIREBASE_ENABLED = orig;
    }
  });

  it('PN-12 — import-safety: module loads, instantiates, and send degrades gracefully when firebase-admin is unavailable', async () => {
    // Isolated module registry where ANY require('firebase-admin') throws —
    // a real module-not-found simulation. A top-level `import 'firebase-admin'`
    // in the adapter would make the require() of the adapter module below throw,
    // so this test genuinely pins the import-safety invariant.
    jest.resetModules();
    jest.doMock('firebase-admin', () => {
      throw new Error("Cannot find module 'firebase-admin'");
    });

    const origEnabled = process.env.FIREBASE_ENABLED;
    const origJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    process.env.FIREBASE_ENABLED = 'true';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(SERVICE_ACCOUNT_OBJ);

    let warnSpy: jest.SpyInstance | undefined;
    try {
      // Spy on the Logger class of the SAME fresh registry the adapter will use.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const common = require('@nestjs/common') as typeof import('@nestjs/common');
      warnSpy = jest.spyOn(common.Logger.prototype, 'warn').mockImplementation(() => undefined);

      // (1) Requiring the adapter module succeeds (no top-level firebase-admin import).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./fcm-notification.adapter') as typeof import('./fcm-notification.adapter');

      // (2) Instantiation succeeds.
      const resolver = {
        getActivePushTokens: jest.fn().mockResolvedValue(toRecipients(['tok-a'])),
      } as unknown as RecipientResolver;
      const isolatedAdapter = new mod.FcmNotificationAdapter(
        resolver,
        makeAuthRepo() as unknown as AuthRepositoryPort,
      );

      // (3) Sending with FIREBASE_ENABLED=true resolves (never throws) and warns.
      await expect(isolatedAdapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('firebase-admin could not be loaded'),
      );
    } finally {
      warnSpy?.mockRestore();
      // Restore the standard firebase-admin mock for the rest of the suite.
      jest.doMock('firebase-admin', () => mockFirebaseAdminFactory());
      jest.resetModules();
      if (origEnabled === undefined) delete process.env.FIREBASE_ENABLED;
      else process.env.FIREBASE_ENABLED = origEnabled;
      if (origJson === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = origJson;
    }
  });
});

// ---------------------------------------------------------------------------
// PN-13…PN-18 — FIREBASE_ENABLED=true paths
// ---------------------------------------------------------------------------
describe('FcmNotificationAdapter (FIREBASE_ENABLED=true)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset apps array — simulates not-yet-initialized firebase
    mockApps.length = 0;
    // Default: use inline JSON credential
    setEnv({
      FIREBASE_ENABLED: 'true',
      FIREBASE_SERVICE_ACCOUNT_PATH: undefined,
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT_OBJ),
    });
    // Default: successful batch send
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
  });

  afterEach(() => {
    setEnv({
      FIREBASE_ENABLED: undefined,
      FIREBASE_SERVICE_ACCOUNT_PATH: undefined,
      FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
    });
  });

  it('PN-13 — sends multicast with correct title, body, data, and tokens', async () => {
    const adapter = makeAdapter(['token-1', 'token-2']);
    await adapter.notifyNovedadCreated(PAYLOAD);

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const sentMessage = mockSendEachForMulticast.mock.calls[0][0];

    expect(sentMessage.notification.title).toBe('Nueva novedad de horas extra');
    expect(sentMessage.notification.body).toBe(
      'Se registraron 2.50 horas extra pendientes de aprobación.',
    );
    expect(sentMessage.data).toEqual({
      novedadId: 'nov-uuid-1',
      tipoNovedad: 'HORAS_EXTRA',
      type: 'NOVEDAD_CREATED',
    });
    expect(sentMessage.tokens).toEqual(['token-1', 'token-2']);
  });

  it('PN-13b — LLEGADA_TARDE payload → late-arrival title/body and tipoNovedad in data', async () => {
    const adapter = makeAdapter(['token-1']);
    await adapter.notifyNovedadCreated(LATE_PAYLOAD);

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const sentMessage = mockSendEachForMulticast.mock.calls[0][0];

    expect(sentMessage.notification.title).toBe('Nueva llegada tarde');
    expect(sentMessage.notification.body).toBe(
      'Se registró una llegada tarde de 17 minutos pendiente de revisión.',
    );
    expect(sentMessage.data).toEqual({
      novedadId: 'nov-late-1',
      tipoNovedad: 'LLEGADA_TARDE',
      type: 'NOVEDAD_CREATED',
    });
  });

  it('PN-14 — when tokens are empty → sendEachForMulticast is never called', async () => {
    const adapter = makeAdapter([]); // no tokens
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('PN-15 — when sendEachForMulticast rejects → caught, does not throw (fire-and-forget)', async () => {
    mockSendEachForMulticast.mockRejectedValue(new Error('FCM network error'));
    const adapter = makeAdapter(['tok-x']);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
  });

  it('PN-15b — thrown-batch tokens are counted in the failure metric of the summary log (and are not purge candidates)', async () => {
    mockSendEachForMulticast.mockRejectedValue(new Error('FCM network error'));
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const { adapter, authRepo } = makeAdapterWithRepo(['tok-x', 'tok-y']);
      await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
      // The whole 2-token batch threw → the summary log must report Failure: 2, not 0.
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failure: 2'));
      // Thrown batches carry no per-token verdict — they must NEVER be purge candidates.
      expect(authRepo.clearPushToken).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('PN-30 — SDK returns fewer responses than tokens sent → batch results discarded, no purge (index alignment protected)', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'u-a', deviceId: 'd-a', pushToken: 'tok-a' },
      { userId: 'u-b', deviceId: 'd-b', pushToken: 'tok-b' },
    ];
    // SDK contract violation: 2 tokens sent, only 1 response returned. Trusting it
    // would shift indices and could purge the WRONG recipient's token.
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const { adapter, authRepo } = makeAdapterWithRepo(recipients);
      await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
      // Misaligned batch → no per-token verdicts trusted → no purge at all.
      expect(authRepo.clearPushToken).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('returned 1 response(s) for 2 token(s)'),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('PN-16 — credential loading prefers FIREBASE_SERVICE_ACCOUNT_PATH over inline JSON', async () => {
    setEnv({
      FIREBASE_SERVICE_ACCOUNT_PATH: '/fake/path/service-account.json',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'SHOULD_NOT_BE_USED' }),
    });
    const pathAccountJson = JSON.stringify({ type: 'service_account', project_id: 'from-file' });
    (fs.readFileSync as jest.Mock).mockReturnValue(pathAccountJson);

    const adapter = makeAdapter(['tok-a']);
    await adapter.notifyNovedadCreated(PAYLOAD);

    // readFileSync called with the resolved path
    expect(fs.readFileSync as jest.Mock).toHaveBeenCalled();
    // cert called with the parsed object from file (not inline JSON)
    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'from-file' }),
    );
  });

  it('PN-17 — credential loading falls back to FIREBASE_SERVICE_ACCOUNT_JSON when PATH absent', async () => {
    setEnv({
      FIREBASE_SERVICE_ACCOUNT_PATH: undefined,
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT_OBJ),
    });
    const adapter = makeAdapter(['tok-a']);
    await adapter.notifyNovedadCreated(PAYLOAD);

    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'test-project' }),
    );
    expect(fs.readFileSync as jest.Mock).not.toHaveBeenCalled();
  });

  it('PN-18 — when neither credential var is set → warns and skips without crashing', async () => {
    setEnv({
      FIREBASE_SERVICE_ACCOUNT_PATH: undefined,
      FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
    });
    const adapter = makeAdapter(['tok-a']);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('PN-19 — initializeApp is called only once when apps is empty', async () => {
    // First call initializes
    mockApps.length = 0;
    const adapter = makeAdapter(['tok-a']);
    await adapter.notifyNovedadCreated(PAYLOAD);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);

    // Second call — simulate apps already populated
    mockApps.push({ name: '[DEFAULT]' });
    await adapter.notifyNovedadCreated(PAYLOAD);
    // Still only called once total
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('PN-20 — failed tokens log a warning with code but do not throw', async () => {
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    const adapter = makeAdapter(['tok-good', 'tok-dead']);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
  });

  it('PN-21 — dead-token error (UNREGISTERED) → clearPushToken called with the matching userId/deviceId', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'user-good', deviceId: 'dev-good', pushToken: 'tok-good' },
      { userId: 'user-dead', deviceId: 'dev-dead', pushToken: 'tok-dead' },
    ];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const { adapter, authRepo } = makeAdapterWithRepo(recipients);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();

    // responses[1] (dead) maps to recipients[1] → clearPushToken(user-dead, dev-dead)
    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(1);
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('user-dead', 'dev-dead');
  });

  it('PN-21b — invalid-registration-token purges, but invalid-argument does NOT (payload bugs must not mass-purge)', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'u-a', deviceId: 'd-a', pushToken: 'tok-a' },
      { userId: 'u-b', deviceId: 'd-b', pushToken: 'tok-b' },
    ];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [
        { success: false, error: { code: 'messaging/invalid-registration-token' } },
        // invalid-argument is ALSO returned for malformed message payloads — a single
        // payload bug would otherwise purge every recipient's token fleet-wide.
        { success: false, error: { code: 'messaging/invalid-argument' } },
      ],
    });

    const { adapter, authRepo } = makeAdapterWithRepo(recipients);
    await adapter.notifyNovedadCreated(PAYLOAD);

    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(1);
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('u-a', 'd-a');
    expect(authRepo.clearPushToken).not.toHaveBeenCalledWith('u-b', 'd-b');
  });

  it('PN-22 — non-dead-token failure (e.g. internal/unavailable) → clearPushToken NOT called', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'u-x', deviceId: 'd-x', pushToken: 'tok-x' },
    ];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
    });

    const { adapter, authRepo } = makeAdapterWithRepo(recipients);
    await adapter.notifyNovedadCreated(PAYLOAD);

    expect(authRepo.clearPushToken).not.toHaveBeenCalled();
  });

  it('PN-27 — chunks >500 tokens into batches of ≤500 (1200 → 500/500/200)', async () => {
    const tokens = Array.from({ length: 1200 }, (_, i) => `tok-${i}`);
    mockSendEachForMulticast.mockImplementation(
      (msg: { tokens: string[] }) =>
        Promise.resolve({
          successCount: msg.tokens.length,
          failureCount: 0,
          responses: msg.tokens.map(() => ({ success: true })),
        }),
    );

    const adapter = makeAdapter(tokens);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(3);
    const sizes = mockSendEachForMulticast.mock.calls.map(
      (call) => (call[0] as { tokens: string[] }).tokens.length,
    );
    expect(sizes).toEqual([500, 500, 200]);
    // Batches preserve order and cover all tokens exactly once
    expect((mockSendEachForMulticast.mock.calls[0][0] as { tokens: string[] }).tokens[0]).toBe('tok-0');
    expect((mockSendEachForMulticast.mock.calls[1][0] as { tokens: string[] }).tokens[0]).toBe('tok-500');
    expect((mockSendEachForMulticast.mock.calls[2][0] as { tokens: string[] }).tokens[499 - 300]).toBe('tok-1199');
  });

  it('PN-28 — dead tokens detected across different batches are all purged', async () => {
    const tokens = Array.from({ length: 600 }, (_, i) => `tok-${i}`);
    const deadTokens = new Set(['tok-0', 'tok-599']); // batch 1 and batch 2
    mockSendEachForMulticast.mockImplementation((msg: { tokens: string[] }) => {
      const responses = msg.tokens.map((t) =>
        deadTokens.has(t)
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true },
      );
      const failureCount = responses.filter((r) => !r.success).length;
      return Promise.resolve({
        successCount: responses.length - failureCount,
        failureCount,
        responses,
      });
    });

    const { adapter, authRepo } = makeAdapterWithRepo(tokens);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(2);
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('user-0', 'device-0');
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('user-599', 'device-599');
  });

  it('PN-29 — a rejecting batch does not prevent remaining batches from sending (and their purges still run)', async () => {
    const tokens = Array.from({ length: 1000 }, (_, i) => `tok-${i}`);
    let call = 0;
    mockSendEachForMulticast.mockImplementation((msg: { tokens: string[] }) => {
      call += 1;
      if (call === 1) {
        return Promise.reject(new Error('FCM batch outage'));
      }
      // Second batch: last token is dead
      const responses = msg.tokens.map((t) =>
        t === 'tok-999'
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true },
      );
      return Promise.resolve({
        successCount: responses.length - 1,
        failureCount: 1,
        responses,
      });
    });

    const { adapter, authRepo } = makeAdapterWithRepo(tokens);
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();

    // Both batches attempted despite batch 1 rejecting
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    // Dead token from batch 2 still purged with the CORRECT recipient (index alignment kept)
    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(1);
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('user-999', 'device-999');
  });

  it('PN-23 — clearPushToken rejection is isolated (purge error never escapes fire-and-forget)', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'u-dead', deviceId: 'd-dead', pushToken: 'tok-dead' },
    ];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    const authRepo = {
      clearPushToken: jest.fn().mockRejectedValue(new Error('DB down')),
    } as jest.Mocked<Pick<AuthRepositoryPort, 'clearPushToken'>>;

    const { adapter } = makeAdapterWithRepo(recipients, authRepo);
    // Must resolve (never rethrow) even though the purge itself rejects
    await expect(adapter.notifyNovedadCreated(PAYLOAD)).resolves.toBeUndefined();
    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(1);
  });
});
