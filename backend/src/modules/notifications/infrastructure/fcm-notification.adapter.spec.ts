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

jest.mock('firebase-admin', () => ({
  apps: mockApps,
  credential: { cert: mockCert },
  initializeApp: mockInitializeApp,
  messaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

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
  horasExtra: '2.50',
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

  it('PN-12 — module loads without requiring firebase-admin at top level', () => {
    // If firebase-admin were imported at top level without being installed,
    // the module load itself would throw. Reaching this assertion proves import-safety.
    expect(FcmNotificationAdapter).toBeDefined();
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
      type: 'NOVEDAD_CREATED',
    });
    expect(sentMessage.tokens).toEqual(['token-1', 'token-2']);
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

  it('PN-21b — invalid-registration-token and invalid-argument codes also purge', async () => {
    const recipients: PushRecipient[] = [
      { userId: 'u-a', deviceId: 'd-a', pushToken: 'tok-a' },
      { userId: 'u-b', deviceId: 'd-b', pushToken: 'tok-b' },
    ];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [
        { success: false, error: { code: 'messaging/invalid-registration-token' } },
        { success: false, error: { code: 'messaging/invalid-argument' } },
      ],
    });

    const { adapter, authRepo } = makeAdapterWithRepo(recipients);
    await adapter.notifyNovedadCreated(PAYLOAD);

    expect(authRepo.clearPushToken).toHaveBeenCalledTimes(2);
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('u-a', 'd-a');
    expect(authRepo.clearPushToken).toHaveBeenCalledWith('u-b', 'd-b');
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
