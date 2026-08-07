import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import { InventoryIdempotencyConflictError } from '../domain/inventory-command';
import { PrismaInventoryCommandRepository } from './prisma-inventory-command.repository';

const INPUT = {
  actor: {
    userId: 'user-1',
    role: 'SUPERVISOR' as const,
    supervisorId: 'sup-1',
    deviceId: 'device-1',
  },
  event: {
    clientEventId: '16d047b6-49e4-4a53-9e23-e579cb193463',
    schemaVersion: 1,
    type: 'FIELD_ISSUE' as const,
    assignmentId: 'ac0b3734-c4a3-4a31-bfcc-1b6664d249c3',
    productId: 'ef3fed38-a78d-49d9-9ddb-bdfde70dc663',
    unitVersionId: '3513bc6e-d257-485a-977c-dad3533c7ac5',
    quantity: '2.5',
    capturedAtUtc: '2026-08-07T06:00:00.000Z',
    capturedOffsetMin: -300,
    verificationMethod: 'BIOMETRIC' as const,
    latitude: 8.75,
    longitude: -75.88,
    accuracyMeters: 8,
  },
  requestHash: 'a'.repeat(64),
  payload: { quantity: '2.5' },
};

function command(overrides: Record<string, unknown> = {}) {
  return {
    id: 'command-1',
    actorUserId: 'user-1',
    requestHash: 'a'.repeat(64),
    result: null,
    ...overrides,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    inventoryCommand: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(command()),
      update: jest.fn().mockResolvedValue(command()),
    },
    inventoryLocationAssignment: {
      findUnique: jest.fn().mockResolvedValue({
        id: INPUT.event.assignmentId,
        userId: 'user-1',
        supervisorId: 'sup-1',
        locationId: 'location-1',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
        location: { id: 'location-1', active: true, inventoryEnabled: true, zoneId: 'zone-1' },
      }),
    },
    productUnitVersion: {
      findUnique: jest.fn().mockResolvedValue({
        id: INPUT.event.unitVersionId,
        productId: INPUT.event.productId,
        factorToBase: new Prisma.Decimal('2'),
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
        product: { active: true },
      }),
    },
    inventoryBalance: { upsert: jest.fn() },
    inventoryMovement: {
      create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'balance-1' }]),
    ...overrides,
  };
  return tx;
}

function repository(tx: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: jest.fn(async (callback: (value: unknown) => unknown) => callback(tx)),
    inventoryCommand: { findMany: jest.fn() },
  } as unknown as PrismaService;
  return new PrismaInventoryCommandRepository(prisma);
}

describe('PrismaInventoryCommandRepository', () => {
  it('returns the persisted result for an identical replay without repeating effects', async () => {
    const persisted = {
      clientEventId: INPUT.event.clientEventId,
      commandId: 'command-1',
      status: 'APPLIED',
      code: 'APPLIED',
      movementIds: ['movement-1'],
      serverReceivedAt: '2026-08-07T06:00:01.000Z',
    };
    const tx = transaction();
    tx.inventoryCommand.createMany.mockResolvedValue({ count: 0 });
    tx.inventoryCommand.findUniqueOrThrow.mockResolvedValue(command({ result: persisted }));

    await expect(repository(tx).process(INPUT)).resolves.toEqual(persisted);
    expect(tx.inventoryLocationAssignment.findUnique).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different server-computed hash', async () => {
    const tx = transaction();
    tx.inventoryCommand.createMany.mockResolvedValue({ count: 0 });
    tx.inventoryCommand.findUniqueOrThrow.mockResolvedValue(
      command({ requestHash: 'b'.repeat(64) }),
    );

    await expect(repository(tx).process(INPUT)).rejects.toBeInstanceOf(
      InventoryIdempotencyConflictError,
    );
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('preserves insufficient-stock commands for review without a ledger row', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(repository(tx).process(INPUT)).resolves.toMatchObject({
      status: 'NEEDS_REVIEW',
      code: 'INSUFFICIENT_STOCK',
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryCommand.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'NEEDS_REVIEW' }) }),
    );
  });

  it('applies balance and ledger effects before persisting APPLIED', async () => {
    const tx = transaction();
    await expect(repository(tx).process(INPUT)).resolves.toMatchObject({
      status: 'APPLIED',
      movementIds: ['movement-1'],
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantityBase: new Prisma.Decimal('5') }),
      }),
    );
    expect(tx.inventoryCommand.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPLIED' }) }),
    );
  });

  it('never auto-applies damage or loss; it requires review', async () => {
    const tx = transaction();
    await expect(
      repository(tx).process({
        ...INPUT,
        event: { ...INPUT.event, type: 'DAMAGE_OR_LOSS' },
      }),
    ).resolves.toMatchObject({ status: 'NEEDS_REVIEW', code: 'CAPTURE_POLICY_REVIEW' });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
