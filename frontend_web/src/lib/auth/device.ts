const DEVICE_ID_KEY = 'fg.deviceId';

/**
 * Stable per-browser device id. The backend binds refresh tokens to a
 * device id (one session row per device), so it MUST persist across reloads.
 * Generated once and stored in localStorage.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Human-readable label for the device session (shown in session lists). */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web';
  return `Web · ${navigator.userAgent.slice(0, 80)}`;
}
