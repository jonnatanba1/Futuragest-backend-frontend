import { Prisma, type InventoryMovementType } from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import {
  InventoryIdempotencyConflictError,
  type InventoryCommandRepositoryPort,
  type InventorySyncResult,
  type ProcessInventoryEventInput,
} from '../domain/inventory-command';

const MAX_TRANSACTION_RETRIES = 3;
const MAX_CLOCK_SKEW_MS = 7 * 24 * 60 * 60 * 1000;

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

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class PrismaInventoryCommandRepository implements InventoryCommandRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async process(input: ProcessInventoryEventInput): Promise<InventorySyncResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => this.processTransaction(tx, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < MAX_TRANSACTION_RETRIES
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Inventory transaction retry budget exhausted.');
  }

  private async processTransaction(
    tx: Prisma.TransactionClient,
    input: ProcessInventoryEventInput,
  ): Promise<InventorySyncResult> {
    const capturedAt = new Date(input.event.capturedAtUtc);
    const businessDate = colombiaBusinessDate(capturedAt);
    const receivedAt = new Date();

    const reservation = await tx.inventoryCommand.createMany({
      data: [
        {
          clientCommandId: input.event.clientEventId,
          actorUserId: input.actor.userId,
          deviceId: input.actor.deviceId,
          schemaVersion: input.event.schemaVersion,
          type: input.event.type,
          payload: asJson(input.payload),
          requestHash: input.requestHash,
          status: 'RECEIVED',
          capturedAtUtc: capturedAt,
          capturedOffsetMin: input.event.capturedOffsetMin,
          businessDate,
          clockSkewSeconds: Math.round((receivedAt.getTime() - capturedAt.getTime()) / 1000),
          receivedAt,
        },
      ],
      skipDuplicates: true,
    });

    const command = await tx.inventoryCommand.findUniqueOrThrow({
      where: { clientCommandId: input.event.clientEventId },
    });

    if (reservation.count === 0) {
      if (command.actorUserId !== input.actor.userId || command.requestHash !== input.requestHash) {
        throw new InventoryIdempotencyConflictError(input.event.clientEventId);
      }
      return command.result
        ? (command.result as unknown as InventorySyncResult)
        : this.result(
            command.id,
            input.event.clientEventId,
            'NEEDS_REVIEW',
            'COMMAND_INCOMPLETE',
            [],
          );
    }

    const assignment = await tx.inventoryLocationAssignment.findUnique({
      where: { id: input.event.assignmentId },
      include: { location: true },
    });

    const assignmentValid =
      assignment !== null &&
      assignment.userId === input.actor.userId &&
      assignment.supervisorId === input.actor.supervisorId &&
      assignment.validFrom <= capturedAt &&
      (assignment.validUntil === null || assignment.validUntil > capturedAt) &&
      assignment.location.active;

    if (!assignmentValid || !assignment) {
      return this.markReview(tx, command.id, input.event.clientEventId, 'ASSIGNMENT_INVALID');
    }

    await tx.inventoryCommand.update({
      where: { id: command.id },
      data: {
        locationId: assignment.locationId,
        zoneId: assignment.location.zoneId,
        supervisorId: assignment.supervisorId,
      },
    });

    const unit = await tx.productUnitVersion.findUnique({
      where: { id: input.event.unitVersionId },
      include: { product: true },
    });
    const unitValid =
      unit !== null &&
      unit.productId === input.event.productId &&
      unit.product.active &&
      unit.validFrom <= capturedAt &&
      (unit.validUntil === null || unit.validUntil > capturedAt);
    if (!unitValid || !unit) {
      return this.markReview(tx, command.id, input.event.clientEventId, 'PRODUCT_OR_UNIT_INVALID');
    }

    if (
      input.event.verificationMethod === 'NONE' ||
      input.event.type === 'DAMAGE_OR_LOSS' ||
      input.event.latitude === undefined ||
      input.event.longitude === undefined ||
      input.event.accuracyMeters === undefined ||
      input.event.accuracyMeters > 100 ||
      Math.abs(receivedAt.getTime() - capturedAt.getTime()) > MAX_CLOCK_SKEW_MS
    ) {
      return this.markReview(tx, command.id, input.event.clientEventId, 'CAPTURE_POLICY_REVIEW');
    }

    const quantityBase = new Prisma.Decimal(input.event.quantity).mul(unit.factorToBase);
    let movementType: InventoryMovementType;

    if (input.event.type === 'FIELD_RETURN') {
      movementType = 'FIELD_RETURN';
      await tx.inventoryBalance.upsert({
        where: {
          locationId_productId: {
            locationId: assignment.locationId,
            productId: input.event.productId,
          },
        },
        create: {
          locationId: assignment.locationId,
          productId: input.event.productId,
          quantityBase,
          version: 1,
        },
        update: { quantityBase: { increment: quantityBase }, version: { increment: 1 } },
      });
    } else {
      movementType = input.event.type === 'FIELD_ISSUE' ? 'FIELD_ISSUE' : 'DAMAGE_OR_LOSS';
      const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "InventoryBalance"
        SET "quantityBase" = "quantityBase" - ${quantityBase},
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "locationId" = ${assignment.locationId}
          AND "productId" = ${input.event.productId}
          AND "quantityBase" >= ${quantityBase}
        RETURNING "id"
      `);
      if (updated.length === 0) {
        return this.markReview(tx, command.id, input.event.clientEventId, 'INSUFFICIENT_STOCK');
      }
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        commandId: command.id,
        productId: input.event.productId,
        unitVersionId: input.event.unitVersionId,
        locationId: assignment.locationId,
        type: movementType,
        quantityBase,
        capturedAtUtc: capturedAt,
        businessDate,
      },
    });
    const result = this.result(
      command.id,
      input.event.clientEventId,
      'APPLIED',
      'APPLIED',
      [movement.id],
      receivedAt,
    );
    await tx.inventoryCommand.update({
      where: { id: command.id },
      data: { status: 'APPLIED', appliedAt: new Date(), result: asJson(result) },
    });
    return result;
  }

  private async markReview(
    tx: Prisma.TransactionClient,
    commandId: string,
    clientEventId: string,
    code: string,
  ): Promise<InventorySyncResult> {
    const result = this.result(commandId, clientEventId, 'NEEDS_REVIEW', code, []);
    await tx.inventoryCommand.update({
      where: { id: commandId },
      data: { status: 'NEEDS_REVIEW', reviewCode: code, result: asJson(result) },
    });
    return result;
  }

  private result(
    commandId: string,
    clientEventId: string,
    status: 'APPLIED' | 'NEEDS_REVIEW',
    code: string,
    movementIds: string[],
    receivedAt: Date = new Date(),
  ): InventorySyncResult {
    return {
      clientEventId,
      commandId,
      status,
      movementIds,
      code,
      serverReceivedAt: receivedAt.toISOString(),
    };
  }

  async findStatuses(
    actor: ProcessInventoryEventInput['actor'],
    clientEventIds: string[],
  ): Promise<InventorySyncResult[]> {
    const commands = await this.prisma.inventoryCommand.findMany({
      where: { actorUserId: actor.userId, clientCommandId: { in: clientEventIds } },
      orderBy: { receivedAt: 'asc' },
    });
    return commands.flatMap((command) =>
      command.result ? [command.result as unknown as InventorySyncResult] : [],
    );
  }
}
