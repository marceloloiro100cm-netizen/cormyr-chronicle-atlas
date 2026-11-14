/**
 * Firebase authentication smoke test. No database writes, profile lookup,
 * permissions or Supabase fallback are allowed in this endpoint.
 */
import { authenticateFirebase } from './firebase-auth-core.server';
import {
  cachedSecuretokenJwks, verifyFirebaseIdToken, type FirebaseIdClaims,
} from './firebase-id-token.server';

const jwks = cachedSecuretokenJwks();
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
  'X-Content-Type-Options': 'nosniff',
};

export interface HomologationServerConfig {
  enabled: boolean;
  projectId: string | undefined;
  /** Used by tests; the live handler uses the Google JWKS verifier. */
  verifyToken?: (token: string) => Promise<FirebaseIdClaims>;
}

export async function verifyFirebaseHomologationRequest(
  request: Request,
  config: HomologationServerConfig,
): Promise<Response> {
  if (!config.enabled || !config.projectId) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }
  try {
    await authenticateFirebase(
      request.headers.get('authorization'),
      config.verifyToken ?? (token => verifyFirebaseIdToken(token, { projectId: config.projectId!, jwks })),
    );
    // Deliberately return no UID, email or campaign data.
    return Response.json({ authenticated: true }, { status: 200, headers });
  } catch {
    return Response.json({ authenticated: false }, { status: 401, headers });
  }
}
