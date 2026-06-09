/**
 * Runtime configuration sourced from Vite env vars.
 *
 * The API base URL is injected at build time via VITE_API_BASE_URL
 * (mirrors the Flutter app's --dart-define convention). Falls back to
 * the local backend dev server.
 */
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export const config = {
  /** Backend API base URL, guaranteed without a trailing slash. */
  apiBaseUrl: rawBaseUrl.replace(/\/+$/, ''),
} as const;
