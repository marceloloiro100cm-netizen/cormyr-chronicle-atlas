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
  const listeners = new Set<(s: FirebaseSession | null) => void>();
  const emit = () => listeners.forEach(l => l(session));

  async function post(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let res: Response;
    try { res = await f(url, init); } catch { throw new FirebaseAuthError('NETWORK'); }
    let body: Record<string, unknown> = {};
    try { body = await res.json() as Record<string, unknown>; } catch { /* empty body */ }
    if (!res.ok) {
      const msg = (body.error as { message?: unknown } | undefined)?.message;
      throw new FirebaseAuthError(typeof msg === 'string' ? msg.split(' ')[0] : 'UNKNOWN');
    }
    return body;
  }
  const accept = (uid: unknown, idToken: unknown, refresh: unknown, expiresIn: unknown): FirebaseSession => {
    const secs = Number(expiresIn);
    if (typeof uid !== 'string' || typeof idToken !== 'string' || typeof refresh !== 'string' || !Number.isFinite(secs) || secs <= 0)
      throw new FirebaseAuthError('BAD_RESPONSE');
    storage.set(refresh);
    session = { uid, idToken, expiresAt: now() + secs * 1000 };
    emit();
    return session;
  };

  async function refresh(): Promise<FirebaseSession | null> {
    const rt = storage.get();
    if (!rt) { session = null; return null; }
    try {
      const b = await post(`${origin('securetoken.googleapis.com')}/v1/token?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(rt)}`,
      });
      return accept(b.user_id, b.id_token, b.refresh_token, b.expires_in);
    } catch (e) {
      // A rejected refresh token ends the session; a network error keeps it for a retry.
      if (e instanceof FirebaseAuthError && e.code !== 'NETWORK') { storage.set(null); session = null; emit(); }
      throw e;
    }
  }

  return {
    async signInWithPassword(email, password) {
      const b = await post(`${origin('identitytoolkit.googleapis.com')}/v1/accounts:signInWithPassword?key=${key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      return accept(b.localId, b.idToken, b.refreshToken, b.expiresIn);
    },
    signOut() { storage.set(null); session = null; emit(); },
    current: () => session,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async getToken() {
      if (session && session.expiresAt - now() > skew) return session.idToken;
      inflight ??= refresh().finally(() => { inflight = null; });
      try { return (await inflight)?.idToken ?? null; } catch { return null; }
    },
  };
}
