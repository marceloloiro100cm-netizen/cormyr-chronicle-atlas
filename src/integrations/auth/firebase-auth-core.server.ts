/** Pure request authentication for Firebase-backed server functions. Mirrors
 * the header rules of requireSupabaseAuth (same error messages) and verifies
 * the ID token with the injected verifier. */
import type { FirebaseIdClaims } from './firebase-id-token.server';

export function bearerFromHeader(header: string | null | undefined): string {
  if (!header) throw new Error('Unauthorized: No authorization header provided');
  if (!header.startsWith('Bearer ')) throw new Error('Unauthorized: Only Bearer tokens are supported');
  const token = header.slice('Bearer '.length);
  if (!token) throw new Error('Unauthorized: No token provided');
  if (token.split('.').length !== 3) throw new Error('Unauthorized: Invalid token');
  return token;
}

export interface FirebaseAuthContext { userId: string; firebaseClaims: FirebaseIdClaims }

export async function authenticateFirebase(
  header: string | null | undefined,
  verify: (token: string) => Promise<FirebaseIdClaims>,
): Promise<FirebaseAuthContext> {
  const token = bearerFromHeader(header);
  let claims: FirebaseIdClaims;
  try { claims = await verify(token); } catch { throw new Error('Unauthorized: Invalid token'); }
  if (!claims.uid) throw new Error('Unauthorized: No user ID found in token');
  return { userId: claims.uid, firebaseClaims: claims };
}
