import type { ScopeContext } from '../../auth/domain/scope-context';

export const SUPPORTED_INVENTORY_SCHEMA_VERSION = 1;
export const INVENTORY_BATCH_LIMIT = 25;

export type MobileInventoryEventType = 'FIELD_ISSUE' | 'FIELD_RETURN' | 'DAMAGE_OR_LOSS';
export type VerificationMethod = 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE';

export interface MobileInventoryEvent {
  clientEventId: string;
  schemaVersion: number;
  type: MobileInventoryEventType;
  assignmentId: string;
  productId: string;
  unitVersionId: string;
  quantity: string;
  capturedAtUtc: string;
  capturedOffsetMin: number;
  verificationMethod: VerificationMethod;
  verificationReason?: string;
  reason?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}

export type InventorySyncStatus =
  'APPLIED' | 'NEEDS_REVIEW' | 'REJECTED_CLIENT_ACTION' | 'BLOCKED_AUTH';

export interface InventorySyncResult {
  clientEventId: string;
  commandId?: string;
  status: InventorySyncStatus;
  movementIds?: string[];
  code: string;
  serverReceivedAt: string;
}

export interface ProcessInventoryEventInput {
  actor: ScopeContext;
  event: MobileInventoryEvent;
  requestHash: string;
  payload: Record<string, unknown>;
}

export interface InventoryCommandRepositoryPort {
  process(input: ProcessInventoryEventInput): Promise<InventorySyncResult>;
  findStatuses(actor: ScopeContext, clientEventIds: string[]): Promise<InventorySyncResult[]>;
}

export const INVENTORY_COMMAND_REPOSITORY = Symbol('InventoryCommandRepositoryPort');

export class InventoryIdempotencyConflictError extends Error {
  constructor(readonly clientEventId: string) {
    super(`Idempotency key ${clientEventId} was reused with another actor or payload.`);
    this.name = 'InventoryIdempotencyConflictError';
  }
}

export class InventoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryInputError';
  }
}
