import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import {
  InventoryIdempotencyConflictError,
  type InventoryCommandRepositoryPort,
  type InventorySyncResult,
} from '../domain/inventory-command';
import { SyncInventoryUseCase } from './sync-inventory.use-case';

const EVENT = {
  clientEventId: '16d047b6-49e4-4a53-9e23-e579cb193463',
  schemaVersion: 1,
  type: 'FIELD_ISSUE',
  assignmentId: 'ac0b3734-c4a3-4a31-bfcc-1b6664d249c3',
  productId: 'ef3fed38-a78d-49d9-9ddb-bdfde70dc663',
  unitVersionId: '3513bc6e-d257-485a-977c-dad3533c7ac5',
  quantity: '2.500000',
  capturedAtUtc: '2026-08-07T06:00:00.000Z',
  capturedOffsetMin: -300,
  verificationMethod: 'BIOMETRIC',
  latitude: 8.75,
  longitude: -75.88,
  accuracyMeters: 8,
};

function holder(): ScopeContextHolder {
  return {
    current: jest.fn().mockReturnValue({
      userId: 'user-1',
      role: 'SUPERVISOR',
      supervisorId: 'sup-1',
      deviceId: 'device-1',
    }),
  } as unknown as ScopeContextHolder;
}

function repository(result?: InventorySyncResult): jest.Mocked<InventoryCommandRepositoryPort> {
  return {
    process: jest.fn().mockResolvedValue(
      result ?? {
        clientEventId: EVENT.clientEventId,
        commandId: 'command-1',
        status: 'APPLIED',
        code: 'APPLIED',
        movementIds: ['movement-1'],
        serverReceivedAt: '2026-08-07T06:00:01.000Z',
      },
    ),
    findStatuses: jest.fn().mockResolvedValue([]),
  };
}

describe('SyncInventoryUseCase', () => {
  it('processes valid events after canonicalizing the payload on the server', async () => {
    const repo = repository();
    const result = await new SyncInventoryUseCase(repo, holder()).execute([EVENT]);

    expect(result[0]).toMatchObject({ status: 'APPLIED' });
    expect(repo.process).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        payload: expect.objectContaining({ quantity: '2.5' }),
      }),
    );
  });

  it('returns an item-level rejection without discarding valid neighbors', async () => {
    const repo = repository();
    const results = await new SyncInventoryUseCase(repo, holder()).execute([
      { ...EVENT, clientEventId: 'not-a-uuid' },
      EVENT,
    ]);

    expect(results.map((result) => result.status)).toEqual(['REJECTED_CLIENT_ACTION', 'APPLIED']);
    expect(repo.process).toHaveBeenCalledTimes(1);
  });

  it('returns UNSUPPORTED_SCHEMA without retrying it forever', async () => {
    const repo = repository();
    const results = await new SyncInventoryUseCase(repo, holder()).execute([
      { ...EVENT, schemaVersion: 99 },
    ]);
    expect(results[0]).toMatchObject({
      clientEventId: EVENT.clientEventId,
      status: 'REJECTED_CLIENT_ACTION',
      code: 'UNSUPPORTED_SCHEMA',
    });
    expect(repo.process).not.toHaveBeenCalled();
  });

  it('propagates idempotency-key reuse as a security conflict', async () => {
    const repo = repository();
    repo.process.mockRejectedValue(new InventoryIdempotencyConflictError(EVENT.clientEventId));
    await expect(new SyncInventoryUseCase(repo, holder()).execute([EVENT])).rejects.toThrow(
      InventoryIdempotencyConflictError,
    );
  });

  it('limits batch size before touching the repository', async () => {
    const repo = repository();
    await expect(new SyncInventoryUseCase(repo, holder()).execute([])).rejects.toThrow(
      'between 1 and 25',
    );
    expect(repo.process).not.toHaveBeenCalled();
  });
});
