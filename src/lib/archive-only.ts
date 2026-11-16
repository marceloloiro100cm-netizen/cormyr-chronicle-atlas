/**
 * Temporary hard stop for the 15/11/2026 Lovable Cloud exit.
 *
 * This is deliberately a code-controlled switch. Do not disable until Firebase
 * Auth, Firestore, Storage permissions and real-role E2E tests pass in production.
 * Archive content in public/cormyr/ remains served as static assets.
 */
export const CORMYR_ARCHIVE_ONLY = true as const;

/** Tested boundary for server calls that still target legacy services. */
export function shouldBlockLegacyRequest(pathname: string, handlerType?: string): boolean {
  if (!CORMYR_ARCHIVE_ONLY) return false;
  // This separate Firebase Cloud endpoint enforces Admin Auth, per-house scope
  // and a server-only feature flag. All legacy and emulator APIs remain blocked.
  if (pathname === '/api/firebase-cloud-read' && handlerType !== 'serverFn') return false;
  return handlerType === 'serverFn' ||
    pathname === '/mcp' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/api' ||
    pathname.startsWith('/api/');
}

export const ARCHIVE_UNAVAILABLE_MESSAGE =
  'Conselho em manutenção. Os dados históricos estão preservados para a migração ao Firebase.' as const;
