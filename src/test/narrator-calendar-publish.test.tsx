import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NarratorCalendar} from '@/components/calendar/narrator-calendar';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useState} from 'react';

const mock=vi.hoisted(()=>({
  rpc:vi.fn(),
  current:{year:1522,month:0,day:1,festival:null as string|null,auto_advance:true,version:1,published_week:2}
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));

const setup=()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><NarratorCalendar/></QueryClientProvider>);
 return qc;
};
const setupRpc=()=>{
 mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
  if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
  if(name==='get_campaign_schedule_drafts'||name==='calendar_mail_events'||name==='get_campaign_schedule_events')
   return {data:[],error:null};
  if(name==='publish_campaign_schedule'){
   const [year,month,day]=(args?.p_date as string).split('-').map(Number);
   mock.current={...mock.current,year:year!,month:month!-1,day:day!,auto_advance:Boolean(args?.p_auto),published_week:Number(args?.p_week),version:mock.current.version+1};
   return {data:null,error:null};
  }
  return {data:null,error:{message:'RPC inesperada: '+name}};
 });
};
beforeEach(()=>{
 mock.current={year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:2};
 mock.rpc.mockReset();
 setupRpc();
 vi.spyOn(window,'confirm').mockReturnValue(true);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('publicação da data global de Harptos',()=>{
 it('altera o mês selecionado, publica e confirma o novo valor lido do banco',async()=>{
  setup();
  const picker=await screen.findByText(/Data selecionada para publicação/);
  expect(picker.parentElement).toHaveTextContent('1 de Hammer');
  fireEvent.change(screen.getAllByRole('combobox',{name:'Mês',hidden:true})[0]!,{target:{value:'1'}});
  expect(picker.parentElement).toHaveTextContent('1 de Alturiak');
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_schedule',expect.objectContaining({
   p_version:1,p_date:'1522-02-01',p_week:2,p_auto:true
  })));
  expect(await screen.findByText(/Calendário publicado e confirmado: 1 de Alturiak/)).toBeInTheDocument();
  expect(mock.current.month).toBe(1);
 });
 it('seleciona um dia e impede que uma atualização externa silenciosa apague a escolha',async()=>{
  const qc=setup();
  await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getAllByRole('button',{name:'12 de Hammer, 1522',hidden:true})[0]!);
  await waitFor(()=>expect(screen.getByText(/Data selecionada para publicação/).parentElement).toHaveTextContent('12 de Hammer'));
  qc.setQueryData(['campaign-calendar'],{...mock.current,day:6,version:2});
  expect(screen.getByText(/Data selecionada para publicação/).parentElement).toHaveTextContent('12 de Hammer');
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_schedule',expect.objectContaining({
   p_date:'1522-01-12',p_version:1
  })));
 });
 it('não declara sucesso quando a RPC falha',async()=>{
  mock.rpc.mockImplementation(async(name:string)=>{
   if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
   if(name==='get_campaign_schedule_drafts'||name==='calendar_mail_events'||name==='get_campaign_schedule_events')return {data:[],error:null};
   return {data:null,error:{message:'Falha no banco ao publicar'}};
  });
  setup();
  await screen.findByText(/Data selecionada para publicação/);
  fireEvent.click(screen.getByRole('button',{name:'Publicar calendário'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha no banco ao publicar');
  expect(screen.queryByText(/Calendário publicado e confirmado/)).not.toBeInTheDocument();
 });
});

it('sincroniza mês e ano do seletor quando a data chega depois do carregamento',async()=>{
 function Example(){
  const [date,setDate]=useState('');
  return <><CampaignDatePicker value={date} onChange={setDate}/><button onClick={()=>setDate('1523-04-17')}>Receber data do banco</button></>;
 }
 render(<Example/>);
 fireEvent.click(screen.getByRole('button',{name:'Receber data do banco'}));
 await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Ano'})).toHaveValue(1523));
 expect(screen.getByRole('combobox',{name:'Mês'})).toHaveValue('3');
});
