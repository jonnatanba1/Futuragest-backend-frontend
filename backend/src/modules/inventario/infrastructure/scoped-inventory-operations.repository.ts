import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type InventoryCommandType,
  type InventoryMovementType,
  type ShipmentStatus,
} from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import type { ScopeContext } from '../../auth/domain/scope-context';
import { redactOpenInventoryCount } from '../domain/blind-inventory-count';
import { hashInventoryPayload } from '../domain/canonical-inventory-event';
import {
  assertAssignmentMatchesLocation,
  assertLocationCanBeCreatedManually,
} from '../domain/inventory-location-policy';
import {
  assertEligibleShipmentReceiver,
  assertMunicipalShipmentOrigin,
  assertShipmentReceiptIdentity,
} from '../domain/inventory-shipment-policy';
import {
  InventoryOperationError,
  type AddProductUnitInput,
  type ApproveCountInput,
  type AssignLocationInput,
  type CountLineInput,
  type CreateLocationInput,
  type CreateProductInput,
  type CreateShipmentInput,
  type ImportOpeningBalancesInput,
  type InventoryOperationsRepositoryPort,
  type OpenCountInput,
  type ReceiveShipmentInput,
  type ResolveCommandInput,
  type ReverseMovementInput,
  type SetStockMinimumInput,
  type StockEntryInput,
  type ShipmentCommandInput,
  type ShipmentLineInput,
  type UpdateProductInput,
  type UpdateLocationInput,
  type UpdateShipmentInput,
} from '../domain/inventory-operations';
import { normalizeInventoryUnitCode } from '../domain/inventory-unit-catalog';
import { applyInventoryScope } from '../domain/inventory-scope-policy';

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

const POSITIVE_MOVEMENTS = new Set<InventoryMovementType>([
  'OPENING_BALANCE',
  'FIELD_RETURN',
  'TRANSFER_IN',
  'COUNT_ADJUSTMENT_IN',
]);

type Tx = Prisma.TransactionClient;

interface ReservedCommand {
  id: string;
  existingResult?: unknown;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function decimal(value: string, options: { allowZero?: boolean } = {}): Prisma.Decimal {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new InventoryOperationError(
      'INVALID_DECIMAL',
      'Quantity must be a non-negative decimal string with at most 6 decimals.',
    );
  }
  const parsed = new Prisma.Decimal(value);
  if (options.allowZero ? parsed.isNegative() : parsed.lte(0)) {
    throw new InventoryOperationError(
      'INVALID_DECIMAL',
      options.allowZero ? 'Quantity cannot be negative.' : 'Quantity must be greater than zero.',
    );
  }
  return parsed;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new InventoryOperationError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

function colombiaBusinessDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function commandResult(commandId: string, code: string, movementIds: string[] = []) {
  return {
    commandId,
    status: 'APPLIED',
    code,
    movementIds,
    serverReceivedAt: new Date().toISOString(),
  };
}

function serializeProduct(product: {
  id: string;
  sku: string;
  name: string;
  baseUnitCode: string;
  active: boolean;
  deactivatedAt: Date | null;
  updatedAt: Date;
  unitVersions?: Array<{
    id: string;
    unitCode: string;
    factorToBase: Prisma.Decimal;
    isBase: boolean;
    validFrom: Date;
    validUntil: Date | null;
  }>;
}) {
  return {
    ...product,
    deactivatedAt: product.deactivatedAt?.toISOString() ?? null,
    updatedAt: product.updatedAt.toISOString(),
    unitVersions: product.unitVersions?.map((unit) => ({
      ...unit,
      factorToBase: unit.factorToBase.toString(),
      validFrom: unit.validFrom.toISOString(),
      validUntil: unit.validUntil?.toISOString() ?? null,
    })),
  };
}

function shipmentInclude() {
  return {
    originLocation: true,
    destinationLocation: true,
    inTransitLocation: true,
    createdBy: { select: { id: true, email: true, displayName: true } },
    dispatchedBy: { select: { id: true, email: true, displayName: true } },
    receiver: {
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        coordinatedZoneId: true,
        supervisor: { select: { id: true, zoneId: true, municipioId: true } },
      },
    },
    items: {
      include: { product: true, unitVersion: true },
      orderBy: [{ product: { sku: 'asc' as const } }],
    },
    receipts: {
      include: { items: true },
      orderBy: { receivedAt: 'asc' as const },
    },
  };
}

