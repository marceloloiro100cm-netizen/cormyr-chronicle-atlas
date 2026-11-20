import {useEffect,useRef,useState} from 'react';

/**
 * Google Identity Services supplies an OAuth ID token. The caller exchanges it
 * with Firebase Authentication; no Google credential is stored in this view.
 * Firebase and Atlas role checks remain separate from the Google account.
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
const googleClientId=String(import.meta.env.VITE_CORMYR_GOOGLE_CLIENT_ID??'').trim();
const supported=/^[0-9]+-[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com$/;

export function FirebaseGoogleSignIn({onCredential,disabled}:{
 onCredential:(credential:string)=>Promise<void>;
 disabled?:boolean;
}){
 const mount=useRef<HTMLDivElement>(null);
 const latest=useRef(onCredential);latest.current=onCredential;
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!supported.test(googleClientId))return;
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
 },[]);
 if(!supported.test(googleClientId))return <p className="campaign-hint">
  Acesso com Google aguardando ativação do provedor e do identificador OAuth do projeto.
 </p>;
 return <div aria-label="Entrar com Google" aria-disabled={disabled||undefined}>
  <div ref={mount} style={{pointerEvents:disabled?'none':'auto',opacity:disabled?.55:1}}/>
  {error&&<p role="status">{error}</p>}
 </div>;
}
