/**
 * Temporary hard stop for the 15/11/2026 Lovable Cloud exit.
 *
 * This is deliberately a code-controlled switch. Do not disable until Firebase
 * Auth, Firestore, Storage permissions and real-role E2E tests pass in production.
 * Archive content in public/cormyr/ remains served as static assets.
 */
export const CORMYR_ARCHIVE_ONLY = true as const;

/**
 * Exact router carve-out for the separate Firebase-only pilot. This does NOT
 * grant any authentication, database access, or write capability.
 */
export function isFirebasePilotPage(pathname: string): boolean {
  return pathname === '/firebase-access';
}

/** Legacy login/bookmark paths route only to the Firebase-authenticated pilot.
 * All other legacy routes remain archive-only, with no Supabase fallback.
 */
export function shouldRedirectToFirebasePilot(pathname: string): boolean {
  return pathname === '/auth' || pathname === '/jogadores';
}

/** Tested boundary for server calls that still target legacy services. */
export function shouldBlockLegacyRequest(pathname: string, handlerType?: string): boolean {
  if (!CORMYR_ARCHIVE_ONLY) return false;
  // This separate Firebase Cloud endpoint enforces Admin Auth, per-house scope
  // and a server-only feature flag. All legacy and emulator APIs remain blocked.
  if ((pathname === '/api/firebase-cloud-read' ||
    pathname === '/api/firebase-cloud-mail') && handlerType !== 'serverFn') return false;
  return handlerType === 'serverFn' ||
    pathname === '/mcp' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/api' ||
    pathname.startsWith('/api/');
}

export const ARCHIVE_UNAVAILABLE_MESSAGE =
  'Conselho em manutenção. Os dados históricos estão preservados para a migração ao Firebase.' as const;