export class ScopedInventoryOperationsRepository implements InventoryOperationsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, SERIALIZABLE_OPTIONS);
  }

  private async reserveCommand(
    tx: Tx,
    actor: ScopeContext,
    clientCommandId: string,
    type: InventoryCommandType,
    payload: Record<string, unknown>,
    locationId?: string,
    zoneId?: string | null,
    capture?: { capturedAtUtc: Date; capturedOffsetMin: number },
  ): Promise<ReservedCommand> {
    const normalizedId = nonEmpty(clientCommandId, 'clientCommandId');
    const requestHash = hashInventoryPayload({ type, ...payload });
    const now = new Date();
    const capturedAtUtc = capture?.capturedAtUtc ?? now;
    const reservation = await tx.inventoryCommand.createMany({
      data: [
        {
          clientCommandId: normalizedId,
          actorUserId: actor.userId,
          deviceId: actor.deviceId,
          locationId,
          zoneId: zoneId ?? undefined,
          supervisorId: actor.supervisorId,
          schemaVersion: 1,
          type,
          payload: asJson(payload),
          requestHash,
          status: 'RECEIVED',
          capturedAtUtc,
          capturedOffsetMin: capture?.capturedOffsetMin ?? -300,
          businessDate: colombiaBusinessDate(capturedAtUtc),
          receivedAt: now,
        },
      ],
      skipDuplicates: true,
    });
    const command = await tx.inventoryCommand.findUniqueOrThrow({
      where: { clientCommandId: normalizedId },
    });
    if (reservation.count === 0) {
      if (command.actorUserId !== actor.userId || command.requestHash !== requestHash) {
        throw new InventoryOperationError(
          'IDEMPOTENCY_KEY_REUSED',
          'The client command ID was already used with a different actor or payload.',
        );
      }
      return { id: command.id, existingResult: command.result ?? undefined };
    }
    return { id: command.id };
  }

  private async finishCommand(
    tx: Tx,
    commandId: string,
    result: unknown,
    status: 'APPLIED' | 'RESOLVED_APPLIED' = 'APPLIED',
  ): Promise<void> {
    await tx.inventoryCommand.update({
      where: { id: commandId },
      data: { status, appliedAt: new Date(), result: asJson(result) },
    });
  }

  private async applyBalanceDelta(
    tx: Tx,
    locationId: string,
    productId: string,
    amount: Prisma.Decimal,
  ): Promise<void> {
    if (amount.isZero()) return;
    if (amount.isPositive()) {
      await tx.inventoryBalance.upsert({
        where: { locationId_productId: { locationId, productId } },
        create: { locationId, productId, quantityBase: amount, version: 1 },
        update: { quantityBase: { increment: amount }, version: { increment: 1 } },
      });
      return;
    }

    const absolute = amount.abs();
    const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "InventoryBalance"
      SET "quantityBase" = "quantityBase" - ${absolute},
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "locationId" = ${locationId}
        AND "productId" = ${productId}
        AND "quantityBase" >= ${absolute}
      RETURNING "id"
    `);
    if (updated.length === 0) {
      throw new InventoryOperationError('INSUFFICIENT_STOCK', 'Insufficient available stock.');
    }
  }

  private movementDelta(type: InventoryMovementType, quantity: Prisma.Decimal): Prisma.Decimal {
    return POSITIVE_MOVEMENTS.has(type) ? quantity : quantity.negated();
  }

  async listProducts(actor: ScopeContext): Promise<unknown> {
    const products = await this.prisma.product.findMany({
      where: applyInventoryScope(actor, 'Product'),
      include: { unitVersions: { orderBy: [{ unitCode: 'asc' }, { validFrom: 'desc' }] } },
      orderBy: [{ active: 'desc' }, { sku: 'asc' }],
    });
    return products.map(serializeProduct);
  }

  async createProduct(actor: ScopeContext, input: CreateProductInput): Promise<unknown> {
    const sku = nonEmpty(input.sku, 'sku').toUpperCase();
    const name = nonEmpty(input.name, 'name');
    const baseUnitCode = normalizeInventoryUnitCode(input.baseUnitCode);
    const product = await this.prisma.product.create({
      data: {
        sku,
        name,
        baseUnitCode,
        unitVersions: {
          create: { unitCode: baseUnitCode, factorToBase: new Prisma.Decimal(1), isBase: true, validFrom: new Date() },
        },
      },
      include: { unitVersions: true },
    });
    return serializeProduct(product);
  }

  async updateProduct(
    actor: ScopeContext,
    id: string,
    input: UpdateProductInput,
  ): Promise<unknown> {
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: input.name === undefined ? undefined : nonEmpty(input.name, 'name'),
        active: input.active,
        deactivatedAt: input.active === false ? new Date() : input.active === true ? null : undefined,
      },
      include: { unitVersions: { orderBy: [{ unitCode: 'asc' }, { validFrom: 'desc' }] } },
    });
    return serializeProduct(product);
  }

  async addProductUnit(
    actor: ScopeContext,
    id: string,
    input: AddProductUnitInput,
  ): Promise<unknown> {
    const unitCode = normalizeInventoryUnitCode(input.unitCode);
    const factorToBase = decimal(input.factorToBase);
    const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
    if (Number.isNaN(validFrom.getTime())) {
      throw new InventoryOperationError('INVALID_INPUT', 'validFrom must be an ISO date.');
    }
    await this.transaction(async (tx) => {
      await tx.product.findUniqueOrThrow({ where: { id } });
      await tx.productUnitVersion.updateMany({
        where: { productId: id, unitCode, validUntil: null },
        data: { validUntil: validFrom },
      });
      await tx.productUnitVersion.create({
        data: { productId: id, unitCode, factorToBase, validFrom, isBase: false },
      });
    });
    return this.listProducts(actor);
  }

  async listLocations(actor: ScopeContext): Promise<unknown> {
    const locations = await this.prisma.inventoryLocation.findMany({
      where: applyInventoryScope(actor, 'InventoryLocation'),
      include: {
        zone: true,
        municipio: true,
        assignments: {
          where: { OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
          include: { user: { select: { id: true, email: true, displayName: true } } },
          orderBy: { validFrom: 'desc' },
        },
      },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
    return locations;
  }

  async listAssignableUsers(actor: ScopeContext): Promise<unknown> {
    return this.prisma.user.findMany({
      where: { role: { in: ['SYSTEM_ADMIN', 'COMPRAS', 'COORDINADOR', 'SUPERVISOR'] } },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        coordinatedZoneId: true,
        supervisor: { select: { id: true, zoneId: true, municipioId: true } },
      },
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }, { email: 'asc' }],
    });
  }

  async createLocation(actor: ScopeContext, input: CreateLocationInput): Promise<unknown> {
    assertLocationCanBeCreatedManually(input.type);
    if (input.municipioId && !input.zoneId) {
      throw new InventoryOperationError('INVALID_INPUT', 'zoneId is required with municipioId.');
    }
    return this.prisma.inventoryLocation.create({
      data: {
        code: nonEmpty(input.code, 'code').toUpperCase(),
        name: nonEmpty(input.name, 'name'),
        type: input.type,
        zoneId: input.zoneId,
        municipioId: input.municipioId,
      },
      include: { zone: true, municipio: true },
    });
  }

  async updateLocation(
    actor: ScopeContext,
    id: string,
    input: UpdateLocationInput,
  ): Promise<unknown> {
    return this.prisma.inventoryLocation.update({
      where: { id },
      data: {
        name: input.name === undefined ? undefined : nonEmpty(input.name, 'name'),
        active: input.active,
        inventoryEnabled: input.inventoryEnabled,
      },
      include: { zone: true, municipio: true },
    });
  }

  async assignLocation(
    actor: ScopeContext,
    id: string,
    input: AssignLocationInput,
  ): Promise<unknown> {
    const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
    if (Number.isNaN(validFrom.getTime())) {
      throw new InventoryOperationError('INVALID_INPUT', 'validFrom must be an ISO date.');
    }
    return this.transaction(async (tx) => {
      const location = await tx.inventoryLocation.findUniqueOrThrow({ where: { id } });
      const supervisor = input.supervisorId
        ? await tx.supervisor.findUnique({
            where: { id: input.supervisorId },
            select: { id: true, userId: true, zoneId: true, municipioId: true },
          })
        : null;
      assertAssignmentMatchesLocation(location, input, supervisor);
      const previous = await tx.inventoryLocationAssignment.findFirst({
        where: { locationId: id, userId: input.userId, validUntil: null },
        orderBy: { version: 'desc' },
      });
      if (previous) {
        await tx.inventoryLocationAssignment.update({
          where: { id: previous.id },
          data: { validUntil: validFrom },
        });
      }
      return tx.inventoryLocationAssignment.create({
        data: {
          locationId: id,
          userId: input.userId,
          supervisorId: input.supervisorId,
          role: input.role,
          deviceId: input.deviceId,
          validFrom,
          version: (previous?.version ?? 0) + 1,
        },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      });
    });
  }

  async setStockMinimum(actor: ScopeContext, input: SetStockMinimumInput): Promise<unknown> {
    const quantityBase = decimal(input.quantityBase, { allowZero: true });
    return this.prisma.stockMinimum.upsert({
      where: { locationId_productId: { locationId: input.locationId, productId: input.productId } },
      create: { locationId: input.locationId, productId: input.productId, quantityBase },
      update: { quantityBase },
      include: { location: true, product: true },
    });
  }

  async recordStockEntry(actor: ScopeContext, input: StockEntryInput): Promise<unknown> {
    const quantity = decimal(input.quantity);
    const note = input.note?.trim() || undefined;
    return this.transaction(async (tx) => {
      const location = await tx.inventoryLocation.findFirst({
        where: applyInventoryScope(actor, 'InventoryLocation', {
          id: input.locationId,
          active: true,
          inventoryEnabled: true,
          type: 'CENTRAL_WAREHOUSE',
        }),
      });
      if (!location) {
        throw new InventoryOperationError('INVALID_LOCATION', 'Stock entries can only be recorded in an active central warehouse.');
      }
      const product = await tx.product.findFirst({
        where: applyInventoryScope(actor, 'Product', { id: input.productId, active: true }),
        include: { unitVersions: { where: { id: input.unitVersionId, validUntil: null }, take: 1 } },
      });
      const unitVersion = product?.unitVersions[0];
      if (!product || !unitVersion) {
        throw new InventoryOperationError('INVALID_PRODUCT', 'Product and active unit version are required.');
      }
      const quantityBase = quantity.mul(unitVersion.factorToBase);
      const payload = {
        locationId: location.id,
        productId: product.id,
        unitVersionId: unitVersion.id,
        quantity: quantity.toString(),
        quantityBase: quantityBase.toString(),
        note,
      };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'STOCK_ENTRY',
        payload,
        location.id,
        location.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;
      await this.applyBalanceDelta(tx, location.id, product.id, quantityBase);
      const now = new Date();
      const movement = await tx.inventoryMovement.create({
        data: {
          commandId: reserved.id,
          productId: product.id,
          unitVersionId: unitVersion.id,
          locationId: location.id,
          type: 'STOCK_ENTRY',
          quantityBase,
          capturedAtUtc: now,
          businessDate: colombiaBusinessDate(now),
        },
      });
      const result = commandResult(reserved.id, 'STOCK_ENTRY_APPLIED', [movement.id]);
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async listBalances(actor: ScopeContext): Promise<unknown> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: applyInventoryScope(actor, 'InventoryBalance'),
      include: { location: true, product: true },
      orderBy: [{ location: { code: 'asc' } }, { product: { sku: 'asc' } }],
    });
    return balances.map((balance) => ({
      ...balance,
      quantityBase: balance.quantityBase.toString(),
      updatedAt: balance.updatedAt.toISOString(),
    }));
  }

  async listMovements(actor: ScopeContext, cursor?: string, productId?: string): Promise<unknown> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: applyInventoryScope(actor, 'InventoryMovement', productId ? { productId } : {}),
      include: {
        location: true,
        product: true,
        unitVersion: true,
        command: { select: { clientCommandId: true, actorUserId: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = movements.slice(0, 100);
    return {
      items: page.map((movement) => ({
        ...movement,
        quantityBase: movement.quantityBase.toString(),
        capturedAtUtc: movement.capturedAtUtc.toISOString(),
        createdAt: movement.createdAt.toISOString(),
        unitVersion: {
          ...movement.unitVersion,
          factorToBase: movement.unitVersion.factorToBase.toString(),
        },
      })),
      nextCursor: movements.length > 100 ? page.at(-1)?.id ?? null : null,
    };
  }

  async listAlerts(actor: ScopeContext): Promise<unknown> {
    const minimums = await this.prisma.stockMinimum.findMany({
      where: applyInventoryScope(actor, 'StockMinimum'),
      include: { location: true, product: true },
      orderBy: [{ location: { code: 'asc' } }, { product: { sku: 'asc' } }],
    });
    const balances = await this.prisma.inventoryBalance.findMany({
      where: applyInventoryScope(actor, 'InventoryBalance', {
        OR: minimums.map((minimum) => ({
          locationId: minimum.locationId,
          productId: minimum.productId,
        })),
      }),
    });
    const balanceByKey = new Map(
      balances.map((balance) => [`${balance.locationId}:${balance.productId}`, balance.quantityBase]),
    );
    return minimums.flatMap((minimum) => {
      const balance = balanceByKey.get(`${minimum.locationId}:${minimum.productId}`) ?? new Prisma.Decimal(0);
      if (balance.gt(minimum.quantityBase)) return [];
      return [{
        location: minimum.location,
        product: minimum.product,
        quantityBase: balance.toString(),
        minimumBase: minimum.quantityBase.toString(),
        shortageBase: minimum.quantityBase.minus(balance).toString(),
      }];
    });
  }

  async listReviewCommands(actor: ScopeContext): Promise<unknown> {
    return this.prisma.inventoryCommand.findMany({
      where: applyInventoryScope(actor, 'InventoryCommand', { status: 'NEEDS_REVIEW' }),
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
        location: true,
      },
      orderBy: { receivedAt: 'asc' },
      take: 200,
    });
  }

  async resolveCommand(
    actor: ScopeContext,
    id: string,
    input: ResolveCommandInput,
  ): Promise<unknown> {
    const reason = nonEmpty(input.reason, 'reason');
    return this.transaction(async (tx) => {
      const original = await tx.inventoryCommand.findFirst({
        where: applyInventoryScope(actor, 'InventoryCommand', { id }),
      });
      if (!original) throw new InventoryOperationError('NOT_FOUND', 'Inventory command not found.');
      if (
        original.status === 'RESOLVED_APPLIED' ||
        original.status === 'RESOLVED_DISMISSED'
      ) {
        return original.result;
      }
      if (original.status !== 'NEEDS_REVIEW') {
        throw new InventoryOperationError(
          'INVALID_STATE',
          'Only commands waiting for review can be resolved.',
        );
      }

      const payload = { originalCommandId: id, action: input.action, reason, locationId: input.locationId };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'RESOLUTION',
        payload,
        input.locationId ?? original.locationId ?? undefined,
        original.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;

      if (input.action === 'DISMISS') {
        const result = commandResult(reserved.id, 'RESOLVED_DISMISSED');
        await tx.inventoryCommand.update({
          where: { id: original.id },
          data: {
            status: 'RESOLVED_DISMISSED',
            reviewReason: reason,
            resolvedAt: new Date(),
            resolvedByUserId: actor.userId,
            resolutionCommandId: reserved.id,
          },
        });
        await this.finishCommand(tx, reserved.id, result);
        return result;
      }

      const originalPayload = original.payload as Record<string, unknown>;
      const productId = String(originalPayload.productId ?? '');
      const unitVersionId = String(originalPayload.unitVersionId ?? '');
      const quantity = decimal(String(originalPayload.quantity ?? ''));
      const locationId = input.locationId ?? original.locationId;
      if (!locationId || !productId || !unitVersionId) {
        throw new InventoryOperationError(
          'RESOLUTION_INPUT_REQUIRED',
          'A valid location, product and unit are required to approve this command.',
        );
      }
      const unit = await tx.productUnitVersion.findFirst({
        where: { id: unitVersionId, productId },
      });
      if (!unit) throw new InventoryOperationError('INVALID_UNIT', 'Product unit not found.');
      const quantityBase = quantity.mul(unit.factorToBase);
      const movementType = original.type as InventoryMovementType;
      if (!['FIELD_ISSUE', 'FIELD_RETURN', 'DAMAGE_OR_LOSS'].includes(movementType)) {
        throw new InventoryOperationError(
          'UNSUPPORTED_RESOLUTION',
          `Command type ${original.type} cannot be approved through this workflow.`,
        );
      }
      await this.applyBalanceDelta(
        tx,
        locationId,
        productId,
        this.movementDelta(movementType, quantityBase),
      );
      const movement = await tx.inventoryMovement.create({
        data: {
          commandId: reserved.id,
          productId,
          unitVersionId,
          locationId,
          type: movementType,
          quantityBase,
          capturedAtUtc: original.capturedAtUtc,
          businessDate: original.businessDate,
        },
      });
      const result = commandResult(reserved.id, 'RESOLVED_APPLIED', [movement.id]);
      await tx.inventoryCommand.update({
        where: { id: original.id },
        data: {
          status: 'RESOLVED_APPLIED',
          reviewReason: reason,
          resolvedAt: new Date(),
          resolvedByUserId: actor.userId,
          resolutionCommandId: reserved.id,
        },
      });
      await this.finishCommand(tx, reserved.id, result, 'RESOLVED_APPLIED');
      return result;
    });
  }

  async reverseMovement(
    actor: ScopeContext,
    id: string,
    input: ReverseMovementInput,
  ): Promise<unknown> {
    const reason = nonEmpty(input.reason, 'reason');
    return this.transaction(async (tx) => {
      const movement = await tx.inventoryMovement.findFirst({
        where: applyInventoryScope(actor, 'InventoryMovement', { id }),
      });
      if (!movement) throw new InventoryOperationError('NOT_FOUND', 'Inventory movement not found.');
      if (movement.type === 'REVERSAL') {
        throw new InventoryOperationError('INVALID_STATE', 'A reversal cannot be reversed.');
      }
      const payload = { movementId: id, reason };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'REVERSAL',
        payload,
        movement.locationId,
      );
      if (reserved.existingResult) return reserved.existingResult;

      await this.applyBalanceDelta(
        tx,
        movement.locationId,
        movement.productId,
        this.movementDelta(movement.type, movement.quantityBase).negated(),
      );
      let reversal;
      try {
        reversal = await tx.inventoryMovement.create({
          data: {
            commandId: reserved.id,
            productId: movement.productId,
            unitVersionId: movement.unitVersionId,
            locationId: movement.locationId,
            type: 'REVERSAL',
            quantityBase: movement.quantityBase,
            sourceMovementId: movement.id,
            capturedAtUtc: new Date(),
            businessDate: colombiaBusinessDate(new Date()),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new InventoryOperationError('ALREADY_REVERSED', 'This movement was already reversed.');
        }
        throw error;
      }
      const result = commandResult(reserved.id, 'MOVEMENT_REVERSED', [reversal.id]);
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async reconcile(actor: ScopeContext): Promise<unknown> {
    const [balances, movements] = await this.prisma.$transaction([
      this.prisma.inventoryBalance.findMany({
        where: applyInventoryScope(actor, 'InventoryBalance'),
        include: { location: true, product: true },
      }),
      this.prisma.inventoryMovement.findMany({
        where: applyInventoryScope(actor, 'InventoryMovement'),
        include: { sourceMovement: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const calculated = new Map<string, Prisma.Decimal>();
    for (const movement of movements) {
      const key = `${movement.locationId}:${movement.productId}`;
      let delta: Prisma.Decimal;
      if (movement.type === 'REVERSAL' && movement.sourceMovement) {
        delta = this.movementDelta(
          movement.sourceMovement.type,
          movement.quantityBase,
        ).negated();
      } else {
        delta = this.movementDelta(movement.type, movement.quantityBase);
      }
      calculated.set(key, (calculated.get(key) ?? new Prisma.Decimal(0)).plus(delta));
    }
    const balanceByKey = new Map(
      balances.map((balance) => [`${balance.locationId}:${balance.productId}`, balance]),
    );
    const keys = new Set([...calculated.keys(), ...balanceByKey.keys()]);
    const mismatches = [...keys].flatMap((key) => {
      const projected = calculated.get(key) ?? new Prisma.Decimal(0);
      const balance = balanceByKey.get(key);
      const stored = balance?.quantityBase ?? new Prisma.Decimal(0);
      if (projected.equals(stored)) return [];
      return [{
        locationId: key.split(':')[0],
        productId: key.split(':')[1],
        locationCode: balance?.location.code ?? null,
        productSku: balance?.product.sku ?? null,
        ledgerQuantityBase: projected.toString(),
        balanceQuantityBase: stored.toString(),
        differenceBase: stored.minus(projected).toString(),
      }];
    });
    return { checkedAt: new Date().toISOString(), balanceCount: balances.length, movementCount: movements.length, mismatches };
  }

  async operationalMetrics(actor: ScopeContext): Promise<unknown> {
    const now = new Date();
    const activeShipmentStates: ShipmentStatus[] = [
      'DISPATCHED',
      'PARTIALLY_RECEIVED',
      'DISCREPANCY_REVIEW',
    ];
    const [commandGroups, oldestReview, activeShipments, oldestShipment, pendingCounts] =
      await this.prisma.$transaction([
        this.prisma.inventoryCommand.groupBy({
          by: ['status'],
          where: applyInventoryScope(actor, 'InventoryCommand'),
          orderBy: { status: 'asc' },
          _count: true,
        }),
        this.prisma.inventoryCommand.findFirst({
          where: applyInventoryScope(actor, 'InventoryCommand', { status: 'NEEDS_REVIEW' }),
          orderBy: { receivedAt: 'asc' },
          select: { receivedAt: true },
        }),
        this.prisma.shipment.count({
          where: applyInventoryScope(actor, 'Shipment', { status: { in: activeShipmentStates } }),
        }),
        this.prisma.shipment.findFirst({
          where: applyInventoryScope(actor, 'Shipment', { status: { in: activeShipmentStates } }),
          orderBy: { dispatchedAt: 'asc' },
          select: { dispatchedAt: true },
        }),
        this.prisma.inventoryCount.count({
          where: applyInventoryScope(actor, 'InventoryCount', { status: 'SUBMITTED' }),
        }),
      ]);
    const commands = Object.fromEntries(
      commandGroups.map((group) => [group.status, group._count]),
    );
    return {
      measuredAt: now.toISOString(),
      commands,
      oldestReviewAgeSeconds: oldestReview
        ? Math.floor((now.getTime() - oldestReview.receivedAt.getTime()) / 1_000)
        : null,
      activeShipments,
      oldestActiveShipmentAgeSeconds: oldestShipment?.dispatchedAt
        ? Math.floor((now.getTime() - oldestShipment.dispatchedAt.getTime()) / 1_000)
        : null,
      pendingCountApprovals: pendingCounts,
    };
  }

  private async prepareShipmentItems(tx: Tx, items: ShipmentLineInput[]) {
    if (items.length === 0 || items.length > 200) {
      throw new InventoryOperationError('INVALID_INPUT', 'A shipment requires between 1 and 200 items.');
    }
    const uniqueProducts = new Set(items.map((item) => item.productId));
    if (uniqueProducts.size !== items.length) {
      throw new InventoryOperationError('DUPLICATE_PRODUCT', 'A product can appear only once per shipment.');
    }
    return Promise.all(
      items.map(async (item) => {
        const unit = await tx.productUnitVersion.findFirst({
          where: { id: item.unitVersionId, productId: item.productId },
        });
        if (!unit) {
          throw new InventoryOperationError('INVALID_UNIT', 'A shipment item references an invalid unit.');
        }
        return {
          productId: item.productId,
          unitVersionId: item.unitVersionId,
          quantityBase: decimal(item.quantity).mul(unit.factorToBase),
        };
      }),
    );
  }

  async createShipment(actor: ScopeContext, input: CreateShipmentInput): Promise<unknown> {
    if (input.originLocationId === input.destinationLocationId) {
      throw new InventoryOperationError('INVALID_INPUT', 'Shipment origin and destination must differ.');
    }
    return this.transaction(async (tx) => {
      const [origin, destination, receiver, items] = await Promise.all([
        tx.inventoryLocation.findFirst({ where: { id: input.originLocationId, active: true } }),
        tx.inventoryLocation.findFirst({ where: { id: input.destinationLocationId, active: true } }),
        tx.user.findUnique({
          where: { id: input.receiverUserId },
          select: {
            id: true,
            role: true,
            coordinatedZoneId: true,
            supervisor: { select: { zoneId: true, municipioId: true } },
          },
        }),
        this.prepareShipmentItems(tx, input.items),
      ]);
      if (!origin || !destination) {
        throw new InventoryOperationError('INVALID_LOCATION', 'Shipment location is not active.');
      }
      assertMunicipalShipmentOrigin(origin);
      assertEligibleShipmentReceiver(destination, receiver);
      return tx.shipment.create({
        data: {
          code: `SHP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          originLocationId: origin.id,
          destinationLocationId: destination.id,
          receiverUserId: receiver.id,
          createdByUserId: actor.userId,
          notes: input.notes?.trim() || null,
          items: { create: items },
        },
        include: shipmentInclude(),
      });
    });
  }

  async updateShipment(
    actor: ScopeContext,
    id: string,
    input: UpdateShipmentInput,
  ): Promise<unknown> {
    return this.transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: applyInventoryScope(actor, 'Shipment', { id }),
      });
      if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
      if (shipment.status !== 'DRAFT') {
        throw new InventoryOperationError('INVALID_STATE', 'Only draft shipments can be edited.');
      }
      const destinationId = input.destinationLocationId ?? shipment.destinationLocationId;
      const receiverUserId = input.receiverUserId ?? shipment.receiverUserId;
      if (destinationId === shipment.originLocationId) {
        throw new InventoryOperationError('INVALID_INPUT', 'Shipment origin and destination must differ.');
      }
      const [destination, receiver] = await Promise.all([
        tx.inventoryLocation.findFirst({ where: { id: destinationId, active: true } }),
        receiverUserId
          ? tx.user.findUnique({
              where: { id: receiverUserId },
              select: {
                id: true,
                role: true,
                coordinatedZoneId: true,
                supervisor: { select: { zoneId: true, municipioId: true } },
              },
            })
          : null,
      ]);
      if (!destination) {
        throw new InventoryOperationError('INVALID_LOCATION', 'Destination is not active.');
      }
      assertEligibleShipmentReceiver(destination, receiver);
      if (input.items) {
        const items = await this.prepareShipmentItems(tx, input.items);
        await tx.shipmentItem.deleteMany({ where: { shipmentId: id } });
        await tx.shipmentItem.createMany({
          data: items.map((item) => ({ ...item, shipmentId: id })),
        });
      }
      return tx.shipment.update({
        where: { id },
        data: {
          destinationLocationId: input.destinationLocationId,
          receiverUserId: input.receiverUserId,
          notes: input.notes === undefined ? undefined : input.notes.trim() || null,
        },
        include: shipmentInclude(),
      });
    });
  }

  async dispatchShipment(
    actor: ScopeContext,
    id: string,
    input: ShipmentCommandInput,
  ): Promise<unknown> {
    return this.transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: applyInventoryScope(actor, 'Shipment', { id }),
        include: {
          items: true,
          originLocation: true,
          destinationLocation: true,
          receiver: {
            select: {
              id: true,
              role: true,
              coordinatedZoneId: true,
              supervisor: { select: { zoneId: true, municipioId: true } },
            },
          },
        },
      });
      if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
      if (shipment.status !== 'DRAFT') {
        if (shipment.dispatchCommandId) {
          const command = await tx.inventoryCommand.findUnique({ where: { id: shipment.dispatchCommandId } });
          if (command?.clientCommandId === input.clientCommandId) return command.result;
        }
        throw new InventoryOperationError('INVALID_STATE', 'Only draft shipments can be dispatched.');
      }
      assertMunicipalShipmentOrigin(shipment.originLocation);
      assertEligibleShipmentReceiver(shipment.destinationLocation, shipment.receiver);

      const transit = await tx.inventoryLocation.upsert({
        where: { code: 'SYSTEM-IN-TRANSIT' },
        create: {
          code: 'SYSTEM-IN-TRANSIT',
          name: 'Inventory in transit',
          type: 'IN_TRANSIT',
        },
        update: { active: true },
      });
      const payload = { shipmentId: id, itemCount: shipment.items.length };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'TRANSFER_DISPATCH',
        payload,
        shipment.originLocationId,
        shipment.originLocation.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;

      const movementIds: string[] = [];
      const now = new Date();
      for (const item of shipment.items) {
        await this.applyBalanceDelta(
          tx,
          shipment.originLocationId,
          item.productId,
          item.quantityBase.negated(),
        );
        await this.applyBalanceDelta(tx, transit.id, item.productId, item.quantityBase);
        const movements = await Promise.all([
          tx.inventoryMovement.create({
            data: {
              commandId: reserved.id,
              productId: item.productId,
              unitVersionId: item.unitVersionId,
              locationId: shipment.originLocationId,
              type: 'TRANSFER_OUT',
              quantityBase: item.quantityBase,
              capturedAtUtc: now,
              businessDate: colombiaBusinessDate(now),
            },
          }),
          tx.inventoryMovement.create({
            data: {
              commandId: reserved.id,
              productId: item.productId,
              unitVersionId: item.unitVersionId,
              locationId: transit.id,
              type: 'TRANSFER_IN',
              quantityBase: item.quantityBase,
              capturedAtUtc: now,
              businessDate: colombiaBusinessDate(now),
            },
          }),
        ]);
        movementIds.push(...movements.map((movement) => movement.id));
      }
      const result = commandResult(reserved.id, 'SHIPMENT_DISPATCHED', movementIds);
      await this.finishCommand(tx, reserved.id, result);
      await tx.shipment.update({
        where: { id },
        data: {
          status: 'DISPATCHED',
          inTransitLocationId: transit.id,
          dispatchedByUserId: actor.userId,
          dispatchCommandId: reserved.id,
          dispatchedAt: now,
        },
      });
      return result;
    });
  }

  async cancelShipment(actor: ScopeContext, id: string): Promise<unknown> {
    const shipment = await this.prisma.shipment.findFirst({
      where: applyInventoryScope(actor, 'Shipment', { id }),
    });
    if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
    if (shipment.status !== 'DRAFT') {
      throw new InventoryOperationError('INVALID_STATE', 'Only draft shipments can be cancelled.');
    }
    return this.prisma.shipment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: shipmentInclude(),
    });
  }

  async listShipments(actor: ScopeContext): Promise<unknown> {
    return this.prisma.shipment.findMany({
      where: applyInventoryScope(actor, 'Shipment'),
      include: shipmentInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  async getShipment(actor: ScopeContext, id: string): Promise<unknown> {
    const shipment = await this.prisma.shipment.findFirst({
      where: applyInventoryScope(actor, 'Shipment', { id }),
      include: shipmentInclude(),
    });
    if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
    return shipment;
  }

  async receiveShipment(
    actor: ScopeContext,
    id: string,
    input: ReceiveShipmentInput,
  ): Promise<unknown> {
    if (input.items.length === 0) {
      throw new InventoryOperationError('INVALID_INPUT', 'Receipt items are required.');
    }
    return this.transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: applyInventoryScope(actor, 'Shipment', { id }),
        include: { items: true, destinationLocation: true },
      });
      if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
      assertShipmentReceiptIdentity(
        shipment.receiverUserId,
        actor.userId,
        input.verificationMethod,
      );
      if (!['DISPATCHED', 'PARTIALLY_RECEIVED'].includes(shipment.status)) {
        const previous = await tx.shipmentReceipt.findUnique({
          where: { clientCommandId: input.clientCommandId },
        });
        if (previous) return previous.result;
        throw new InventoryOperationError('INVALID_STATE', 'Shipment is not open for receipt.');
      }
      if (shipment.dispatchedByUserId === actor.userId && actor.role !== 'SYSTEM_ADMIN') {
        throw new InventoryOperationError(
          'SEPARATION_OF_DUTIES',
          'The dispatcher cannot confirm receipt of the same shipment.',
        );
      }
      if (!shipment.inTransitLocationId) {
        throw new InventoryOperationError('INVALID_STATE', 'Shipment has no transit location.');
      }
      const uniqueLines = new Set(input.items.map((line) => line.shipmentItemId));
      if (uniqueLines.size !== input.items.length) {
        throw new InventoryOperationError('DUPLICATE_ITEM', 'Receipt lines must be unique.');
      }

      const parsed = input.items.map((line) => {
        const item = shipment.items.find((candidate) => candidate.id === line.shipmentItemId);
        if (!item) throw new InventoryOperationError('INVALID_ITEM', 'Receipt item does not belong to shipment.');
        const received = decimal(line.receivedBase, { allowZero: true });
        const damaged = decimal(line.damagedBase ?? '0', { allowZero: true });
        const missing = decimal(line.missingBase ?? '0', { allowZero: true });
        const submitted = received.plus(damaged).plus(missing);
        if (submitted.isZero()) {
          throw new InventoryOperationError('INVALID_INPUT', 'A receipt line must account for a positive quantity.');
        }
        const prior = item.receivedBase.plus(item.damagedBase).plus(item.lostBase);
        if (prior.plus(submitted).gt(item.quantityBase)) {
          throw new InventoryOperationError('RECEIPT_EXCEEDS_PENDING', 'Receipt exceeds the pending shipment quantity.');
        }
        return { item, received, damaged, missing };
      });

      const payload = {
        shipmentId: id,
        verificationMethod: input.verificationMethod,
        verificationReason: input.verificationReason?.trim() || undefined,
        capturedAtUtc: input.capturedAtUtc,
        capturedOffsetMin: input.capturedOffsetMin,
        items: parsed.map((line) => ({
          shipmentItemId: line.item.id,
          receivedBase: line.received.toString(),
          damagedBase: line.damaged.toString(),
          missingBase: line.missing.toString(),
        })),
      };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'TRANSFER_RECEIPT',
        payload,
        shipment.destinationLocationId,
        shipment.destinationLocation.zoneId,
        {
          capturedAtUtc: new Date(input.capturedAtUtc),
          capturedOffsetMin: input.capturedOffsetMin,
        },
      );
      if (reserved.existingResult) return reserved.existingResult;

      const now = new Date();
      const capturedAtUtc = new Date(input.capturedAtUtc);
      const movementIds: string[] = [];
      for (const line of parsed) {
        if (line.received.isPositive()) {
          await this.applyBalanceDelta(
            tx,
            shipment.inTransitLocationId,
            line.item.productId,
            line.received.negated(),
          );
          await this.applyBalanceDelta(
            tx,
            shipment.destinationLocationId,
            line.item.productId,
            line.received,
          );
          const movements = await Promise.all([
            tx.inventoryMovement.create({
              data: {
                commandId: reserved.id,
                productId: line.item.productId,
                unitVersionId: line.item.unitVersionId,
                locationId: shipment.inTransitLocationId,
                type: 'TRANSFER_OUT',
                quantityBase: line.received,
                capturedAtUtc,
                businessDate: colombiaBusinessDate(capturedAtUtc),
              },
            }),
            tx.inventoryMovement.create({
              data: {
                commandId: reserved.id,
                productId: line.item.productId,
                unitVersionId: line.item.unitVersionId,
                locationId: shipment.destinationLocationId,
                type: 'TRANSFER_IN',
                quantityBase: line.received,
                capturedAtUtc,
                businessDate: colombiaBusinessDate(capturedAtUtc),
              },
            }),
          ]);
          movementIds.push(...movements.map((movement) => movement.id));
        }
        await tx.shipmentItem.update({
          where: { id: line.item.id },
          data: {
            receivedBase: { increment: line.received },
            damagedBase: { increment: line.damaged },
            lostBase: { increment: line.missing },
          },
        });
      }

      const afterItems = shipment.items.map((item) => {
        const line = parsed.find((candidate) => candidate.item.id === item.id);
        return {
          ...item,
          receivedBase: item.receivedBase.plus(line?.received ?? 0),
          damagedBase: item.damagedBase.plus(line?.damaged ?? 0),
          lostBase: item.lostBase.plus(line?.missing ?? 0),
        };
      });
      const hasDiscrepancy = afterItems.some(
        (item) => item.damagedBase.isPositive() || item.lostBase.isPositive(),
      );
      const fullyAccounted = afterItems.every((item) =>
        item.receivedBase.plus(item.damagedBase).plus(item.lostBase).equals(item.quantityBase),
      );
      const nextStatus = hasDiscrepancy
        ? 'DISCREPANCY_REVIEW'
        : fullyAccounted
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED';
      const result = commandResult(reserved.id, `SHIPMENT_${nextStatus}`, movementIds);
      await tx.shipmentReceipt.create({
        data: {
          shipmentId: id,
          clientCommandId: input.clientCommandId,
          commandId: reserved.id,
          actorUserId: actor.userId,
          verificationMethod: input.verificationMethod,
          verificationReason: input.verificationReason?.trim() || null,
          deviceId: actor.deviceId,
          capturedAtUtc,
          capturedOffsetMin: input.capturedOffsetMin,
          result: asJson(result),
          items: {
            create: parsed.map((line) => ({
              shipmentItemId: line.item.id,
              receivedBase: line.received,
              damagedBase: line.damaged,
              missingBase: line.missing,
            })),
          },
        },
      });
      await tx.shipment.update({
        where: { id },
        data: {
          status: nextStatus,
          completedAt: nextStatus === 'RECEIVED' ? now : null,
        },
      });
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async returnShipment(
    actor: ScopeContext,
    id: string,
    input: ShipmentCommandInput,
  ): Promise<unknown> {
    return this.transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: applyInventoryScope(actor, 'Shipment', { id }),
        include: { items: true, originLocation: true },
      });
      if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
      if (!['DISPATCHED', 'PARTIALLY_RECEIVED'].includes(shipment.status)) {
        throw new InventoryOperationError('INVALID_STATE', 'Shipment cannot be returned in its current state.');
      }
      if (!shipment.inTransitLocationId) {
        throw new InventoryOperationError('INVALID_STATE', 'Shipment has no transit location.');
      }
      if (shipment.items.some((item) => item.damagedBase.isPositive() || item.lostBase.isPositive())) {
        throw new InventoryOperationError('DISCREPANCY_PENDING', 'Resolve discrepancies before returning a shipment.');
      }
      const reason = nonEmpty(input.reason ?? '', 'reason');
      const payload = { shipmentId: id, action: 'RETURN', reason };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'RESOLUTION',
        payload,
        shipment.originLocationId,
        shipment.originLocation.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;
      const now = new Date();
      const movementIds: string[] = [];
      for (const item of shipment.items) {
        const pending = item.quantityBase.minus(item.receivedBase);
        if (!pending.isPositive()) continue;
        await this.applyBalanceDelta(tx, shipment.inTransitLocationId, item.productId, pending.negated());
        await this.applyBalanceDelta(tx, shipment.originLocationId, item.productId, pending);
        const movements = await Promise.all([
          tx.inventoryMovement.create({
            data: {
              commandId: reserved.id,
              productId: item.productId,
              unitVersionId: item.unitVersionId,
              locationId: shipment.inTransitLocationId,
              type: 'TRANSFER_OUT',
              quantityBase: pending,
              capturedAtUtc: now,
              businessDate: colombiaBusinessDate(now),
            },
          }),
          tx.inventoryMovement.create({
            data: {
              commandId: reserved.id,
              productId: item.productId,
              unitVersionId: item.unitVersionId,
              locationId: shipment.originLocationId,
              type: 'TRANSFER_IN',
              quantityBase: pending,
              capturedAtUtc: now,
              businessDate: colombiaBusinessDate(now),
            },
          }),
        ]);
        movementIds.push(...movements.map((movement) => movement.id));
      }
      const result = commandResult(reserved.id, 'SHIPMENT_RETURNED', movementIds);
      await tx.shipment.update({ where: { id }, data: { status: 'RETURNED', completedAt: now } });
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async resolveShipmentDiscrepancy(
    actor: ScopeContext,
    id: string,
    input: ShipmentCommandInput,
  ): Promise<unknown> {
    return this.transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: applyInventoryScope(actor, 'Shipment', { id }),
        include: { items: true, destinationLocation: true },
      });
      if (!shipment) throw new InventoryOperationError('NOT_FOUND', 'Shipment not found.');
      if (shipment.status !== 'DISCREPANCY_REVIEW' || !shipment.inTransitLocationId) {
        throw new InventoryOperationError('INVALID_STATE', 'Shipment has no discrepancy ready to resolve.');
      }
      const fullyAccounted = shipment.items.every((item) =>
        item.receivedBase.plus(item.damagedBase).plus(item.lostBase).equals(item.quantityBase),
      );
      if (!fullyAccounted) {
        throw new InventoryOperationError(
          'UNACCOUNTED_REMAINDER',
          'Every dispatched quantity must be received, damaged or missing before closing.',
        );
      }
      const reason = nonEmpty(input.reason ?? '', 'reason');
      const payload = { shipmentId: id, action: 'CLOSE_DISCREPANCY', reason };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'RESOLUTION',
        payload,
        shipment.destinationLocationId,
        shipment.destinationLocation.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;
      const now = new Date();
      const movementIds: string[] = [];
      for (const item of shipment.items) {
        for (const [type, quantity] of [
          ['IN_TRANSIT_DAMAGE', item.damagedBase],
          ['IN_TRANSIT_LOSS', item.lostBase],
        ] as const) {
          if (!quantity.isPositive()) continue;
          await this.applyBalanceDelta(tx, shipment.inTransitLocationId, item.productId, quantity.negated());
          const movement = await tx.inventoryMovement.create({
            data: {
              commandId: reserved.id,
              productId: item.productId,
              unitVersionId: item.unitVersionId,
              locationId: shipment.inTransitLocationId,
              type,
              quantityBase: quantity,
              capturedAtUtc: now,
              businessDate: colombiaBusinessDate(now),
            },
          });
          movementIds.push(movement.id);
        }
      }
      const result = commandResult(reserved.id, 'SHIPMENT_CLOSED_WITH_DISCREPANCY', movementIds);
      await tx.shipment.update({
        where: { id },
        data: { status: 'CLOSED_WITH_DISCREPANCY', completedAt: now },
      });
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async openCount(actor: ScopeContext, input: OpenCountInput): Promise<unknown> {
    return this.transaction(async (tx) => {
      const location = await tx.inventoryLocation.findFirst({
        where: applyInventoryScope(actor, 'InventoryLocation', { id: input.locationId, active: true }),
      });
      if (!location) throw new InventoryOperationError('NOT_FOUND', 'Inventory location not found.');
      const [products, balances] = await Promise.all([
        tx.product.findMany({
          where: { active: true },
          include: {
            unitVersions: {
              where: { isBase: true, validUntil: null },
              orderBy: { validFrom: 'desc' },
              take: 1,
            },
          },
          orderBy: { sku: 'asc' },
        }),
        tx.inventoryBalance.findMany({ where: { locationId: location.id } }),
      ]);
      const balanceByProduct = new Map(balances.map((balance) => [balance.productId, balance.quantityBase]));
      if (products.some((product) => product.unitVersions.length === 0)) {
        throw new InventoryOperationError('INVALID_CATALOG', 'Every active product needs a current base unit.');
      }
      try {
        const count = await tx.inventoryCount.create({
          data: {
            locationId: location.id,
            counterUserId: actor.userId,
            cutoffAt: new Date(),
            lines: {
              create: products.map((product) => ({
                productId: product.id,
                unitVersionId: product.unitVersions[0].id,
                expectedBase: balanceByProduct.get(product.id) ?? new Prisma.Decimal(0),
              })),
            },
          },
          include: {
            location: true,
            counter: { select: { id: true, email: true, displayName: true } },
            lines: { include: { product: true, unitVersion: true }, orderBy: { product: { sku: 'asc' } } },
          },
        });
        return redactOpenInventoryCount(count);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new InventoryOperationError('COUNT_ALREADY_OPEN', 'This location already has an active count.');
        }
        throw error;
      }
    });
  }

  async saveCountLines(
    actor: ScopeContext,
    id: string,
    lines: CountLineInput[],
  ): Promise<unknown> {
    if (lines.length === 0) {
      throw new InventoryOperationError('INVALID_INPUT', 'Count lines are required.');
    }
    return this.transaction(async (tx) => {
      const count = await tx.inventoryCount.findFirst({
        where: applyInventoryScope(actor, 'InventoryCount', { id }),
        include: { lines: true },
      });
      if (!count) throw new InventoryOperationError('NOT_FOUND', 'Inventory count not found.');
      if (count.status !== 'OPEN') {
        throw new InventoryOperationError('INVALID_STATE', 'Only an open count can be edited.');
      }
      if (count.counterUserId !== actor.userId && actor.role !== 'SYSTEM_ADMIN') {
        throw new InventoryOperationError('FORBIDDEN', 'Only the assigned counter can edit this count.');
      }
      const uniqueProducts = new Set(lines.map((line) => line.productId));
      if (uniqueProducts.size !== lines.length) {
        throw new InventoryOperationError('DUPLICATE_PRODUCT', 'Count products must be unique.');
      }
      for (const line of lines) {
        const existing = count.lines.find((candidate) => candidate.productId === line.productId);
        if (!existing) throw new InventoryOperationError('INVALID_PRODUCT', 'Product is not part of this count snapshot.');
        await tx.inventoryCountLine.update({
          where: { id: existing.id },
          data: { countedBase: decimal(line.countedBase, { allowZero: true }) },
        });
      }
      const updated = await tx.inventoryCount.findUniqueOrThrow({
        where: { id },
        include: { location: true, lines: { include: { product: true, unitVersion: true } } },
      });
      return redactOpenInventoryCount(updated);
    });
  }

  async submitCount(actor: ScopeContext, id: string): Promise<unknown> {
    return this.transaction(async (tx) => {
      const count = await tx.inventoryCount.findFirst({
        where: applyInventoryScope(actor, 'InventoryCount', { id }),
        include: { lines: true },
      });
      if (!count) throw new InventoryOperationError('NOT_FOUND', 'Inventory count not found.');
      if (count.status !== 'OPEN') {
        throw new InventoryOperationError('INVALID_STATE', 'Only an open count can be submitted.');
      }
      if (count.counterUserId !== actor.userId && actor.role !== 'SYSTEM_ADMIN') {
        throw new InventoryOperationError('FORBIDDEN', 'Only the assigned counter can submit this count.');
      }
      if (count.lines.some((line) => line.countedBase === null)) {
        throw new InventoryOperationError('COUNT_INCOMPLETE', 'Every count line must be completed.');
      }
      for (const line of count.lines) {
        await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: { differenceBase: line.countedBase!.minus(line.expectedBase) },
        });
      }
      return tx.inventoryCount.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
        include: { location: true, lines: { include: { product: true, unitVersion: true } } },
      });
    });
  }

  async approveCount(
    actor: ScopeContext,
    id: string,
    input: ApproveCountInput,
  ): Promise<unknown> {
    const reason = nonEmpty(input.reason, 'reason');
    return this.transaction(async (tx) => {
      const count = await tx.inventoryCount.findFirst({
        where: applyInventoryScope(actor, 'InventoryCount', { id }),
        include: { lines: true, location: true },
      });
      if (!count) throw new InventoryOperationError('NOT_FOUND', 'Inventory count not found.');
      if (count.status !== 'SUBMITTED') {
        if (count.approvalCommandId) {
          const command = await tx.inventoryCommand.findUnique({ where: { id: count.approvalCommandId } });
          if (command?.clientCommandId === input.clientCommandId) return command.result;
        }
        throw new InventoryOperationError('INVALID_STATE', 'Only a submitted count can be approved.');
      }
      const hasDifference = count.lines.some(
        (line) => line.differenceBase !== null && !line.differenceBase.isZero(),
      );
      if (hasDifference && count.counterUserId === actor.userId) {
        throw new InventoryOperationError(
          'SEPARATION_OF_DUTIES',
          'The counter cannot approve a count with differences.',
        );
      }
      const payload = { countId: id, reason };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'COUNT_ADJUSTMENT',
        payload,
        count.locationId,
        count.location.zoneId,
      );
      if (reserved.existingResult) return reserved.existingResult;
      const now = new Date();
      const movementIds: string[] = [];
      for (const line of count.lines) {
        const difference = line.differenceBase ?? new Prisma.Decimal(0);
        if (difference.isZero()) continue;
        await this.applyBalanceDelta(tx, count.locationId, line.productId, difference);
        const movement = await tx.inventoryMovement.create({
          data: {
            commandId: reserved.id,
            productId: line.productId,
            unitVersionId: line.unitVersionId,
            locationId: count.locationId,
            type: difference.isPositive() ? 'COUNT_ADJUSTMENT_IN' : 'COUNT_ADJUSTMENT_OUT',
            quantityBase: difference.abs(),
            capturedAtUtc: now,
            businessDate: colombiaBusinessDate(now),
          },
        });
        movementIds.push(movement.id);
        await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: { adjustmentMovementId: movement.id },
        });
      }
      const result = commandResult(reserved.id, 'COUNT_CLOSED', movementIds);
      await tx.inventoryCount.update({
        where: { id },
        data: {
          status: 'CLOSED',
          approverUserId: actor.userId,
          approvalCommandId: reserved.id,
          reason,
          closedAt: now,
        },
      });
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }

  async listCounts(actor: ScopeContext): Promise<unknown> {
    return this.prisma.inventoryCount.findMany({
      where: applyInventoryScope(actor, 'InventoryCount'),
      include: {
        location: true,
        counter: { select: { id: true, email: true, displayName: true } },
        approver: { select: { id: true, email: true, displayName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  async getCount(actor: ScopeContext, id: string): Promise<unknown> {
    const count = await this.prisma.inventoryCount.findFirst({
      where: applyInventoryScope(actor, 'InventoryCount', { id }),
      include: {
        location: true,
        counter: { select: { id: true, email: true, displayName: true } },
        approver: { select: { id: true, email: true, displayName: true } },
        lines: { include: { product: true, unitVersion: true }, orderBy: { product: { sku: 'asc' } } },
      },
    });
    if (!count) throw new InventoryOperationError('NOT_FOUND', 'Inventory count not found.');
    return redactOpenInventoryCount(count);
  }

  async importOpeningBalances(
    actor: ScopeContext,
    input: ImportOpeningBalancesInput,
  ): Promise<unknown> {
    if (input.rows.length === 0 || input.rows.length > 5_000) {
      throw new InventoryOperationError('INVALID_INPUT', 'Opening import requires between 1 and 5000 rows.');
    }
    const sourceHash = nonEmpty(input.sourceHash, 'sourceHash');
    const rows = [...input.rows].sort((a, b) =>
      `${a.locationCode}:${a.productSku}`.localeCompare(`${b.locationCode}:${b.productSku}`),
    );
    const uniqueKeys = new Set(rows.map((row) => `${row.locationCode}:${row.productSku}`));
    if (uniqueKeys.size !== rows.length) {
      throw new InventoryOperationError('DUPLICATE_ROW', 'Opening import contains duplicate location/product rows.');
    }
    return this.transaction(async (tx) => {
      const payload = { sourceHash, rows };
      const reserved = await this.reserveCommand(
        tx,
        actor,
        input.clientCommandId,
        'OPENING_BALANCE',
        payload,
      );
      if (reserved.existingResult) return reserved.existingResult;
      const movementIds: string[] = [];
      const now = new Date();
      for (const row of rows) {
        const [location, product] = await Promise.all([
          tx.inventoryLocation.findUnique({ where: { code: row.locationCode.trim().toUpperCase() } }),
          tx.product.findUnique({
            where: { sku: row.productSku.trim().toUpperCase() },
            include: { unitVersions: { where: { isBase: true, validUntil: null }, take: 1 } },
          }),
        ]);
        if (!location || !product || product.unitVersions.length === 0) {
          throw new InventoryOperationError(
            'IMPORT_REFERENCE_NOT_FOUND',
            `Unknown location or product in ${row.locationCode}/${row.productSku}.`,
          );
        }
        const existingMovement = await tx.inventoryMovement.findFirst({
          where: { locationId: location.id, productId: product.id },
        });
        const existingBalance = await tx.inventoryBalance.findUnique({
          where: { locationId_productId: { locationId: location.id, productId: product.id } },
        });
        if (existingMovement || (existingBalance && !existingBalance.quantityBase.isZero())) {
          throw new InventoryOperationError(
            'OPENING_ALREADY_EXISTS',
            `Opening balance already exists for ${row.locationCode}/${row.productSku}.`,
          );
        }
        const quantity = decimal(row.quantityBase, { allowZero: true });
        if (quantity.isZero()) continue;
        await this.applyBalanceDelta(tx, location.id, product.id, quantity);
        const movement = await tx.inventoryMovement.create({
          data: {
            commandId: reserved.id,
            productId: product.id,
            unitVersionId: product.unitVersions[0].id,
            locationId: location.id,
            type: 'OPENING_BALANCE',
            quantityBase: quantity,
            capturedAtUtc: now,
            businessDate: colombiaBusinessDate(now),
          },
        });
        movementIds.push(movement.id);
      }
      const result = {
        ...commandResult(reserved.id, 'OPENING_BALANCES_IMPORTED', movementIds),
        sourceHash,
        rowCount: rows.length,
      };
      await this.finishCommand(tx, reserved.id, result);
      return result;
    });
  }
}
