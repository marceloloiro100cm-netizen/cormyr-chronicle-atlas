import {useEffect,useState} from 'react';
import {useQueryClient,type QueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {temporalQueryKeysForInvalidation} from '@/lib/calendar/time-connections';
import {CAMPAIGN_TIME_QUERY_KEY} from '@/lib/calendar/campaign-time';

type CalendarRealtimeStatus='connecting'|'live'|'fallback';
type Subscriber=(status:CalendarRealtimeStatus)=>void;
type RealtimeEntry={
 channel:ReturnType<typeof supabase.channel>;
 watchers:Set<Subscriber>;
 status:CalendarRealtimeStatus;
 unsubscribeCache:()=>void;
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

function clockFingerprint(value:unknown):string|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(!Number.isSafeInteger(v.version)||!Number.isSafeInteger(v.year)||
    !Number.isSafeInteger(v.month)||!Number.isSafeInteger(v.day)||
    (v.festival!==null&&typeof v.festival!=='string'))return null;
 return JSON.stringify([v.version,v.year,v.month,v.day,v.festival]);
}

function connect(qc:QueryClient):RealtimeEntry{
 const channel=supabase.channel('cormyr-campaign-time-'+(++serial));
 let observed=clockFingerprint(qc.getQueryData(CAMPAIGN_TIME_QUERY_KEY));
 // Invalidate downstream projections, NOT the very query being observed.
 const refreshDerived=()=>{
  for(const prefix of temporalQueryKeysForInvalidation().slice(1))
   void qc.invalidateQueries({queryKey:prefix});
 };
 const entry:RealtimeEntry={
  channel,watchers:new Set(),status:'connecting',unsubscribeCache:()=>{},
 };
 connections.set(qc,entry);
 entry.unsubscribeCache=qc.getQueryCache().subscribe(event=>{
  if(event.type!=='updated'||
   event.query.queryKey[0]!==CAMPAIGN_TIME_QUERY_KEY[0])return;
  const next=clockFingerprint(event.query.state.data);
  if(next===null||next===observed)return;
  observed=next;
  // Also works when Supabase Realtime is offline: the canonical 15s
  // useCampaignTime polling revalidates all dependent caches once per version.
  refreshDerived();
 });
 const refresh=()=>{
  for(const prefix of temporalQueryKeysForInvalidation())
   void qc.invalidateQueries({queryKey:prefix});
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
    entry.unsubscribeCache();
    void supabase.removeChannel(entry.channel);
   }
  };
 },[qc]);
 return status;
}
