import type { PrismaService } from '../../../database/prisma.service';
import { PrismaInventoryContextRepository } from './prisma-inventory-context.repository';

describe('PrismaInventoryContextRepository', () => {
  it('returns only active assignments owned by the authenticated supervisor', async () => {
    const productQuery = Promise.resolve([]);
    const assignmentQuery = Promise.resolve([]);
    const prisma = {
      product: { findMany: jest.fn().mockReturnValue(productQuery) },
      inventoryLocationAssignment: {
        findMany: jest.fn().mockReturnValue(assignmentQuery),
      },
      $transaction: jest.fn().mockResolvedValue([
        [
          {
            id: 'product-1',
            sku: 'BAG-01',
            name: 'Bag',
            baseUnitCode: 'UNIT',
            updatedAt: new Date('2026-08-07T06:00:00.000Z'),
            unitVersions: [
              {
                id: 'unit-1',
                unitCode: 'UNIT',
                factorToBase: { toString: () => '1' },
                validFrom: new Date('2026-01-01T00:00:00.000Z'),
                validUntil: null,
              },
            ],
          },
        ],
        [
          {
            id: 'assignment-1',
            locationId: 'location-1',
            supervisorId: 'supervisor-1',
            version: 2,
            validFrom: new Date('2026-08-01T00:00:00.000Z'),
            validUntil: null,
            location: {
              code: 'FIELD-01',
              name: 'Field stock',
              balances: [
                {
                  locationId: 'location-1',
                  productId: 'product-1',
                  quantityBase: { toString: () => '12.5' },
                  version: 4,
                  updatedAt: new Date('2026-08-07T06:01:00.000Z'),
                },
              ],
            },
          },
        ],
      ]),
    } as unknown as PrismaService;

    const snapshot = await new PrismaInventoryContextRepository(prisma).getForActor({
      userId: 'user-1',
      role: 'SUPERVISOR',
      supervisorId: 'supervisor-1',
      deviceId: 'device-1',
    });

    expect(prisma.inventoryLocationAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          supervisorId: 'supervisor-1',
          location: { active: true, inventoryEnabled: true },
        }),
      }),
    );
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      units: [{ factorToBase: '1' }],
      balances: [{ quantityBase: '12.5', version: 4 }],
    });
  });

  it('fails closed when the scope has no supervisor id', async () => {
    const prisma = {
      product: { findMany: jest.fn() },
      inventoryLocationAssignment: { findMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[], []]),
    } as unknown as PrismaService;

    await new PrismaInventoryContextRepository(prisma).getForActor({
      userId: 'user-1',
      role: 'SUPERVISOR',
      deviceId: 'device-1',
    });

    expect(prisma.inventoryLocationAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supervisorId: '__DENY__' }),
      }),
    );
  });
});
