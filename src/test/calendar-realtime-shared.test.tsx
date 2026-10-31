import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useCampaignCalendarRealtime} from '@/components/calendar/realtime';

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
