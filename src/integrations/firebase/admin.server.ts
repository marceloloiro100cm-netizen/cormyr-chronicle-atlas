import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FIREBASE_PUBLIC_CONFIG } from './public-config';

// Firebase Admin no servidor. No App Hosting usa as credenciais padrão da conta de
// serviço do backend; com emulador (FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST)
// não precisa de credenciais. Nenhuma chave é guardada no repositório.
export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env['GCLOUD_PROJECT'] ?? FIREBASE_PUBLIC_CONFIG.projectId;
  const emulated = Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST'] || process.env['FIRESTORE_EMULATOR_HOST']);
  return initializeApp(emulated ? { projectId } : { projectId, credential: applicationDefault() });
}

export type VerifiedFirebaseUser = { uid: string; email: string | null; emailVerified: boolean };

// Verifica assinatura, validade e revogação do ID token. O token prova identidade,
// nunca autorização: permissões por Casa vêm do banco a cada requisição, não de claims.
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseUser> {
  const decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
  return { uid: decoded.uid, email: decoded.email ?? null, emailVerified: decoded.email_verified === true };
}
