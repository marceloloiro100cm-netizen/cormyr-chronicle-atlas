import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';

let nextSubscriptionId=0;

/**
 * Supabase Realtime is a fast notification, NOT the source of calendar truth.
 * On a committed UPDATE or a successful reconnect, re-read the RLS-protected
 * calendar RPC and the published-event RPCs. Keep existing 15 s polling as a
 * fallback for offline tabs, dropped websocket messages, and preview hosting.
 *
 * campaign_calendar has one global row and an RLS SELECT policy that grants
 * access only to active authorized campaign users.
 */
export function useCampaignCalendarRealtime(){
 const qc=useQueryClient();
 const [status,setStatus]=useState<'connecting'|'live'|'fallback'>('connecting');
 useEffect(()=>{
  const channel=supabase.channel('cormyr-calendar-'+(++nextSubscriptionId));
  const recheck=()=>{
   void qc.invalidateQueries({queryKey:['campaign-calendar']});
   void qc.invalidateQueries({queryKey:['calendar-schedule-events']});
   void qc.invalidateQueries({queryKey:['campaign-schedule-drafts']});
  };
  channel
   .on('postgres_changes',{
    event:'UPDATE',schema:'public',table:'campaign_calendar',
   },recheck)
   .subscribe(status=>{
    // A lost subscription may have missed a publication; always fetch again.
    if(status==='SUBSCRIBED'){setStatus('live');recheck();}
    else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setStatus('fallback');
   });
  return ()=>{void supabase.removeChannel(channel);};
 },[qc]);
 return status;
}
