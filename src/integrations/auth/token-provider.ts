/** Provider-neutral seam for the bearer token the app sends to server functions.
 * Default stays Supabase; nothing here is wired into src/start.ts yet. */
export interface AuthTokenProvider {
  getToken(): Promise<string | null>;
}
export type AuthBackend = 'supabase' | 'firebase';

/** Only the exact value "firebase" selects Firebase; anything else keeps Supabase. */
export function selectAuthBackend(flag: string | undefined | null): AuthBackend {
  return flag === 'firebase' ? 'firebase' : 'supabase';
}

export async function bearerHeaders(provider: AuthTokenProvider): Promise<Record<string, string>> {
  let token: string | null = null;
  try { token = await provider.getToken(); } catch { token = null; }
  return token ? { Authorization: `Bearer ${token}` } : {};
}
