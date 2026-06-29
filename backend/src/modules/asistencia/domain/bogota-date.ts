/**
 * Bogotá date derivation helper.
 *
 * Colombia is fixed UTC-5, no DST — a deterministic offset, no IANA lookups needed.
 * Used by check-in to derive the server-authoritative local date so we never trust
 * a client-supplied date string without validation.
 *
 * @param instant - the UTC timestamp (e.g. checkInCapturedAt)
 * @returns YYYY-MM-DD string in Bogotá local time (UTC-5)
 */
export function toBogotaDate(instant: Date): string {
  const BOGOTA_OFFSET_MS = 5 * 3600 * 1000; // UTC-5, no DST
  return new Date(instant.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}
