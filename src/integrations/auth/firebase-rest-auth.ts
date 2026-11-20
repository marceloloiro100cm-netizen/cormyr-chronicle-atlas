/** Dependency-free Firebase Auth client over the public REST endpoints
 * (Identity Toolkit and Secure Token). Works against the Auth Emulator by
 * passing `emulatorHost`. Holds the refresh token only in the injected
 * storage and never logs credentials or tokens. */
import type { AuthTokenProvider } from './token-provider';

export interface TokenStorage {
  get(): string | null;
  set(value: string | null): void;
}
export interface FirebaseRestAuthOptions {
  apiKey: string;
  fetch?: typeof fetch;
  emulatorHost?: string;
  storage?: TokenStorage;
  now?: () => number;
  /** Refresh when the ID token expires within this many ms. */
  skewMs?: number;
}
export interface FirebaseSession { uid: string; idToken: string; expiresAt: number }
interface Raw {
  error?: { message?: unknown };
  localId?: unknown; idToken?: unknown; refreshToken?: unknown; expiresIn?: unknown;
  user_id?: unknown; id_token?: unknown; refresh_token?: unknown; expires_in?: unknown;
}
export class FirebaseAuthError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'FirebaseAuthError'; this.code = code; }
}

export function memoryStorage(): TokenStorage {
  let v: string | null = null;
  return { get: () => v, set: x => { v = x; } };
}

export function createFirebaseRestAuth(opts: FirebaseRestAuthOptions): AuthTokenProvider & {
  signInWithPassword(email: string, password: string): Promise<FirebaseSession>;
  signInWithGoogle(getRefreshToken: () => Promise<string>): Promise<FirebaseSession>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(oobCode: string, newPassword: string): Promise<void>;
  signOut(): void;
  current(): FirebaseSession | null;
  subscribe(fn: (s: FirebaseSession | null) => void): () => void;
} {
  if (!opts.apiKey) throw new Error('apiKey required');
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = opts.storage ?? memoryStorage();
  const now = opts.now ?? Date.now;
  const skew = opts.skewMs ?? 60_000;
  const origin = (host: string) => opts.emulatorHost ? `http://${opts.emulatorHost}/${host}` : `https://${host}`;
  const key = encodeURIComponent(opts.apiKey);
  let session: FirebaseSession | null = null;
  let inflight: Promise<FirebaseSession | null> | null = null;
  // Invalidate outstanding network requests when the identity changes or logs out.
  // A delayed refresh must never restore a signed-out or replaced session.
  let sessionVersion = 0;
  const listeners = new Set<(s: FirebaseSession | null) => void>();
  const emit = () => listeners.forEach(l => l(session));

  async function post(url: string, init: RequestInit): Promise<Raw> {
    let res: Response;
    try { res = await f(url, init); } catch { throw new FirebaseAuthError('NETWORK'); }
    let body: Raw = {};
    try { body = await res.json() as Raw; } catch { /* empty body */ }
    if (!res.ok) {
      const msg = body.error?.message;
      throw new FirebaseAuthError(typeof msg === 'string' ? (msg.split(' ')[0] || 'UNKNOWN') : 'UNKNOWN');
    }
    return body;
  }
  const accept = (uid: unknown, idToken: unknown, refresh: unknown, expiresIn: unknown, version: number): FirebaseSession => {
    if (version !== sessionVersion) throw new FirebaseAuthError('STALE_SESSION');
    const secs = Number(expiresIn);
    if (typeof uid !== 'string' || typeof idToken !== 'string' || typeof refresh !== 'string' || !Number.isFinite(secs) || secs <= 0)
      throw new FirebaseAuthError('BAD_RESPONSE');
    storage.set(refresh);
    session = { uid, idToken, expiresAt: now() + secs * 1000 };
    emit();
    return session;
  };

  async function refresh(): Promise<FirebaseSession | null> {
    const version = sessionVersion;
    const rt = storage.get();
    if (!rt) { if (version === sessionVersion) { session = null; emit(); } return null; }
    try {
      const b = await post(`${origin('securetoken.googleapis.com')}/v1/token?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(rt)}`,
      });
      // A different login or sign-out may have happened during the request.
      if (version !== sessionVersion || storage.get() !== rt) return null;
      return accept(b.user_id, b.id_token, b.refresh_token, b.expires_in, version);
    } catch (e) {
      // Never allow an old refresh failure to revoke a newer identity.
      if (version === sessionVersion && storage.get() === rt &&
          e instanceof FirebaseAuthError && e.code !== 'NETWORK') {
        storage.set(null); session = null; emit();
      }
      throw e;
    }
  }

  return {
    async signInWithPassword(email, password) {
      const version = ++sessionVersion;
      inflight = null;
      const b = await post(`${origin('identitytoolkit.googleapis.com')}/v1/accounts:signInWithPassword?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      return accept(b.localId, b.idToken, b.refreshToken, b.expiresIn, version);
    },
    async signInWithGoogle(getRefreshToken) {
      const version = ++sessionVersion;
      inflight = null;
      const refreshToken = await getRefreshToken();
      if (version !== sessionVersion) throw new FirebaseAuthError('STALE_SESSION');
      if (typeof refreshToken !== 'string' || !refreshToken)
        throw new FirebaseAuthError('BAD_RESPONSE');
      // Secure Token verifies the SDK credential; no role or House is imported.
      const b = await post(`${origin('securetoken.googleapis.com')}/v1/token?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      });
      return accept(b.user_id, b.id_token, b.refresh_token, b.expires_in, version);
    },
    async requestPasswordReset(email) {
      if (typeof email !== 'string' || email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new FirebaseAuthError('INVALID_EMAIL');
      // Public Firebase Auth REST endpoint. No redirect URL, no session
      // mutation and no custom backend. The UI must not reveal whether this
      // address belongs to an existing account.
      await post(`${origin('identitytoolkit.googleapis.com')}/v1/accounts:sendOobCode?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      });
    },
    async confirmPasswordReset(oobCode, newPassword) {
      if (typeof oobCode !== 'string' ||
          !/^[A-Za-z0-9_-]{8,4096}$/.test(oobCode))
        throw new FirebaseAuthError('INVALID_RESET_CODE');
      if (typeof newPassword !== 'string' ||
          newPassword.length < 8 || newPassword.length > 128)
        throw new FirebaseAuthError('WEAK_PASSWORD');
      await post(`${origin('identitytoolkit.googleapis.com')}/v1/accounts:resetPassword?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oobCode, newPassword }),
      });
      // Resetting a password must NOT create a session or trust any provider role.
    },
    signOut() { ++sessionVersion; inflight = null; storage.set(null); session = null; emit(); },
    current: () => session,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async getToken() {
      if (session && session.expiresAt - now() > skew) return session.idToken;
      if (!inflight) {
        const task = refresh().finally(() => { if (inflight === task) inflight = null; });
        inflight = task;
      }
      try { return (await inflight)?.idToken ?? null; } catch { return null; }
    },
  };
}
