import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CampaignShell } from '@/components/campaign-shell';
import { oauthReturnPath } from '@/lib/oauth-return-path';
import { firebasePilotAuth } from '@/lib/auth/firebase-pilot-session';
import { FirebaseAuthError } from '@/integrations/auth/firebase-rest-auth';
import { FirebaseGoogleSignIn } from '@/components/firebase/FirebaseGoogleSignIn';
import { firebasePilotLoginFailure } from '@/lib/auth/firebase-pilot-login-feedback';
import { loadFirebasePublicSeasonHouses } from '@/lib/auth/season-houses';
import { takeLoginMessage } from '@/lib/auth/firebase-login-handoff';

export const Route = createFileRoute('/auth')({
 validateSearch: (search: Record<string, unknown>) => ({
  next: oauthReturnPath(search['next']),
 }),
 head: () => ({meta: [
  {title: 'Entrar no Atlas Cormyr'},
  {name: 'description', content: 'Entrada segura pelo Firebase para jogadores da segunda temporada de Cormyr.'},
  {property: 'og:title', content: 'Entrar no Atlas Cormyr'},
  {property: 'og:description', content: 'Área reservada às casas e jogadores autorizados.'},
  {property: 'og:type', content: 'website'},
  {name: 'twitter:card', content: 'summary'},
 ]}),
 component: Auth,
});

function Auth() {
 const navigate = useNavigate();
 const [email,setEmail] = useState('');
 const [password,setPassword] = useState('');
 // Aviso deixado pela área interna ao voltar para esta única tela de login.
 const [message,setMessage] = useState('');
 useEffect(()=>{const notice=takeLoginMessage();if(notice)setMessage(notice);},[]);
 const [busy,setBusy] = useState(false);
 // Depois do login, volta à tela da área interna que a pessoa tentou abrir
 // (link de outra guia ou enviado no grupo). Só aceita /firebase-access.
 const {next} = Route.useSearch();
 const insideSearch = next.startsWith('/firebase-access?')
  ? Object.fromEntries([...new URLSearchParams(next.slice('/firebase-access?'.length))].slice(0,20))
  : null;
 const goInside = () => insideSearch
  ? navigate({to:'/firebase-access',search:insideSearch as never})
  : navigate({to:'/firebase-access'});

 // A single Firebase session is shared with /firebase-access in this tab.
 // Never treat an old Supabase JWT or a House chosen on the login form
 // as proof of authorization to read campaign data.
 useEffect(() => {
  let active = true;
  void firebasePilotAuth()?.getToken().then(token => {
   if(active && token)void goInside();
  }).catch(()=>{});
  return () => { active = false; };
 },[navigate]);

 const housesQuery = useQuery({
  queryKey:['season-houses'],
  retry:false,
  staleTime:60_000,
  queryFn:()=>loadFirebasePublicSeasonHouses(),
 });
 const houses = (housesQuery.data?.houses ?? []).filter(h => h.id !== 'espiao');
 const houseErrors = housesQuery.data?.errors ?? (housesQuery.error ? ['Catálogo de Casas indisponível.'] : []);
 const loadingHouses = housesQuery.isPending || housesQuery.isFetching;

 async function submit(event:FormEvent) {
  event.preventDefault();
  if(busy)return;
  setBusy(true);setMessage('');
  let signedIn = false;
  const auth = firebasePilotAuth();
  try{
   if(!auth)throw Error('Firebase Auth indisponível');
   await auth.signInWithPassword(email.trim(),password);
   signedIn = true;
   setPassword('');
   // Pré-carrega o chunk do Conselho em paralelo com a navegação para /firebase-access.
   void import('@/components/firebase/FirebaseCampaignWorkspace');
   // The Firebase-only destination independently verifies UID, profile,
   // House scope and runtime; this page never grants a role or a House.
   await goInside();
  }catch{
   if(signedIn)auth?.signOut();
   setMessage(firebasePilotLoginFailure(signedIn));
  }finally{setBusy(false);}
 }

 async function signInWithGoogle(credential:string){
  if(busy)return;
  setBusy(true);setMessage('');
  const auth=firebasePilotAuth();
  let signedIn=false;
  try{
   if(!auth)throw Error('Firebase Auth indisponível');
   await auth.signInWithGoogleIdToken(credential,window.location.origin+'/auth');
   signedIn=true;
   await goInside();
  }catch(e){
   if(signedIn)auth?.signOut();
   setMessage(e instanceof FirebaseAuthError&&e.code==='ACCOUNT_LINK_REQUIRED'
    ?'Esta conta Google precisa ser vinculada à conta Firebase já existente. Entre com e-mail e senha e solicite a vinculação ao administrador.'
    :signedIn?firebasePilotLoginFailure(true):
     'Não foi possível entrar com Google. Verifique se o provedor está habilitado no Firebase e se esta conta possui acesso ao Atlas.');
  }finally{setBusy(false);}
 }

 async function requestPasswordReset(){
  if(busy || !email.trim()){
   if(!email.trim())setMessage('Informe seu e-mail para recuperar a senha.');
   return;
  }
  setBusy(true);setMessage('');
  try{
   await firebasePilotAuth()?.requestPasswordReset(email.trim());
  }catch{
   // Same response for unknown emails, disabled users and provider errors.
  }finally{
   setBusy(false);
   setMessage('Se a conta existir e a recuperação estiver disponível, você receberá um e-mail com as instruções.');
  }
 }

 return <CampaignShell publicTime>
  <p className="campaign-eyebrow">SEGUNDA TEMPORADA · CORMYR</p>
  <h1>Portal de Cormyr</h1>
  <div className="campaign-auth-layout">
   <section className="campaign-auth">
    <h2>Entrar com Firebase</h2>
    <form onSubmit={submit} className="campaign-form">
     <label>E-mail
      <input type="email" required autoComplete="email" value={email}
       onChange={e=>setEmail(e.target.value)}/>
     </label>
     <label>Senha
      <input type="password" minLength={6} required autoComplete="current-password"
       value={password} onChange={e=>setPassword(e.target.value)}/>
     </label>
     <p className="campaign-hint">
      O perfil, a Casa e as permissões são conferidos no Firebase.
      O login não autoriza funções da campanha ainda não homologadas.
     </p>
     <Button disabled={busy} type="submit">{busy?'Verificando…':'Entrar com Firebase'}</Button>
     <Button disabled={busy||!email.trim()} type="button" variant="outline"
      onClick={()=>void requestPasswordReset()}>Recuperar senha</Button>
    </form>
    <div className="campaign-auth-google">
     <p className="campaign-hint">Ou entre com sua conta Google:</p>
     <FirebaseGoogleSignIn disabled={busy} onCredential={signInWithGoogle}/>
    </div>
    {message&&<p role="status">{message}</p>}
   </section>
   <section>
    <h2>Casas da segunda temporada</h2>
    <p>O catálogo público é informativo e não define sua Casa autorizada.</p>
    {loadingHouses&&<p role="status">Consultando Casas…</p>}
    {!loadingHouses&&houseErrors.length>0&&<div role="status">
     <p>Catálogo público temporariamente indisponível. O login Firebase continua disponível.</p>
     <Button type="button" variant="outline" onClick={()=>void housesQuery.refetch()}>Tentar novamente</Button>
    </div>}
    {!loadingHouses&&!houseErrors.length&&!houses.length&&
     <p role="status">Nenhuma Casa publicada no momento.</p>}
    <ul className="campaign-roster">{houses.map(h=><li key={h.id}>{h.name}</li>)}</ul>
   </section>
  </div>
 </CampaignShell>;
}
