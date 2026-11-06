import type { ReactNode } from 'react';
import {useQuery} from '@tanstack/react-query';
import { LanguageSwitcher } from './language-switcher';
import { useTranslation } from '@/lib/i18n/context';
import {campaignTimeView,useCampaignTime} from '@/lib/calendar/campaign-time';
import {useCampaignCalendarRealtime} from '@/components/calendar/realtime';
import {publicCampaignTimeProjection} from '@/lib/calendar/public-time';

/** O relógio completo só é consultado após a autenticação. */
function PrivateClock(){
 const clock=useCampaignTime();
 useCampaignCalendarRealtime();
 return <small aria-live="polite">{clock.data&&!clock.isError?
  `Crônicas do Reino · ${campaignTimeView(clock.data).period}`:
  clock.isError?'Data oficial indisponível':'Consultando data oficial…'}</small>;
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
export function CampaignShell({ children,publicTime=false }: {
 children:ReactNode;publicTime?:boolean;
}) {
 const {t}=useTranslation();

  return <div className="campaign-theme min-h-screen bg-background text-foreground">
    <header className="campaign-top">
      <a href="/cormyr/index.html" className="campaign-brand"><img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" /><span>Cormyr <em>Chronicle</em>{publicTime?<PublicClock/>:<PrivateClock/>}</span></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
        <nav><a href="/cormyr/index.html">{t('nav.kingdomAndRegions')}</a></nav>
        <LanguageSwitcher />
      </div>
    </header>
    <main className="campaign-main">{children}</main>
  </div>;
}