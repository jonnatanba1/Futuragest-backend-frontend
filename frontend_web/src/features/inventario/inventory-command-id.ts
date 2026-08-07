const STORAGE_PREFIX = 'futuragest:inventory-command:';

interface StoredCommand {
  fingerprint: string;
  id: string;
}

function createUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function storageKey(operationKey: string): string {
  return `${STORAGE_PREFIX}${operationKey}`;
}

export function stableInventoryCommandId(operationKey: string, payload: unknown): string {
  const fingerprint = JSON.stringify(payload);
  const key = storageKey(operationKey);

  try {
    const current = sessionStorage.getItem(key);
    if (current) {
      const parsed = JSON.parse(current) as StoredCommand;
      if (parsed.fingerprint === fingerprint && parsed.id) return parsed.id;
    }
  } catch {
    // Storage can be unavailable in hardened browser contexts; idempotency still works in-memory per request.
  }

  const id = createUuid();
  try {
    sessionStorage.setItem(key, JSON.stringify({ fingerprint, id } satisfies StoredCommand));
  } catch {
    // The request still carries a valid UUID even when session storage is unavailable.
  }
  return id;
}

export function clearInventoryCommandId(operationKey: string): void {
  try {
    sessionStorage.removeItem(storageKey(operationKey));
  } catch {
    // Nothing else is required after a confirmed server response.
  }
}
