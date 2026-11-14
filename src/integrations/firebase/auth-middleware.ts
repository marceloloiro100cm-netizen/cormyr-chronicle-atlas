import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { bearerToken } from './bearer';

// Equivalente a requireSupabaseAuth para Firebase Auth: entrega a identidade verificada.
// A autorização por Casa/papel é resolvida pela camada de dados com `userId`.
export const requireFirebaseAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const token = bearerToken(getRequest()?.headers.get('authorization'));
  if (!token) throw new Error('Unauthorized: Invalid token');
  const { verifyFirebaseIdToken } = await import('./admin.server');
  let user: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  try {
    user = await verifyFirebaseIdToken(token);
  } catch {
    throw new Error('Unauthorized: Invalid token');
  }
  return next({ context: { userId: user.uid, email: user.email } });
});
