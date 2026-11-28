import {campaignTimeView,useCampaignTime} from '@/lib/calendar/campaign-time';
import {useCampaignCalendarRealtime} from '@/components/calendar/realtime';

/**
 * Relógio completo, só para a área autenticada antiga. Fica em arquivo
 * próprio e é carregado sob demanda por CampaignShell, para que as páginas
 * públicas (/auth, /reset-password) não incluam o cliente Supabase no bundle.
 */
export default function PrivateClockBody(){
 const clock=useCampaignTime();
 useCampaignCalendarRealtime();
 return <small aria-live="polite">{clock.data&&!clock.isError?
  campaignTimeView(clock.data).period:
  clock.isError?'Data oficial indisponível':'Consultando data oficial…'}</small>;
}
