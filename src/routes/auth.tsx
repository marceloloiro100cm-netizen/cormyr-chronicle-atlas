import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CampaignShell } from '@/components/campaign-shell';
import { oauthReturnPath } from '@/lib/oauth-return-path';

export const Route = createFileRoute('/auth')({
 validateSearch: (search: Record<string, unknown>) => ({
  next: oauthReturnPath(search['next']),
 }),
 head: () => ({meta: [
  {title: 'Entrar — Cormyr Chronicle'},
  {name: 'description', content: 'Entrada segura para jogadores da segunda temporada de Cormyr.'},
  {property: 'og:title', content: 'Entrar — Cormyr Chronicle'},
  {property: 'og:description', content: 'Área reservada às casas e jogadores autorizados.'},
  {property: 'og:type', content: 'website'},
  {name: 'twitter:card', content: 'summary'},
 ]}),
 component: Auth,
});

function Auth() {
 const navigate = useNavigate();
 const { next } = Route.useSearch();
 const destino = next === '/' ? '/jogadores' : next;
 const [email,setEmail] = useState('');
 const [password,setPassword] = useState('');
 const [house,setHouse] = useState('');
 const [message,setMessage] = useState('');
 const [busy,setBusy] = useState(false);
 useEffect(() => {
  void supabase.auth.getUser().then(({data})=>{
   if(data.user)void navigate({to:destino});
  });
 },[navigate,destino]);
 const {data:houses=[]} = useQuery({
  queryKey:['season-houses'],
  queryFn:async()=>{
   const [result,players]=await Promise.all([
    supabase.from('campaign_houses').select('id,name').eq('active',true).eq('season',2).order('name'),
    supabase.rpc('public_player_houses'),
   ]);
   if(result.error)throw result.error;
   if(players.error)throw players.error;
   const ids=new Set(players.data.map(p=>p.house_id));
   return result.data.filter(h=>ids.has(h.id));
  },
 });
 async function submit(event:FormEvent) {
  event.preventDefault();
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;
   // House selection is only a preference, never authorization.
   sessionStorage.setItem('campaign-selected-house',house==='narrador'?'':house);
   await navigate({to:destino});
  }catch(e){
   setMessage(e instanceof Error?e.message:'Não foi possível entrar.');
  }finally{setBusy(false);}
 }
 return <CampaignShell>
  <p className="campaign-eyebrow">SEGUNDA TEMPORADA · CORMYR</p>
  <h1>Área dos jogadores</h1>
  <div className="campaign-auth-layout">
   <section className="campaign-auth">
    <h2>Entrar no conselho</h2>
    <form onSubmit={submit} className="campaign-form">
     <label>Casa ou Narrador
      <select value={house} onChange={e=>setHouse(e.target.value)}>
       <option value="">Escolha sua casa</option>
       <option value="narrador">Narrador</option>
       {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
     </label>
     <label>Email
      <input type="email" required autoComplete="email" value={email}
       onChange={e=>setEmail(e.target.value)}/>
     </label>
     <label>Senha
      <input type="password" minLength={6} required autoComplete="current-password"
       value={password} onChange={e=>setPassword(e.target.value)}/>
     </label>
     <Button disabled={busy} type="submit">{busy?'Aguarde…':'Entrar'}</Button>
    </form>
    {message&&<p role="status">{message}</p>}
   </section>
   <section>
    <h2>Casas da segunda temporada</h2>
    <p>Oito casas da lista oficial da campanha.</p>
    <ul className="campaign-roster">{houses.map(h=><li key={h.id}>{h.name}</li>)}</ul>
   </section>
  </div>
 </CampaignShell>;
}
