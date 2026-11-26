import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';

/**
 * Google Sign-In button for /auth.
 *
 * - If VITE_CORMYR_GOOGLE_CLIENT_ID is configured at build time, uses Google
 *   Identity Services (GSI) and exchanges the credential via REST.
 * - Otherwise, renders a native button backed by lazy-loaded Firebase Auth
 *   `signInWithPopup(auth, GoogleAuthProvider)` (zero extra Client ID needed
 *   in source; requires only enabling the Google provider in Firebase Console).
 *
 * Firebase and Atlas role/House checks always remain server-side.
 */
type GoogleIdentity={
 accounts:{id:{
  initialize(options:{client_id:string;callback:(response:{credential?:string})=>void;
   ux_mode:'popup';auto_select:false}):void;
  renderButton(element:HTMLElement,options:{theme:string;size:string;text:string;
   locale:string;width:number}):void;
 }};
};
type GoogleWindow=Window&{google?:GoogleIdentity};
const googleClientId=String(import.meta.env['VITE_CORMYR_GOOGLE_CLIENT_ID']??'').trim();
const supported=/^[0-9]+-[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com$/;

function GoogleLogo(){
 return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
 </svg>;
}

export function FirebaseGoogleSignIn({onCredential,onPopupSignIn,disabled}:{
 onCredential:(credential:string)=>Promise<void>;
 onPopupSignIn?:()=>Promise<void>;
 disabled?:boolean;
}){
 const useGsi=supported.test(googleClientId);
 const mount=useRef<HTMLDivElement>(null);
 const latest=useRef(onCredential);latest.current=onCredential;
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!useGsi)return;
  let active=true;
  const render=()=>{
   const id=(window as GoogleWindow).google?.accounts.id;
   if(!active||!id||!mount.current)return;
   id.initialize({
    client_id:googleClientId,ux_mode:'popup',auto_select:false,
    callback:response=>{
     if(!active||!response.credential)return;
     void latest.current(response.credential);
    },
   });
   mount.current.replaceChildren();
   id.renderButton(mount.current,{
    theme:'outline',size:'large',text:'signin_with',locale:'pt-BR',width:260,
   });
  };
  const scriptId='cormyr-google-identity-client';
  let script=document.getElementById(scriptId) as HTMLScriptElement|null;
  if((window as GoogleWindow).google?.accounts?.id){render();}
  else{
   if(!script){
    script=document.createElement('script');
    script.id=scriptId;script.src='https://accounts.google.com/gsi/client';
    script.async=true;script.defer=true;
    document.head.appendChild(script);
   }
   script.addEventListener('load',render);
   script.addEventListener('error',()=>{if(active)setError('O acesso Google não pôde ser carregado.');});
  }
  return ()=>{active=false;script?.removeEventListener('load',render);};
 },[useGsi]);
 if(!useGsi){
  if(!onPopupSignIn)return <p className="campaign-hint">
   Acesso com Google aguardando ativação do provedor no projeto Firebase.
  </p>;
  return <div aria-label="Entrar com Google">
   <Button type="button" variant="outline" disabled={disabled}
    className="w-full max-w-[280px] justify-center gap-2"
    onClick={()=>void onPopupSignIn()}>
    <GoogleLogo/>
    <span>{disabled?'Conectando ao Google…':'Entrar com Google'}</span>
   </Button>
  </div>;
 }
 return <div aria-label="Entrar com Google" aria-disabled={disabled||undefined}>
  <div ref={mount} style={{pointerEvents:disabled?'none':'auto',opacity:disabled ? 0.55 : 1}}/>
  {error&&<p role="status">{error}</p>}
 </div>;
}
