import type { ReactNode } from 'react';
import {useQuery} from '@tanstack/react-query';
import { LanguageSwitcher } from './language-switcher';
import { useTranslation } from '@/lib/i18n/context';
import {campaignTimeView,useCampaignTime} from '@/lib/calendar/campaign-time';
import {useCampaignCalendarRealtime} from '@/components/calendar/realtime';

/** Login, recuperação e consentimento nunca consultam o calendário autenticado. */
function PublicCampaignClock(){
 const clock=useQuery({
  queryKey:['public-campaign-clock'],
  queryFn:async()=>{
   const response=await fetch('/api/public/time',{
    method:'GET',credentials:'omit',cache:'no-store',
    headers:{Accept:'application/json'},
   });
   if(!response.ok)throw new Error('Data pública indisponível');
   const body=await response.json() as {period?:unknown;version?:unknown};
   if(typeof body.period!=='string'||!body.period||
      typeof body.version!=='number'||!Number.isSafeInteger(body.version))
    throw new Error('Data pública inválida');
   return {period:body.period,version:body.version};
  },
  retry:false,
  refetchInterval:30_000,
 });
 return <small aria-live="polite">{clock.data&&!clock.isError?
  `Crônicas do Reino · ${clock.data.period}`:
  clock.isError?'Data oficial indisponível':'Consultando data oficial…'}</small>;
}

/** A aplicação autenticada mantém seu relógio canônico e Realtime existentes. */
function PrivateCampaignClock(){
 const clock=useCampaignTime();
 useCampaignCalendarRealtime();
 return <small aria-live="polite">{clock.data&&!clock.isError?
  `Crônicas do Reino · ${campaignTimeView(clock.data).period}`:
  clock.isError?'Data oficial indisponível':'Consultando data oficial…'}</small>;
}

export function CampaignShell({ children, publicClock=false }:
 { children: ReactNode; publicClock?: boolean }) {
 const {t}=useTranslation();
 return <div className="campaign-theme min-h-screen bg-background text-foreground">
  <header className="campaign-top">
   <a href="/cormyr/index.html" className="campaign-brand">
    <img src="/cormyr/assets/cormyr.jpg" alt="Brasão de Cormyr" />
    <span>Cormyr <em>Chronicle</em>
     {publicClock?<PublicCampaignClock/>:<PrivateCampaignClock/>}
    </span>
   </a>
   <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
    <nav><a href="/cormyr/index.html">{t('nav.kingdomAndRegions')}</a></nav>
    <LanguageSwitcher/>
   </div>
  </header>
  <main className="campaign-main">{children}</main>
 </div>;
}
