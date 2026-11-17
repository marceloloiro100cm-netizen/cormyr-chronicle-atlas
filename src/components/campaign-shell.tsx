import { lazy, Suspense, type ReactNode } from 'react';
import type { HeraldicHouse } from '@/lib/house/heraldry';
import {useQuery} from '@tanstack/react-query';
import { LanguageSwitcher } from './language-switcher';
import { useTranslation } from '@/lib/i18n/context';
import {publicCampaignTimeProjection} from '@/lib/calendar/public-time';

// Carregado sob demanda: mantém o cliente Supabase fora do bundle público.
const PrivateClockBody=lazy(()=>import('./campaign-private-clock'));
/** O relógio completo só é consultado após a autenticação. */
function PrivateClock(){
 return <Suspense fallback={<small aria-live="polite">Consultando data oficial…</small>}>
  <PrivateClockBody/>
 </Suspense>;
}
/** A página de login nunca chama RPC privado ou assina Realtime do calendário. */
function PublicClock(){
 const clock=useQuery({
  queryKey:['campaign-calendar-public-projection'],
  queryFn:async()=>{
   const response=await fetch('/api/public/time',{method:'GET',
    credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error('Calendário público indisponível.');
   return publicCampaignTimeProjection(await response.json());
  },retry:false,refetchInterval:30000,
 });
 return <small aria-live="polite">{clock.data&&!clock.isError?
  `Crônicas do Reino · ${clock.data.period}`:
  clock.isError?'Data oficial indisponível':'Consultando data oficial…'}</small>;
}
export function CampaignShell({ children,publicTime=false,heraldry=null }: {
 children:ReactNode;publicTime?:boolean;heraldry?:HeraldicHouse|null;
}) {
 const {t}=useTranslation();

  return <div className="campaign-theme min-h-screen bg-background text-foreground" data-house-theme={heraldry??undefined}>
    <header className="campaign-top">
      <a href="/cormyr/index.html" className="campaign-brand"><img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" /><span>Cormyr <em>Chronicle</em>{publicTime?<PublicClock/>:<PrivateClock/>}</span></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
        <nav style={{display:'flex',gap:'0.8rem',alignItems:'center'}}>
          <a href="/cormyr/index.html">{t('nav.kingdomAndRegions')}</a>
          {!publicTime&&<a href="/diagnostico">Verificar meu acesso</a>}
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
    <main className="campaign-main">{children}</main>
  </div>;
}