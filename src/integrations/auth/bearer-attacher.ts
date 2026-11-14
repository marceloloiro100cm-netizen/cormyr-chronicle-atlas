/** Client middleware that attaches the bearer token from the selected backend.
 * Not registered in src/start.ts: the app keeps `attachSupabaseAuth` until the
 * server accepts Firebase ID tokens and the role-based E2E tests pass. */
import { createMiddleware } from '@tanstack/react-start';
import { bearerHeaders, selectAuthBackend, type AuthBackend, type AuthTokenProvider } from './token-provider';

export interface BearerSources {
  supabase: AuthTokenProvider;
  firebase: AuthTokenProvider;
}

/** Pure core: picks the provider by flag and returns the headers. A failure of
 * the selected backend yields no header; it never falls back to the other one. */
export async function resolveBearerHeaders(flag: string | null | undefined, sources: BearerSources): Promise<Record<string, string>> {
  const backend: AuthBackend = selectAuthBackend(flag);
  return bearerHeaders(sources[backend]);
}

export function createBearerAttacher(getFlag: () => string | null | undefined, sources: () => BearerSources) {
  return createMiddleware({ type: 'function' }).client(async ({ next }) =>
    next({ headers: await resolveBearerHeaders(getFlag(), sources()) }),
  );
}
