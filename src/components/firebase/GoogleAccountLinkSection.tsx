import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {firebaseAccountRequest} from '@/lib/firebase-workspace/account-client';
import {googleAuthFeedback,linkGoogleWithCustomToken} from '@/integrations/auth/firebase-google-popup';
import {FirebaseAuthError} from '@/integrations/auth/firebase-rest-auth';

type GoogleLinkStatus={
 linked:boolean;
 googleEmail:string|null;
 hasPassword:boolean;
};

/**
 * Self-service Google account linking for already-authenticated Cormyr users.
 * Preserves the user's exact Firebase UID, profile, House scope and records.
 */
export function GoogleAccountLinkSection(){
 const [status,setStatus]=useState<GoogleLinkStatus|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 async function refresh(){
  setLoading(true);
  try{
   const result=await firebaseAccountRequest<GoogleLinkStatus>('googleStatus');
   setStatus(result);
  }catch{
   setStatus(null);
  }finally{
   setLoading(false);
  }
 }

 useEffect(()=>{void refresh();},[]);

 async function handleLink(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const {customToken}=await firebaseAccountRequest<{customToken:string}>('prepareGoogleLink');
   const linked=await linkGoogleWithCustomToken(customToken);
   setStatus(prev=>({
    linked:true,
    googleEmail:linked.googleEmail,
    hasPassword:prev?.hasPassword??true,
   }));
   setMessage('Conta Google vinculada com sucesso. Na próxima vez você já pode entrar com 1 clique pelo botão Google.');
  }catch(error){
   setMessage(error instanceof FirebaseAuthError
    ?googleAuthFeedback(error.code)
    :error instanceof Error?error.message:'Não foi possível vincular sua conta Google agora.');
  }finally{
   setBusy(false);
  }
 }

 async function handleUnlink(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const next=await firebaseAccountRequest<GoogleLinkStatus>('unlinkGoogle');
   setStatus(next);
   setMessage('Conta Google desvinculada. Seu acesso por e-mail e senha continua ativo.');
  }catch(error){
   setMessage(error instanceof Error?error.message:'Não foi possível desvincular a conta Google.');
  }finally{
   setBusy(false);
  }
 }

 return <section className="space-y-3 border-t pt-4 mt-4" aria-label="Vinculação com conta Google">
  <h3 className="text-sm font-semibold">Login com Google</h3>
  {loading?<p className="text-xs opacity-75" role="status">Verificando vínculo Google…</p>
  :!status?<p className="text-xs opacity-75">
   A consulta de vínculo Google não está disponível neste ambiente.
  </p>
  :status.linked?<div className="space-y-2">
   <p className="text-xs">
    Conta Google vinculada{status.googleEmail?<> (<strong>{status.googleEmail}</strong>)</>:''}.
    Você pode entrar usando o botão Google na tela inicial mantendo sua Casa e suas permissões.
   </p>
   {status.hasPassword
    ?<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void handleUnlink()}>
      {busy?'Desvinculando…':'Desvincular conta Google'}
     </Button>
    :<p className="text-xs opacity-75">Defina uma senha acima caso queira desvincular o Google.</p>}
  </div>
  :<div className="space-y-2">
   <p className="text-xs">
    Vincule sua conta Google a este perfil para entrar com 1 clique sem perder sua Casa, suas missivas ou suas fichas.
   </p>
   <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void handleLink()}>
    {busy?'Vinculando…':'Vincular minha conta Google'}
   </Button>
  </div>}
  {message&&<p className="text-xs" role="status">{message}</p>}
 </section>;
}
