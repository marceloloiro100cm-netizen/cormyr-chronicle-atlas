import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CampaignShell } from '@/components/campaign-shell';
import { oauthReturnPath } from '@/lib/oauth-return-path';
import { firebasePilotAuth } from '@/lib/auth/firebase-pilot-session';
import { firebasePilotLoginFailure } from '@/lib/auth/firebase-pilot-login-feedback';
import { loadFirebasePublicSeasonHouses } from '@/lib/auth/season-houses';
import { takeLoginMessage } from '@/lib/auth/firebase-login-handoff';

export const Route = createFileRoute('/auth')({
 validateSearch: (search: Record<string, unknown>) => ({
  next: oauthReturnPath(search['next']),
 }),
 head: () => ({meta: [
  {title: 'Entrar com Firebase — Cormyr Chronicle'},
  {name: 'description', content: 'Entrada segura pelo Firebase para jogadores da segunda temporada de Cormyr.'},
  {property: 'og:title', content: 'Entrar — Cormyr Chronicle'},
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

 // A single Firebase session is shared with /firebase-access in this tab.
 // Never treat an old Supabase JWT or a House chosen on the login form
 // as proof of authorization to read campaign data.
 useEffect(() => {
  let active = true;
  void firebasePilotAuth()?.getToken().then(token => {
   if(active && token)void navigate({to:'/firebase-access'});
  }).catch(()=>{});
  return () => { active = false; };
 },[navigate]);

 const housesQuery = useQuery({
  queryKey:['season-houses'],
  retry:1,
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
   // The Firebase-only destination independently verifies UID, profile,
   // House scope and runtime; this page never grants a role or a House.
   await navigate({to:'/firebase-access'});
  }catch{
   if(signedIn)auth?.signOut();
   setMessage(firebasePilotLoginFailure(signedIn));
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
