import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NarratorCalendar} from '@/components/calendar/narrator-calendar';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useState} from 'react';

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),channel:vi.fn(),on:vi.fn(),subscribe:vi.fn(),removeChannel:vi.fn(),
 current:{year:1522,month:0,day:1,festival:null as string|null,auto_advance:true,version:1,published_week:2},
 previewError:'',publicationError:'',wrongSnapshot:false,
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,channel:mock.channel,removeChannel:mock.removeChannel}}));

function mount(){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><NarratorCalendar/></QueryClientProvider>);
 return qc;
}
beforeEach(()=>{
 mock.current={year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:2};
 mock.previewError='';mock.publicationError='';mock.wrongSnapshot=false;mock.rpc.mockReset();
 for(const fn of [mock.channel,mock.on,mock.subscribe,mock.removeChannel])fn.mockReset();
 const channel={on:mock.on,subscribe:mock.subscribe};
 mock.channel.mockReturnValue(channel);mock.on.mockReturnValue(channel);
 mock.subscribe.mockReturnValue(channel);mock.removeChannel.mockResolvedValue('ok');
 mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
  if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
  if(name==='get_campaign_schedule_drafts'||name==='calendar_mail_events'||name==='get_campaign_schedule_events'||name==='get_campaign_time_change_history')
   return {data:[],error:null};
  if(name==='preview_campaign_time_change'){
   if(mock.previewError)return {data:null,error:{message:mock.previewError}};
   const days=Number(args?.p_desdias)*10;
   return {data:{from:'1522-01-01',to:days===10?'1522-01-11':'1522-01-21',
    expected_version:mock.current.version,desdias:Number(args?.p_desdias),ordinary_days:days,
    months_delta:0,crossed_months:[],crossed_years:[],crossed_seasons:[],
    crossed_festivals:[],houses_drifted:0,projects_maturing:0,can_publish:true},error:null};
  }
  if(name==='publish_campaign_time_change'){
   if(mock.publicationError)return {data:null,error:{message:mock.publicationError}};
   mock.current={...mock.current,day:11,version:mock.current.version+1};
   return {data:{duplicate:false,snapshot:{...mock.current},change:{
    from:'1522-01-01',to:'1522-01-11',expected_version:1,desdias:1,ordinary_days:10,
    months_delta:0,crossed_months:[],crossed_years:[],crossed_seasons:[],
    crossed_festivals:[],houses_drifted:0,projects_maturing:0,can_publish:true}},error:null};
  }
  if(name==='publish_campaign_schedule_confirmed'){
   if(mock.publicationError)return {data:null,error:{message:mock.publicationError}};
   mock.current={...mock.current,auto_advance:Boolean(args?.p_auto),published_week:Number(args?.p_week),
    version:mock.current.version+1};
   return {data:mock.wrongSnapshot?{...mock.current,day:29}:{...mock.current},error:null};
  }
  return {data:null,error:{message:'RPC inesperada: '+name}};
 });
 vi.spyOn(window,'confirm').mockReturnValue(true);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('Hub Temporal — avanço e publicação de eventos separados',()=>{
 it('mantém o formulário de publicação da agenda sem mudar a data',async()=>{
  mount();
  const button=await screen.findByRole('button',{name:'Publicar calendário'});
  expect(button.closest('.narrator-calendar-panel')?.querySelector('h3')).toHaveTextContent('Publicação da agenda e semana das missivas');
  fireEvent.click(button);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith(
   'publish_campaign_schedule_confirmed',expect.objectContaining({
    p_date:'1522-01-01',p_week:2,p_version:1
   })
  ));
  expect(mock.current.day).toBe(1);
 });

 it('recusa que a publicação de eventos altere o dia manualmente',async()=>{
  mount();
  await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getAllByRole('button',{name:'12 de Hammer, 1522',hidden:true})[0]!);
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('só pode mudar pelo Hub Temporal');
  expect(mock.rpc).not.toHaveBeenCalledWith('publish_campaign_schedule_confirmed',expect.anything());
 });

 it('faz prévia sem mutação e confirma exatamente dez dias, com chave e versão',async()=>{
  const qc=mount();
  await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Prévia do avanço'}));
  expect(await screen.findByRole('region',{name:'Impacto do avanço temporal'})).toHaveTextContent('11 de Hammer');
  expect(mock.current.day).toBe(1);
  expect(mock.rpc).toHaveBeenCalledWith('preview_campaign_time_change',{p_version:1,p_desdias:1});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar avanço de désdia'}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_time_change',
   expect.objectContaining({p_key:expect.any(String),p_expected_version:1,p_desdias:1,p_reason:'Avanço da campanha'})));
  await waitFor(()=>expect(mock.current.day).toBe(11));
  expect(qc.getQueryData(['campaign-calendar'])).toMatchObject({day:11,version:2});
 });

 it('não confirma uma prévia se o servidor divergir do motor',async()=>{
  mock.rpc.mockImplementation(async(name:string)=>{
   if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
   if(name==='get_campaign_schedule_drafts'||name==='get_campaign_time_change_history')return {data:[],error:null};
   if(name==='preview_campaign_time_change')return {data:{from:'1522-01-01',to:'1522-01-12',desdias:1},error:null};
   return {data:[],error:null};
  });
  mount();await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Prévia do avanço'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('diverge do motor');
  expect(screen.queryByRole('button',{name:'Confirmar avanço de désdia'})).not.toBeInTheDocument();
 });

 it('preserva justificativa e tentativa quando ocorre falha de rede',async()=>{
  mock.publicationError='Falha na confirmação pelo servidor';
  mount();await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Prévia do avanço'}));
  await screen.findByRole('button',{name:'Confirmar avanço de désdia'});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar avanço de désdia'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha na confirmação');
  expect(mock.current.day).toBe(1);
  expect(screen.getByRole('button',{name:'Confirmar avanço de désdia'})).toBeEnabled();
 });

 it('não declara sucesso na publicação da agenda quando RPC falha',async()=>{
  mock.publicationError='Falha no banco ao publicar';
  mount();await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha no banco ao publicar');
  expect(screen.queryByText(/Calendário gravado e confirmado/)).not.toBeInTheDocument();
 });

 it('detecta snapshot incompatível ao publicar agenda',async()=>{
  mock.wrongSnapshot=true;
  mount();await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('não retornou a data, rodada e versão esperadas');
 });
});

it('sincroniza mês e ano do seletor histórico quando a data chega depois',async()=>{
 function Example(){
  const [date,setDate]=useState('');
  return <><CampaignDatePicker value={date} onChange={setDate}/>
   <button onClick={()=>setDate('1523-04-17')}>Receber data do banco</button></>;
 }
 render(<Example/>);
 fireEvent.click(screen.getByRole('button',{name:'Receber data do banco'}));
 await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Ano'})).toHaveValue(1523));
 expect(screen.getByRole('combobox',{name:'Mês'})).toHaveValue('3');
});
