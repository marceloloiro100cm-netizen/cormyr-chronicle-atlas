import { createMiddleware } from '@tanstack/react-start';
import { getFirebaseAuth } from './client';

// Anexa o ID token do Firebase às chamadas de server functions.
// Para ativar, registre em `functionMiddleware` de src/start.ts (hoje só o Supabase está registrado).
export const attachFirebaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const user = getFirebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
