import { BadRequestException, ConflictException } from '@nestjs/common';
import { ROLES_KEY } from '../../iam/interface/roles.decorator';
import type { SyncInventoryUseCase } from '../application/sync-inventory.use-case';
import type { GetInventoryContextUseCase } from '../application/get-inventory-context.use-case';
import {
  InventoryIdempotencyConflictError,
  InventoryInputError,
} from '../domain/inventory-command';
import { InventoryController } from './inventory.controller';

function useCase(): jest.Mocked<SyncInventoryUseCase> {
  return {
    execute: jest.fn().mockResolvedValue([]),
    findStatuses: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<SyncInventoryUseCase>;
}

function contextUseCase(): jest.Mocked<GetInventoryContextUseCase> {
  return {
    execute: jest.fn().mockResolvedValue({ schemaVersion: 1 }),
  } as unknown as jest.Mocked<GetInventoryContextUseCase>;
}

describe('InventoryController', () => {
  it('allows supervisors and coordinators to load their mobile inventory context', () => {
    expect(Reflect.getMetadata(ROLES_KEY, InventoryController.prototype.context)).toEqual([
      'SUPERVISOR',
      'COORDINADOR',
    ]);
  });

  it.each(['sync', 'statuses'] as const)('%s declares explicit SUPERVISOR access', (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, InventoryController.prototype[method])).toEqual([
      'SUPERVISOR',
    ]);
  });

  it('returns item-level sync results', async () => {
    const service = useCase();
    service.execute.mockResolvedValue([
      {
        clientEventId: '16d047b6-49e4-4a53-9e23-e579cb193463',
        commandId: 'command-1',
        status: 'APPLIED',
        code: 'APPLIED',
        movementIds: ['movement-1'],
        serverReceivedAt: '2026-08-07T06:00:00.000Z',
      },
    ]);
    await expect(new InventoryController(service, contextUseCase()).sync({ events: [{}] })).resolves.toEqual({
      results: [expect.objectContaining({ status: 'APPLIED' })],
    });
  });

  it('maps idempotency-key reuse to HTTP 409', async () => {
    const service = useCase();
    service.execute.mockRejectedValue(
      new InventoryIdempotencyConflictError('16d047b6-49e4-4a53-9e23-e579cb193463'),
    );
    await expect(
      new InventoryController(service, contextUseCase()).sync({ events: [{}] }),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps only input failures to HTTP 400', async () => {
    const service = useCase();
    service.findStatuses.mockRejectedValue(new InventoryInputError('invalid ids'));
    const controller = new InventoryController(service, contextUseCase());
    await expect(controller.statuses({ ids: 'bad' })).rejects.toBeInstanceOf(BadRequestException);

    service.findStatuses.mockRejectedValue(new Error('database unavailable'));
    await expect(controller.statuses({ ids: 'bad' })).rejects.toThrow('database unavailable');
  });
});
