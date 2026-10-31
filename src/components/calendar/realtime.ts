import {useEffect,useState} from 'react';
import {useQueryClient,type QueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';

type CalendarRealtimeStatus='connecting'|'live'|'fallback';
type Subscriber=(status:CalendarRealtimeStatus)=>void;
type RealtimeEntry={
 channel:ReturnType<typeof supabase.channel>;
 watchers:Set<Subscriber>;
 status:CalendarRealtimeStatus;
};

/** Compartilha uma única assinatura por QueryClient entre o cabeçalho,
 * calendário do jogador e painel do Narrador. RLS continua sendo aplicada
 * ao canal Supabase; o snapshot autorizado vem sempre do RPC de leitura.
 */
const connections=new WeakMap<QueryClient,RealtimeEntry>();
let serial=0;

function notify(entry:RealtimeEntry,status:CalendarRealtimeStatus){
 entry.status=status;
 for(const listener of entry.watchers)listener(status);
}

function connect(qc:QueryClient):RealtimeEntry{
 const channel=supabase.channel('cormyr-campaign-time-'+(++serial));
 const entry:RealtimeEntry={channel,watchers:new Set(),status:'connecting'};
 connections.set(qc,entry);
 const refresh=()=>{
  for(const prefix of [
   ['campaign-calendar'],['calendar-schedule-events'],
   ['campaign-schedule-drafts'],['campaign-time-history'],
   ['campaign-chronology'],['calendar-events'],
   ['noble-house'],['house-realm-dashboard'],
   ['house-character-ages'],['character-age-dashboard'],
   ['character-age-impact'],['character-year-transitions'],
  ])void qc.invalidateQueries({queryKey:prefix});
 };
 channel.on('postgres_changes',{
  event:'UPDATE',schema:'public',table:'campaign_calendar',
 },refresh).subscribe(status=>{
  if(status==='SUBSCRIBED'){notify(entry,'live');refresh();}
  else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
   notify(entry,'fallback');
  }
 });
 return entry;
}

export function useCampaignCalendarRealtime():CalendarRealtimeStatus{
 const qc=useQueryClient();
 const [status,setStatus]=useState<CalendarRealtimeStatus>('connecting');
 useEffect(()=>{
  const existing=connections.get(qc);
  const entry=existing??connect(qc);
  entry.watchers.add(setStatus);
  setStatus(entry.status);
  return ()=>{
   entry.watchers.delete(setStatus);
   if(entry.watchers.size===0){
    connections.delete(qc);
    void supabase.removeChannel(entry.channel);
   }
  };
 },[qc]);
 return status;
}
