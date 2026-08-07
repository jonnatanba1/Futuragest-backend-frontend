import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import {
  canonicalInventoryPayload,
  hashInventoryPayload,
} from '../domain/canonical-inventory-event';
import {
  INVENTORY_BATCH_LIMIT,
  SUPPORTED_INVENTORY_SCHEMA_VERSION,
  InventoryIdempotencyConflictError,
  InventoryInputError,
  type InventoryCommandRepositoryPort,
  type InventorySyncResult,
  type MobileInventoryEvent,
} from '../domain/inventory-command';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['FIELD_ISSUE', 'FIELD_RETURN', 'DAMAGE_OR_LOSS']);
const VERIFICATION_METHODS = new Set(['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE']);

function isFiniteOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function parseEvent(value: unknown): MobileInventoryEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Event must be an object.');
  }
  const event = value as Record<string, unknown>;
  if (typeof event.clientEventId !== 'string' || !UUID_PATTERN.test(event.clientEventId)) {
    throw new Error('clientEventId must be a UUID.');
  }
  if (typeof event.schemaVersion !== 'number' || !Number.isInteger(event.schemaVersion)) {
    throw new Error('schemaVersion must be an integer.');
  }
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) {
    throw new Error('Unsupported inventory event type.');
  }
  for (const field of ['assignmentId', 'productId', 'unitVersionId'] as const) {
    if (typeof event[field] !== 'string' || !UUID_PATTERN.test(event[field])) {
      throw new Error(`${field} must be a UUID.`);
    }
  }
  if (typeof event.quantity !== 'string') throw new Error('quantity must be a string.');
  if (typeof event.capturedAtUtc !== 'string' || Number.isNaN(Date.parse(event.capturedAtUtc))) {
    throw new Error('capturedAtUtc must be ISO 8601.');
  }
  if (
    typeof event.capturedOffsetMin !== 'number' ||
    !Number.isInteger(event.capturedOffsetMin) ||
    event.capturedOffsetMin < -840 ||
    event.capturedOffsetMin > 840
  ) {
    throw new Error('capturedOffsetMin is outside the valid range.');
  }
  if (
    typeof event.verificationMethod !== 'string' ||
    !VERIFICATION_METHODS.has(event.verificationMethod)
  ) {
    throw new Error('verificationMethod is invalid.');
  }
  if (event.verificationReason !== undefined && typeof event.verificationReason !== 'string') {
    throw new Error('verificationReason must be a string.');
  }
  if (
    !isFiniteOptionalNumber(event.latitude) ||
    !isFiniteOptionalNumber(event.longitude) ||
    !isFiniteOptionalNumber(event.accuracyMeters)
  ) {
    throw new Error('GPS fields must be finite numbers.');
  }
  if (event.latitude !== undefined && (event.latitude < -90 || event.latitude > 90)) {
    throw new Error('latitude is outside the valid range.');
  }
  if (event.longitude !== undefined && (event.longitude < -180 || event.longitude > 180)) {
    throw new Error('longitude is outside the valid range.');
  }
  if (event.accuracyMeters !== undefined && event.accuracyMeters < 0) {
    throw new Error('accuracyMeters cannot be negative.');
  }

  return event as unknown as MobileInventoryEvent;
}

function rejected(clientEventId: string, code: string): InventorySyncResult {
  return {
    clientEventId,
    status: 'REJECTED_CLIENT_ACTION',
    code,
    serverReceivedAt: new Date().toISOString(),
  };
}

export class SyncInventoryUseCase {
  constructor(
    private readonly repository: InventoryCommandRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  async execute(events: unknown[]): Promise<InventorySyncResult[]> {
    if (!Array.isArray(events) || events.length === 0 || events.length > INVENTORY_BATCH_LIMIT) {
      throw new InventoryInputError(
        `events must contain between 1 and ${INVENTORY_BATCH_LIMIT} items.`,
      );
    }

    const actor = this.scopeHolder.current();
    const results: InventorySyncResult[] = [];

    for (const raw of events) {
      const claimedId =
        raw &&
        typeof raw === 'object' &&
        typeof (raw as Record<string, unknown>).clientEventId === 'string'
          ? String((raw as Record<string, unknown>).clientEventId)
          : 'UNKNOWN';
      try {
        const event = parseEvent(raw);
        if (event.schemaVersion !== SUPPORTED_INVENTORY_SCHEMA_VERSION) {
          results.push(rejected(event.clientEventId, 'UNSUPPORTED_SCHEMA'));
          continue;
        }
        const payload = canonicalInventoryPayload(event);
        results.push(
          await this.repository.process({
            actor,
            event,
            payload,
            requestHash: hashInventoryPayload(payload),
          }),
        );
      } catch (error) {
        if (error instanceof InventoryIdempotencyConflictError) throw error;
        results.push(rejected(claimedId, 'INVALID_EVENT'));
      }
    }

    return results;
  }

  findStatuses(clientEventIds: string[]): Promise<InventorySyncResult[]> {
    if (
      clientEventIds.length === 0 ||
      clientEventIds.length > 100 ||
      clientEventIds.some((id) => !UUID_PATTERN.test(id))
    ) {
      throw new InventoryInputError('clientEventIds must contain between 1 and 100 UUIDs.');
    }
    return this.repository.findStatuses(this.scopeHolder.current(), clientEventIds);
  }
}
