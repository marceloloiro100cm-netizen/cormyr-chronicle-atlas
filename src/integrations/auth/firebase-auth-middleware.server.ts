/** Function middleware for Firebase-backed server functions. Not registered
 * anywhere yet. It provides `userId` and `firebaseClaims` only: data access
 * for these functions comes from the Firebase domain services, never from a
 * Supabase client. */
import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { authenticateFirebase } from './firebase-auth-core.server';
import { cachedSecuretokenJwks, verifyFirebaseIdToken } from './firebase-id-token.server';

const jwks = cachedSecuretokenJwks();

export const requireFirebaseAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (!projectId) throw new Error('Missing Firebase environment variable(s): FIREBASE_PROJECT_ID.');
  const request = getRequest();
  if (!request?.headers) throw new Error('Unauthorized: No request headers available');
  const context = await authenticateFirebase(request.headers.get('authorization'),
    token => verifyFirebaseIdToken(token, { projectId, jwks }));
  return next({ context });
});
