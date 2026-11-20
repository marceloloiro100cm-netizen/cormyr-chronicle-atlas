import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';

/** Official pinned Firebase browser modules, fetched only by the login page.
 * Password login and the private workspace do not depend on this download. */
const SDK_BASE='https://www.gstatic.com/firebasejs/12.0.0/';
type GoogleAuth={signOut:()=>Promise<void>;signIn:()=>Promise<string>};
let ready:Promise<GoogleAuth>|null=null;
export function prepareGoogleSignIn():Promise<GoogleAuth>{
 if(ready)return ready;
 ready=(async()=>{
  const appUrl=SDK_BASE+'firebase-app.js',authUrl=SDK_BASE+'firebase-auth.js';
  const [appSdk,authSdk]=await Promise.all([
   import(/* @vite-ignore */ appUrl),import(/* @vite-ignore */ authUrl),
  ]);
  const app=appSdk.getApps().find((a:{name:string})=>a.name==='cormyr-google-login')
   ??appSdk.initializeApp(FIREBASE_PUBLIC_CONFIG,'cormyr-google-login');
  const auth=authSdk.initializeAuth(app,{
   persistence:authSdk.inMemoryPersistence,
   popupRedirectResolver:authSdk.browserPopupRedirectResolver,
  });
  const provider=new authSdk.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  return {
   signOut:()=>authSdk.signOut(auth),
   async signIn(){
    const result=await authSdk.signInWithPopup(auth,provider);
    return result.user.refreshToken as string;
   },
  };
 })().catch(error=>{ready=null;throw error;});
 return ready;
}
export async function googleRefreshToken():Promise<string>{
 const sdk=await prepareGoogleSignIn();
 try{return await sdk.signIn();}
 finally{await sdk.signOut().catch(()=>{});}
}
export function googleLoginMessage(error:unknown):string{
 const code=(error as {code?:string}|null)?.code;
 if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')
  return 'Entrada com Google cancelada. Você pode tentar novamente.';
 if(code==='auth/popup-blocked')
  return 'Permita a janela de login do Google neste navegador e tente novamente.';
 if(code==='auth/operation-not-allowed'||code==='auth/configuration-not-found')
  return 'O login com Google ainda precisa ser habilitado no Firebase.';
 if(code==='auth/unauthorized-domain')
  return 'Este domínio precisa ser autorizado para o login com Google no Firebase.';
 if(code==='auth/account-exists-with-different-credential')
  return 'Entre com seu e-mail e senha para confirmar a conta já cadastrada.';
 return 'Não foi possível entrar com Google. Tente novamente ou use e-mail e senha.';
}
