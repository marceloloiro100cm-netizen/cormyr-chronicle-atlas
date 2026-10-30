import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CampaignCalendar} from '@/components/calendar/calendar';
import {formatCampaignWeek} from '@/lib/calendar/harptos';

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),
 current:{year:1522,month:0,day:11,festival:null as string|null,auto_advance:true,version:1,published_week:2}
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>mock.rpc(args[0])}}));
beforeEach(()=>{
 mock.current={year:1522,month:0,day:11,festival:null,auto_advance:true,version:1,published_week:2};
 mock.rpc.mockReset();
 mock.rpc.mockImplementation(async(name:string)=>name==='get_campaign_calendar'
  ?{data:{...mock.current},error:null}
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

it('mostra semana, désdia, mês e ano somente dentro do calendário, preservando privacidade',async()=>{
 mount();
 expect(await screen.findByText('Semana 2 · 2ª désdia · Hammer · 1522 CV')).toBeInTheDocument();
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
 await screen.findByText('Semana 2 · 2ª désdia · Hammer · 1522 CV');
 mock.current={year:1522,month:1,day:21,festival:null,auto_advance:true,version:2,published_week:4};
 await act(async()=>{await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('Semana 4 · 3ª désdia · Alturiak · 1522 CV')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:/^21 de Alturiak/})).toHaveAttribute('aria-current','date'));
});

it('mantém a consulta histórica se o jogador navega, mas atualiza o indicador da semana global',async()=>{
 const qc=mount();
 await screen.findByText('Semana 2 · 2ª désdia · Hammer · 1522 CV');
 fireEvent.click(screen.getByRole('button',{name:'Próximo'}));
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 mock.current={year:1522,month:2,day:7,festival:null,auto_advance:false,version:2,published_week:5};
 await act(async()=>{await qc.refetchQueries({queryKey:['campaign-calendar']});});
 expect(await screen.findByText('Semana 5 · 1ª désdia · Ches · 1522 CV')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Alturiak · A Garra do Inverno'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Data atual'}));
 expect(screen.getByRole('heading',{name:'Ches · A Garra dos Sóis Poentes'})).toBeInTheDocument();
});

it('formata as três désdias e intercalares sem inventar dia de festival',()=>{
 const base={year:1522,month:0,day:1,festival:null,published_week:2};
 expect(formatCampaignWeek(base)).toBe('Semana 2 · 1ª désdia · Hammer · 1522 CV');
 expect(formatCampaignWeek({...base,day:10})).toContain('1ª désdia');
 expect(formatCampaignWeek({...base,day:11})).toContain('2ª désdia');
 expect(formatCampaignWeek({...base,day:21})).toContain('3ª désdia');
 expect(formatCampaignWeek({...base,festival:'midwinter'})).toContain('Midwinter');
});
