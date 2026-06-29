/**
 * API base URL resolution, runtime-first.
 *
 * In production the value is injected at container start via /config.js, which
 * nginx renders from the API_ORIGIN env var — the SAME variable that drives the
 * CSP `connect-src` (see nginx.conf). Because both derive from one env var they
 * can never drift, and the backend can be repointed (e.g. the HTTPS migration)
 * by changing that var and redeploying, with no image rebuild.
 *
 * `import.meta.env.VITE_API_BASE_URL` is baked at build time and kept only as a
 * fallback for `vite dev` and as a safety net; the dev default is the local
 * backend (mirrors the Flutter app's --dart-define convention).
 */
declare global {
  interface Window {
    __APP_CONFIG__?: { apiBaseUrl?: string };
  }
}

export function resolveApiBaseUrl(): string {
  const runtime =
    typeof window !== 'undefined' ? window.__APP_CONFIG__?.apiBaseUrl : undefined;
  const raw = runtime || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  return raw.replace(/\/+$/, '');
}

export const config = {
  /** Backend API base URL, guaranteed without a trailing slash. */
  apiBaseUrl: resolveApiBaseUrl(),
} as const;
