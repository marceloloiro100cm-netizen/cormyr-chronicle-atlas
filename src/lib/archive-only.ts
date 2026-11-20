/**
 * Temporary hard stop for the 15/11/2026 Lovable Cloud exit.
 *
 * This is deliberately a code-controlled switch. Do not disable until Firebase
 * Auth, Firestore, Storage permissions and real-role E2E tests pass in production.
 * Archive content in public/cormyr/ remains served as static assets.
 */
export const CORMYR_ARCHIVE_ONLY = true as const;

/**
 * Exact router carve-out for the Firebase-only public login, one-time
 * password-reset form and server-verified pilot page. These routes do not
 * grant authorization and do not open any legacy server functions.
 */
export function isFirebasePilotPage(pathname: string): boolean {
  return pathname === '/firebase-access' ||
    pathname === '/auth' ||pathname === '/reset-password';
}

/** Página pública do jornal (A Folha Sem Selo) para visitantes sem conta.
 * Lê só a API pública /api/public/newspaper, que devolve edições publicadas.
 */
export function isPublicReaderPage(pathname: string): boolean {
  return pathname === '/jornal';
}

/** Legacy player bookmarks route to Firebase; never to the retired backend.
 * /auth is now a real Firebase-only login form and is NOT redirected.
 */
export function shouldRedirectToFirebasePilot(pathname: string): boolean {
  return pathname === '/jogadores';
}

/** Tested boundary for server calls that still target legacy services. */
export function shouldBlockLegacyRequest(pathname: string, handlerType?: string): boolean {
  if (!CORMYR_ARCHIVE_ONLY) return false;
  // This separate Firebase Cloud endpoint enforces Admin Auth, per-house scope
  // and a server-only feature flag. All legacy and emulator APIs remain blocked.
  if ((pathname === '/api/firebase-cloud-read' ||
       // Original council adapter: verifies Firebase ID token and current
       // House/profile scope on every request, including operational writes.
       pathname === '/api/firebase-workspace' ||
       pathname === '/api/firebase-cloud-mail' ||
       // Firebase narrator-only pending week proposal; never a calendar publish.
       pathname === '/api/firebase-narrator-week' ||
       // Activation is its own Firebase-only, narrator-authenticated route.
       // The route is gated in apphosting.yaml and revalidates the original
       // House sheet inside Firestore before each create-only transaction.
       pathname === '/api/firebase-house-activation' ||
       // Migrated endpoints retain their own feature flags, Firebase Auth
       // and transaction-level scope checks. Routing is not write approval.
       pathname === '/api/firebase-accounts' ||
       pathname === '/api/firebase-house-source' ||
       pathname === '/api/firebase-house-operation' ||
       pathname === '/api/firebase-house-rules' ||
       pathname === '/api/firebase-private-media' ||
       pathname === '/api/firebase-cloud-newspaper' ||
       // These four are READ ONLY, with separate runtime flags, Firebase
       // token validation, strict per-House access and deny-by-default rules.
       pathname === '/api/firebase-cloud-house-quote' ||
       pathname === '/api/firebase-operational-economy' ||
       pathname === '/api/firebase-house-reconciliation-audit' ||
       pathname === '/api/firebase-treasury-audit' ||
       pathname === '/api/public/gm-content' ||
       // Public newspaper: published editions only, own feature flag and
       // anonymous per-device read counter; never drafts, mail or Houses.
       pathname === '/api/public/newspaper') && handlerType !== 'serverFn') return false;
  return handlerType === 'serverFn' ||
    pathname === '/mcp' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/api' ||
    pathname.startsWith('/api/');
}

export const ARCHIVE_UNAVAILABLE_MESSAGE =
  'Conselho em manutenção. Os dados históricos estão preservados para a migração ao Firebase.' as const;
