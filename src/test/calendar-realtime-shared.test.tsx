import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useCampaignCalendarRealtime} from '@/components/calendar/realtime';
import {TEMPORAL_QUERY_CONNECTIONS,temporalQueryKeysForInvalidation} from '@/lib/calendar/time-connections';

const mock=vi.hoisted(()=>({
 channel:vi.fn(),on:vi.fn(),subscribe:vi.fn(),removeChannel:vi.fn(),
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  channel:mock.channel,
  removeChannel:mock.removeChannel,
 }
}));
beforeEach(()=>{
 for(const fn of Object.values(mock))fn.mockReset();
 const channel={on:mock.on,subscribe:mock.subscribe};
 mock.channel.mockReturnValue(channel);
 mock.on.mockReturnValue(channel);
 mock.subscribe.mockReturnValue(channel);
 mock.removeChannel.mockResolvedValue('ok');
});
afterEach(cleanup);
function SyncStatus({id}:{id:string}){
 const status=useCampaignCalendarRealtime();
 return <output aria-label={id}>{status}</output>;
}
it('compartilha uma única assinatura Realtime entre cabeçalho, jogador e Narrador',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><SyncStatus id="cabeçalho"/><SyncStatus id="jogador"/><SyncStatus id="narrador"/></QueryClientProvider>);
 await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));
 expect(mock.on).toHaveBeenCalledTimes(1);
 expect(mock.on).toHaveBeenCalledWith('postgres_changes',
  expect.objectContaining({event:'UPDATE',schema:'public',table:'campaign_calendar'}),expect.any(Function));
 const onStatus=mock.subscribe.mock.calls[0]?.[0] as (status:string)=>void;
 await act(async()=>{onStatus('SUBSCRIBED');});
 expect(screen.getByLabelText('cabeçalho')).toHaveTextContent('live');
 expect(screen.getByLabelText('jogador')).toHaveTextContent('live');
 expect(screen.getByLabelText('narrador')).toHaveTextContent('live');
 await act(async()=>{onStatus('CHANNEL_ERROR');});
 expect(screen.getByLabelText('jogador')).toHaveTextContent('fallback');
 expect(mock.removeChannel).not.toHaveBeenCalled();
 cleanup();
 expect(mock.removeChannel).toHaveBeenCalledTimes(1);
});
it('o último consumidor desmontado libera o canal sem afetar outros QueryClients',async()=>{
 const a=new QueryClient(),b=new QueryClient();
 const view=render(<><QueryClientProvider client={a}><SyncStatus id="a"/></QueryClientProvider><QueryClientProvider client={b}><SyncStatus id="b"/></QueryClientProvider></>);
 expect(mock.channel).toHaveBeenCalledTimes(2);
 view.unmount();
 expect(mock.removeChannel).toHaveBeenCalledTimes(2);
});

it('revalida missivas, nobres, fichas, exército e calendário pela mesma assinatura',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const spy=vi.spyOn(qc,'invalidateQueries');
 const view=render(<QueryClientProvider client={qc}><SyncStatus id="hub"/></QueryClientProvider>);
 const callback=mock.on.mock.calls[0]?.[2] as (()=>void)|undefined;
 expect(callback).toBeTypeOf('function');
 await act(async()=>{callback!();});
 const seen=spy.mock.calls.map(([argument])=>
  JSON.stringify(argument?.queryKey));
 const expected=temporalQueryKeysForInvalidation().map(key=>JSON.stringify(key));
 expect(seen).toEqual(expected);
 for(const name of ['campaign-calendar','calendar-schedule-events',
  'campaign-chronology','calendar-events','mail-page','mail-insights',
  'mail-overview-grouped','reply-delivery','campaign-panel','noble-house',
  'house-realm-dashboard','house-time-impact','character-age-dashboard',
  'temporal-consumer-dashboard','temporal-release-preflight'])
  expect(seen).toContain(JSON.stringify([name]));
 expect(new Set(TEMPORAL_QUERY_CONNECTIONS.map(x=>x.prefix)).size)
  .toBe(TEMPORAL_QUERY_CONNECTIONS.length);
 expect(mock.channel).toHaveBeenCalledTimes(1);
 view.unmount();
});

it('polling da versão oficial sincroniza todos os caches mesmo com Realtime em fallback',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const spy=vi.spyOn(qc,'invalidateQueries');
 const view=render(<QueryClientProvider client={qc}><SyncStatus id="ponte"/></QueryClientProvider>);
 const onStatus=mock.subscribe.mock.calls[0]?.[0] as (status:string)=>void;
 await act(async()=>{onStatus('CHANNEL_ERROR');});
 expect(screen.getByLabelText('ponte')).toHaveTextContent('fallback');
 const clock={year:1522,month:0,day:1,festival:null,version:1,auto_advance:false};
 await act(async()=>{qc.setQueryData(['campaign-calendar'],clock);});
 let refreshes=spy.mock.calls.map(([input])=>JSON.stringify(input.queryKey));
 expect(refreshes).toContain(JSON.stringify(['mail-page']));
 expect(refreshes).toContain(JSON.stringify(['noble-house']));
 expect(refreshes).toContain(JSON.stringify(['character-age-dashboard']));
 expect(refreshes).not.toContain(JSON.stringify(['campaign-calendar']));
 spy.mockClear();
 await act(async()=>{qc.setQueryData(['campaign-calendar'],{...clock});});
 expect(spy).not.toHaveBeenCalled();
 await act(async()=>{qc.setQueryData(['campaign-calendar'],{...clock,year:1523,version:2});});
 refreshes=spy.mock.calls.map(([input])=>JSON.stringify(input.queryKey));
 expect(refreshes).toContain(JSON.stringify(['house-time-impact']));
 expect(refreshes).toContain(JSON.stringify(['mail-overview-grouped']));
 expect(refreshes).toContain(JSON.stringify(['character-age-impact']));
 view.unmount();
 spy.mockClear();
 qc.setQueryData(['campaign-calendar'],{...clock,version:3});
 expect(spy).not.toHaveBeenCalled();
});
