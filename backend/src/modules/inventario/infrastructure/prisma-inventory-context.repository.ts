import type { PrismaService } from '../../../database/prisma.service';
import type { ScopeContext } from '../../auth/domain/scope-context';
import type {
  InventoryContextRepositoryPort,
  InventoryContextSnapshot,
} from '../domain/inventory-context';

export class PrismaInventoryContextRepository implements InventoryContextRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getForActor(actor: ScopeContext): Promise<InventoryContextSnapshot> {
    const now = new Date();
    const assignmentWhere =
      actor.role === 'SUPERVISOR'
        ? {
            userId: actor.userId,
            supervisorId: actor.supervisorId ?? '__DENY__',
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            location: { active: true, inventoryEnabled: true },
          }
        : { id: { in: [] as string[] } };

    const [products, assignments, pendingReceipts] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { active: true },
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        include: {
          unitVersions: {
            where: {
              validFrom: { lte: now },
              OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            },
            orderBy: [{ unitCode: 'asc' }, { validFrom: 'desc' }],
          },
        },
      }),
      this.prisma.inventoryLocationAssignment.findMany({
        where: assignmentWhere,
        orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
        include: {
          location: {
            include: {
              balances: { orderBy: [{ productId: 'asc' }] },
            },
          },
        },
      }),
      this.prisma.shipment.findMany({
        where: {
          receiverUserId: actor.userId,
          status: { in: ['DISPATCHED', 'PARTIALLY_RECEIVED'] },
        },
        include: {
          destinationLocation: true,
          items: {
            include: { product: true },
            orderBy: [{ product: { sku: 'asc' } }],
          },
        },
        orderBy: [{ dispatchedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      schemaVersion: 1,
      serverTime: now.toISOString(),
      products: products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        baseUnitCode: product.baseUnitCode,
        updatedAt: product.updatedAt.toISOString(),
      })),
      units: products.flatMap((product) =>
        product.unitVersions.map((unit) => ({
          id: unit.id,
          productId: product.id,
          unitCode: unit.unitCode,
          factorToBase: unit.factorToBase.toString(),
          validFrom: unit.validFrom.toISOString(),
          validUntil: unit.validUntil?.toISOString() ?? null,
        })),
      ),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        locationId: assignment.locationId,
        locationCode: assignment.location.code,
        locationName: assignment.location.name,
        supervisorId: assignment.supervisorId,
        version: assignment.version,
        validFrom: assignment.validFrom.toISOString(),
        validUntil: assignment.validUntil?.toISOString() ?? null,
      })),
      balances: assignments.flatMap((assignment) =>
        assignment.location.balances.map((balance) => ({
          locationId: balance.locationId,
          productId: balance.productId,
          quantityBase: balance.quantityBase.toString(),
          version: balance.version,
          updatedAt: balance.updatedAt.toISOString(),
        })),
      ),
      pendingReceipts: pendingReceipts.map((shipment) => ({
        id: shipment.id,
        code: shipment.code,
        status: shipment.status as 'DISPATCHED' | 'PARTIALLY_RECEIVED',
        destinationLocationId: shipment.destinationLocationId,
        destinationCode: shipment.destinationLocation.code,
        destinationName: shipment.destinationLocation.name,
        dispatchedAt: shipment.dispatchedAt?.toISOString() ?? null,
        items: shipment.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productSku: item.product.sku,
          productName: item.product.name,
          quantityBase: item.quantityBase.toString(),
          receivedBase: item.receivedBase.toString(),
          damagedBase: item.damagedBase.toString(),
          lostBase: item.lostBase.toString(),
        })),
      })),
    };
  }
}
