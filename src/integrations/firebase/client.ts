import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { FIREBASE_PUBLIC_CONFIG } from './public-config';

// Cliente de navegador do Firebase. Ainda não está ligado ao login do site:
// o Supabase Auth segue ativo até o corte da fatia 0 (ver docs/firebase/PHASE-2-PLAN.md).
let authInstance: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp({ ...FIREBASE_PUBLIC_CONFIG });
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const auth = getAuth(getFirebaseApp());
  const emulatorHost = import.meta.env['VITE_FIREBASE_AUTH_EMULATOR_HOST'] as string | undefined;
  if (emulatorHost) connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
  authInstance = auth;
  return auth;
}
