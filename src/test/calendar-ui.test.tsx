import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CampaignCalendar} from '@/components/calendar/calendar';
import {formatCampaignPeriod} from '@/lib/calendar/harptos';

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),channel:vi.fn(),on:vi.fn(),subscribe:vi.fn(),removeChannel:vi.fn(),
 current:{year:1522,month:0,day:11,festival:null as string|null,auto_advance:true,version:1,published_week:2}
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>mock.rpc(args[0]),channel:mock.channel,removeChannel:mock.removeChannel}}));
beforeEach(()=>{
 mock.current={year:1522,month:0,day:11,festival:null,auto_advance:true,version:1,published_week:2};
 mock.rpc.mockReset();
 for(const fn of [mock.channel,mock.on,mock.subscribe,mock.removeChannel])fn.mockReset();
 const channel={on:mock.on,subscribe:mock.subscribe};
 mock.channel.mockReturnValue(channel);
 mock.on.mockReturnValue(channel);
 mock.subscribe.mockReturnValue(channel);
 mock.removeChannel.mockResolvedValue('ok');
 mock.rpc.mockImplementation(async(name:string)=>name==='get_campaign_calendar'
  ?{data:{...mock.current},error:null}
  :name==='get_campaign_chronology'
   ?{data:{year:1522,month:0,events:[{id:'letter:one',date:'1522-01-02',title:'Convocação da corte',kind:'mail'}],rounds:[],unassigned_round_count:0},error:null}
  :name==='calendar_mail_events'
   ?{data:[{id:'one',date:'1522-01-02',title:'Convocação da corte',kind:'mail'}],error:null}
   :{data:[],error:null});
});
afterEach(cleanup);
function mount(){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><CampaignCalendar/></QueryClientProvider>);
 return qc;
}

it('mostra somente désdia, mês e ano no calendário, preservando privacidade',async()=>{
 mount();
 expect(await screen.findByText('2ª désdia · Hammer · 1522 CV')).toBeInTheDocument();
 const day=await screen.findByRole('button',{name:/^2 de Hammer.*1 evento/});
 fireEvent.mouseEnter(day);expect(screen.getByText('Convocação da corte')).toBeInTheDocument();
 fireEvent.focus(screen.getByRole('button',{name:/^3 de Hammer/}));
 expect(screen.queryByText('Convocação da corte')).not.toBeInTheDocument();
 fireEvent.click(day);expect(screen.getByText('Convocação da corte')).toBeInTheDocument();
 expect(screen.queryByText('Ajustar calendário da campanha')).not.toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:/^11 de Hammer/})).toHaveAttribute('aria-current','date'));
});

it('recebe a nova data publicada do Narrador e abre automaticamente o novo mês para jogadores',async()=>{
 const qc=mount();
 await screen.findByText('2ª désdia · Hammer · 1522 CV');
 mock.current={year:1522,month:1,day:21,festival:null,auto_advance:true,version:2,published_week:4};
 await act(async()=>{await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('3ª désdia · Alturiak · 1522 CV')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:/^21 de Alturiak/})).toHaveAttribute('aria-current','date'));
});

it('mantém a consulta histórica se o jogador navega, mas atualiza a désdia global',async()=>{
 const qc=mount();
 await screen.findByText('2ª désdia · Hammer · 1522 CV');
 fireEvent.click(screen.getByRole('button',{name:'Próximo'}));
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 mock.current={year:1522,month:2,day:7,festival:null,auto_advance:false,version:2,published_week:5};
 await act(async()=>{await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('1ª désdia · Ches · 1522 CV')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Data atual'}));
 expect(screen.getByRole('heading',{name:'Ches · A Garra dos Sóis Poentes'})).toBeInTheDocument();
});

it('notificação do Supabase Realtime atualiza o dia oficial sem recarregar a página',async()=>{
 const qc=mount();
 await screen.findByText('2ª désdia · Hammer · 1522 CV');
 expect(mock.channel).toHaveBeenCalledTimes(1);
 expect(mock.on).toHaveBeenCalledWith('postgres_changes',
  expect.objectContaining({event:'UPDATE',schema:'public',table:'campaign_calendar'}),
  expect.any(Function));
 mock.current={...mock.current,day:21,version:2,published_week:3};
 const notify=mock.on.mock.calls[0]?.[2] as (()=>void)|undefined;
 expect(notify).toBeTypeOf('function');
 await act(async()=>{notify?.();await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('3ª désdia · Hammer · 1522 CV')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:/^21 de Hammer/})).toHaveAttribute('aria-current','date');
});

it('reconexão Realtime busca alterações perdidas e limpa inscrição quando desmontado',async()=>{
 const qc=mount();
 await screen.findByText('2ª désdia · Hammer · 1522 CV');
 const onStatus=mock.subscribe.mock.calls[0]?.[0] as ((status:string)=>void)|undefined;
 expect(onStatus).toBeTypeOf('function');
 mock.current={...mock.current,day:21,version:2};
 await act(async()=>{onStatus?.('SUBSCRIBED');await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('3ª désdia · Hammer · 1522 CV')).toBeInTheDocument();
 expect(screen.getByText('Sincronização em tempo real ativa')).toBeInTheDocument();
 act(()=>onStatus?.('CHANNEL_ERROR'));
 expect(screen.getByText(/atualização automática a cada 15 segundos/)).toBeInTheDocument();
 cleanup();
 expect(mock.removeChannel).toHaveBeenCalledTimes(1);
});

it('formata corretamente cada uma das três désdias, ignorando o número da rodada',()=>{
 const base={year:1522,month:0,day:1,festival:null,published_week:25};
 for(const day of [1,2,10])expect(formatCampaignPeriod({...base,day})).toBe('1ª désdia · Hammer · 1522 CV');
 for(const day of [11,12,20])expect(formatCampaignPeriod({...base,day})).toBe('2ª désdia · Hammer · 1522 CV');
 for(const day of [21,22,30])expect(formatCampaignPeriod({...base,day})).toBe('3ª désdia · Hammer · 1522 CV');
 expect(formatCampaignPeriod({...base,month:1,day:11})).toBe('2ª désdia · Alturiak · 1522 CV');
 expect(formatCampaignPeriod({...base,year:1523,day:21})).toBe('3ª désdia · Hammer · 1523 CV');
 expect(formatCampaignPeriod({...base,festival:'midwinter'})).toBe('Midwinter · Meio do Inverno · Hammer · 1522 CV');
});
