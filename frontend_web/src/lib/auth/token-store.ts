/**
 * Token storage with a deliberate security split:
 *  - access token lives ONLY in memory (lost on reload, re-minted via refresh) —
 *    keeps the short-lived bearer out of any XSS-readable storage.
 *  - the persisted session (userId + opaque refresh token) lives in localStorage
 *    so a reload can silently re-authenticate. XSS exposure of the refresh token
 *    is mitigated by the CSP/security headers in nginx.conf.
 *
 * See engram decision architecture/web-frontend-stack.
 */
const SESSION_KEY = 'fg.session';

export interface PersistedSession {
  /** User id (JWT sub) — needed for the refresh call body. */
  userId: string;
  /** Opaque refresh token returned by /auth/login. */
  refreshToken: string;
}

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  getSession(): PersistedSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      if (typeof parsed?.userId === 'string' && typeof parsed?.refreshToken === 'string') {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  setSession(session: PersistedSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  /** Wipe both the in-memory access token and the persisted session. */
  clear(): void {
    accessToken = null;
    localStorage.removeItem(SESSION_KEY);
  },
};
