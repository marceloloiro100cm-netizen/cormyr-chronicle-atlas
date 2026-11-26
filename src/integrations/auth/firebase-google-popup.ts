import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';
import {FirebaseAuthError} from './firebase-rest-auth';

/**
 * Lazy-loaded Firebase Auth Web SDK wrapper used exclusively for Google
 * sign-in and self-service Google account linking popups.
 *
 * Uses `inMemoryPersistence` so it never creates duplicate IndexedDB sessions
 * alongside `firebasePilotAuth()`'s shared localStorage session, and adds 0 KB
 * to the initial bundle until the user clicks a Google button.
 */
const POPUP_APP_NAME = 'cormyr-google-popup';

export type GooglePopupSession = {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type GoogleLinkResult = {
  linked: true;
  googleEmail: string | null;
};

function mapFirebasePopupError(error: unknown): FirebaseAuthError {
  if (error instanceof FirebaseAuthError) return error;
  const code =
    typeof (error as {code?: unknown} | null)?.code === 'string'
      ? (error as {code: string}).code
      : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new FirebaseAuthError('POPUP_CLOSED');
    case 'auth/popup-blocked':
      return new FirebaseAuthError('POPUP_BLOCKED');
    case 'auth/unauthorized-domain':
      return new FirebaseAuthError('UNAUTHORIZED_DOMAIN');
    case 'auth/operation-not-allowed':
      return new FirebaseAuthError('PROVIDER_DISABLED');
    case 'auth/account-exists-with-different-credential':
      return new FirebaseAuthError('ACCOUNT_LINK_REQUIRED');
    case 'auth/credential-already-in-use':
      return new FirebaseAuthError('CREDENTIAL_ALREADY_IN_USE');
    case 'auth/provider-already-linked':
      return new FirebaseAuthError('ALREADY_LINKED');
    case 'auth/user-disabled':
      return new FirebaseAuthError('USER_DISABLED');
    case 'auth/network-request-failed':
      return new FirebaseAuthError('NETWORK');
    default:
      return new FirebaseAuthError('GOOGLE_AUTH_FAILED');
  }
}

async function ephemeralAuth() {
  const [{getApps, initializeApp}, authMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const existing = getApps().find(app => app.name === POPUP_APP_NAME);
  const app = existing ?? initializeApp(FIREBASE_PUBLIC_CONFIG, POPUP_APP_NAME);
  let auth;
  try {
    auth = authMod.initializeAuth(app, {
      persistence: authMod.inMemoryPersistence,
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    });
  } catch {
    auth = authMod.getAuth(app);
  }
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({prompt: 'select_account'});
  return {auth, authMod, provider};
}

export async function signInWithGooglePopup(): Promise<GooglePopupSession> {
  const {auth, authMod, provider} = await ephemeralAuth();
  try {
    const result = await authMod.signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    const refreshToken = result.user.refreshToken;
    const uid = result.user.uid;
    if (!uid || !idToken || !refreshToken) {
      throw new FirebaseAuthError('BAD_RESPONSE');
    }
    return {uid, idToken, refreshToken, expiresIn: 3600};
  } catch (error) {
    throw mapFirebasePopupError(error);
  } finally {
    await authMod.signOut(auth).catch(() => {});
  }
}

export async function linkGoogleWithCustomToken(customToken: string): Promise<GoogleLinkResult> {
  if (typeof customToken !== 'string' || customToken.length < 20) {
    throw new FirebaseAuthError('INVALID_CUSTOM_TOKEN');
  }
  const {auth, authMod, provider} = await ephemeralAuth();
  try {
    const signed = await authMod.signInWithCustomToken(auth, customToken);
    const linked = await authMod.linkWithPopup(signed.user, provider);
    const googleProvider = linked.user.providerData.find(p => p.providerId === 'google.com');
    return {
      linked: true,
      googleEmail: googleProvider?.email ?? null,
    };
  } catch (error) {
    throw mapFirebasePopupError(error);
  } finally {
    await authMod.signOut(auth).catch(() => {});
  }
}

export function googleAuthFeedback(code: string): string {
  switch (code) {
    case 'POPUP_CLOSED':
      return 'Login com Google cancelado.';
    case 'POPUP_BLOCKED':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.';
    case 'UNAUTHORIZED_DOMAIN':
      return 'Este domínio ainda não está autorizado no Firebase Authentication.';
    case 'PROVIDER_DISABLED':
      return 'O provedor Google ainda precisa ser ativado no Firebase Console (Authentication → Sign-in method).';
    case 'ACCOUNT_LINK_REQUIRED':
      return 'Esta conta Google precisa ser vinculada à sua conta já existente. Entre com e-mail e senha e clique em «Conta Google» no topo do Conselho para vincular.';
    case 'CREDENTIAL_ALREADY_IN_USE':
      return 'Esta conta Google já está vinculada a outro usuário do Firebase. Use outra conta Google ou fale com o Narrador.';
    case 'ALREADY_LINKED':
      return 'Sua conta já possui um login Google vinculado.';
    case 'USER_DISABLED':
      return 'Esta conta está desativada no Firebase. Fale com o Narrador.';
    case 'NETWORK':
      return 'Falha de conexão ao comunicar com o Google. Tente novamente.';
    default:
      return 'Não foi possível concluir o acesso com Google. Verifique se o provedor está habilitado no Firebase e se esta conta possui acesso ao Atlas.';
  }
}
