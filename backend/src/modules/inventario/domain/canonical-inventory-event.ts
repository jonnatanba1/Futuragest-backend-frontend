import { createHash } from 'node:crypto';
import type { MobileInventoryEvent } from './inventory-command';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export function normalizeInventoryDecimal(value: string): string {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error('Quantity must be a positive decimal string with at most 6 decimals.');
  }

  const [integer, fraction = ''] = value.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  const normalized = normalizedFraction ? `${integer}.${normalizedFraction}` : integer;
  if (normalized === '0') throw new Error('Quantity must be greater than zero.');
  return normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalInventoryPayload(event: MobileInventoryEvent): Record<string, unknown> {
  return canonicalize({
    schemaVersion: event.schemaVersion,
    type: event.type,
    assignmentId: event.assignmentId,
    productId: event.productId,
    unitVersionId: event.unitVersionId,
    quantity: normalizeInventoryDecimal(event.quantity),
    capturedAtUtc: new Date(event.capturedAtUtc).toISOString(),
    capturedOffsetMin: event.capturedOffsetMin,
    verificationMethod: event.verificationMethod,
    verificationReason: event.verificationReason,
    latitude: event.latitude,
    longitude: event.longitude,
    accuracyMeters: event.accuracyMeters,
  }) as Record<string, unknown>;
}

export function hashInventoryPayload(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}
