/**
 * Isolated Firebase Auth smoke-test client. It never replaces the production
 * Supabase login or grants campaign access. This may be enabled only in a
 * separately configured homologation deployment.
 */
import { createFirebaseRestAuth, type TokenStorage } from './firebase-rest-auth';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const REFRESH_KEY = 'cormyr:firebase-homologation:refresh';

export function sessionTokenStorage(store: KeyValueStore): TokenStorage {
  return {
    get() {
      try { return store.getItem(REFRESH_KEY); } catch { return null; }
    },
    set(value) {
      try {
        if (value === null) store.removeItem(REFRESH_KEY);
        else store.setItem(REFRESH_KEY, value);
      } catch {
        // Private browsing may deny storage. Authentication then lasts only in memory.
      }
    },
  };
}

export function resolveHomologationConfig(
  enabled: string | undefined,
  apiKey: string | undefined,
  projectId: string | undefined,
): { apiKey: string; projectId: string } | null {
  if (enabled !== 'true' || !apiKey?.trim() || !projectId?.trim()) return null;
  return { apiKey: apiKey.trim(), projectId: projectId.trim() };
}

const config = resolveHomologationConfig(
  import.meta.env['VITE_FIREBASE_AUTH_HOMOLOGATION'],
  import.meta.env['VITE_FIREBASE_API_KEY'],
  import.meta.env['VITE_FIREBASE_PROJECT_ID'],
);

export function firebaseHomologationConfigured(): boolean {
  return config !== null;
}

let auth: ReturnType<typeof createFirebaseRestAuth> | null = null;
export function firebaseHomologationAuth(): ReturnType<typeof createFirebaseRestAuth> | null {
  if (!config || typeof window === 'undefined') return null;
  auth ??= createFirebaseRestAuth({
    apiKey: config.apiKey,
    storage: sessionTokenStorage(window.sessionStorage),
  });
  return auth;
}

export type HomologationCheck = 'verified' | 'denied' | 'unavailable';
/** A valid Firebase login is not authorization for any Cormyr house. */
export async function verifyFirebaseHomologationToken(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<HomologationCheck> {
  if (!token) return 'denied';
  try {
    const response = await fetcher('/api/firebase-auth-verify', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      // A 200 HTML fallback or another route must never be mistaken for
      // successful Firebase authentication.
      const body: unknown = await response.json();
      return body !== null && typeof body === 'object' &&
        'authenticated' in body && body.authenticated === true
        ? 'verified' : 'unavailable';
    }
    return response.status === 401 ? 'denied' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
