import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
import {NarratorCalendar} from '@/components/calendar/narrator-calendar';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {dateKey,parseDate} from '@/lib/calendar/harptos';
import {advanceHarptosDesdia,listCrossedHarptosPeriods} from '@/lib/calendar/temporal-engine';

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),channel:vi.fn(),on:vi.fn(),subscribe:vi.fn(),removeChannel:vi.fn(),
 current:{year:1522,month:0,day:1,festival:null as string|null,auto_advance:true,version:1,published_week:2},
 failOnce:false,
 keys:[] as string[],
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,channel:mock.channel,removeChannel:mock.removeChannel}}));

function previewFor(args:Record<string,unknown>){
 const start=dateKey(mock.current);
 const mode=args['p_mode'] as 'advance'|'set'|'publish';
 const next=mode==='advance'?dateKey(advanceHarptosDesdia(start,Number(args['p_count']))):
  mode==='set'?String(args['p_date']):start;
 const end=parseDate(next)!;
 const crossed=listCrossedHarptosPeriods(start,next);
 return {
  version:Number(args['p_version']),from:start,to:next,mode,
  ordinary_days:crossed.ordinaryDaysElapsed,calendar_days:crossed.calendarDaysElapsed,
  month_delta:(end.year-mock.current.year)*12+end.month-mock.current.month,
  backdated:crossed.direction==='backward',backdate_authorized:Boolean(args['p_allow_backdate']),
  crossed_festivals:crossed.crossedFestivals.map(f=>f.date),crossed_years:crossed.crossedYears,
  house_sheets_to_check:0,published_week_unchanged:mock.current.published_week,
 };
}
function setupRpc(){
 mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
  if(name==='get_character_age_dashboard')return {data:{
   current_year:args?.['p_year'],target_year:args?.['p_target_year'],
   totals:{total:0,nobles:0,alive:0,deceased:0,pending:0,conflicts:0,
    unknown:0,not_born:0,aged_nobles:0},characters:[],truncated:false,
  },error:null};
  if(name==='get_character_year_transitions')return {data:[],error:null};
  if(name==='get_campaign_chronology')return {data:{
   year:Number(args?.['p_year']??mock.current.year),
   month:Number(args?.['p_month']??mock.current.month),
   events:[],rounds:[],unassigned_round_count:0,
  },error:null};
  if(name==='get_character_registry_hub')return {data:{characters:[],pending:[],pending_total:0,count:0,relations:[],links:[]},error:null};
  if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
  if(name==='get_campaign_schedule_drafts'||name==='calendar_mail_events'||
   name==='get_campaign_schedule_events'||name==='get_campaign_time_history')return {data:[],error:null};
  if(name==='preview_campaign_time_change')return {data:previewFor(args!),error:null};
  if(name==='publish_campaign_time_change'){
   mock.keys.push(String(args?.['p_key']));
   if(mock.failOnce){mock.failOnce=false;return {data:null,error:{code:'PGRST500',message:'Rede instável'}};}
   const target=previewFor(args!).to;
   const day=parseDate(target)!;
   mock.current={...mock.current,...day,auto_advance:false,version:mock.current.version+1};
   return {data:{...mock.current},error:null};
  }
  if(name==='save_campaign_schedule_event')return {data:{id:'event',version:1},error:null};
  return {data:null,error:{message:'RPC inesperada: '+name}};
 });
}
beforeEach(()=>{
 mock.current={year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:2};
 mock.failOnce=false;mock.keys=[];
 mock.rpc.mockReset();
 for(const fn of [mock.channel,mock.on,mock.subscribe,mock.removeChannel])fn.mockReset();
 const channel={on:mock.on,subscribe:mock.subscribe};
 mock.channel.mockReturnValue(channel);
 mock.on.mockReturnValue(channel);
 mock.subscribe.mockReturnValue(channel);
 mock.removeChannel.mockResolvedValue('ok');
 setupRpc();
 vi.spyOn(window,'confirm').mockReturnValue(true);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><NarratorCalendar/></QueryClientProvider>);
 return qc;
}

describe('Lote 4 · comando central temporal do Narrador',()=>{
 it('mostra prévia oficial antes de habilitar o avanço de uma désdia',async()=>{
  setup();
  const button=await screen.findByRole('button',{name:'Confirmar avanço de désdia'});
  expect(await screen.findByText(/Prévia:/)).toBeInTheDocument();
  expect(screen.getAllByText(/10 dias ordinários/).length).toBeGreaterThan(0);
  expect(screen.getByRole('spinbutton',{name:'Quantidade de désdias'})).toHaveValue(1);
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_time_change',expect.objectContaining({
   p_mode:'advance',p_date:null,p_count:1,p_version:1,
   p_key:expect.any(String),
  })));
  expect(mock.current.day).toBe(11);
  expect(mock.current.auto_advance).toBe(false);
  expect(mock.current.published_week).toBe(2);
  expect(await screen.findByText(/Calendário gravado e confirmado: 11 de Hammer/)).toBeInTheDocument();
 });
 it('não permite publicação se a prévia oficial estiver inacessível',async()=>{
  mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
   if(name==='get_character_age_dashboard')return {data:{
   current_year:args?.['p_year'],target_year:args?.['p_target_year'],
   totals:{total:0,nobles:0,alive:0,deceased:0,pending:0,conflicts:0,
    unknown:0,not_born:0,aged_nobles:0},characters:[],truncated:false,
  },error:null};
  if(name==='get_character_year_transitions')return {data:[],error:null};
  if(name==='get_campaign_chronology')return {data:{
   year:Number(args?.['p_year']??mock.current.year),
   month:Number(args?.['p_month']??mock.current.month),
   events:[],rounds:[],unassigned_round_count:0,
  },error:null};
  if(name==='get_character_registry_hub')return {data:{characters:[],pending:[],pending_total:0,count:0,relations:[],links:[]},error:null};
   if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
   if(name==='get_campaign_schedule_drafts'||name==='get_campaign_time_history')return {data:[],error:null};
   if(name==='preview_campaign_time_change')return {data:null,error:{code:'42501',message:'Somente o Narrador'}};
   return {data:[],error:null};
  });
  setup();
  await screen.findByText(/Prévia indisponível/);
  expect(screen.getByRole('button',{name:'Confirmar avanço de désdia'})).toBeDisabled();
  expect(mock.rpc).not.toHaveBeenCalledWith('publish_campaign_time_change',expect.anything());
 });
 it('publica data escolhida apenas no modo de correção sem tocar na semana de missivas',async()=>{
  setup();
  await screen.findByText(/Prévia:/);
  fireEvent.change(screen.getByRole('combobox',{name:'Ação temporal'}),{target:{value:'set'}});
  fireEvent.change(screen.getAllByRole('combobox',{name:'Mês',hidden:true})[0]!,{target:{value:'1'}});
  const button=await screen.findByRole('button',{name:'Confirmar data oficial'});
  await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_time_change',expect.objectContaining({
   p_mode:'set',p_date:'1522-02-01',p_count:0,p_version:1,
  })));
  expect(mock.current.month).toBe(1);
  expect(mock.current.published_week).toBe(2);
 });
 it('reutiliza a chave após falha de rede sem alterar a seleção',async()=>{
  mock.failOnce=true;
  setup();const button=await screen.findByRole('button',{name:'Confirmar avanço de désdia'});
  await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('Rede instável');
  fireEvent.click(button);
  await waitFor(()=>expect(mock.keys).toHaveLength(2));
  expect(mock.keys[0]).toBe(mock.keys[1]);
  expect(mock.current.day).toBe(11);
 });
 it('mantém a seleção quando o banco detecta outra sessão e exige recarga da versão',async()=>{
  const qc=setup();
  await screen.findByText(/Prévia:/);
  fireEvent.change(screen.getByRole('combobox',{name:'Ação temporal'}),{target:{value:'set'}});
  fireEvent.click(screen.getAllByRole('button',{name:'12 de Hammer, 1522',hidden:true})[0]!);
  qc.setQueryData(['campaign-calendar'],{...mock.current,version:2,day:6});
  mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
   if(name==='get_character_age_dashboard')return {data:{
   current_year:args?.['p_year'],target_year:args?.['p_target_year'],
   totals:{total:0,nobles:0,alive:0,deceased:0,pending:0,conflicts:0,
    unknown:0,not_born:0,aged_nobles:0},characters:[],truncated:false,
  },error:null};
  if(name==='get_character_year_transitions')return {data:[],error:null};
  if(name==='get_campaign_chronology')return {data:{
   year:Number(args?.['p_year']??mock.current.year),
   month:Number(args?.['p_month']??mock.current.month),
   events:[],rounds:[],unassigned_round_count:0,
  },error:null};
  if(name==='get_character_registry_hub')return {data:{characters:[],pending:[],pending_total:0,count:0,relations:[],links:[]},error:null};
   if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
   if(name==='get_campaign_schedule_drafts'||name==='get_campaign_time_history')return {data:[],error:null};
   if(name==='preview_campaign_time_change')return {data:previewFor(args!),error:null};
   if(name==='publish_campaign_time_change')return {data:null,error:{message:'Calendário alterado; recarregue antes de salvar'}};
   return {data:[],error:null};
  });
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar data oficial'})).toBeDisabled());
  expect(await screen.findByText(/O calendário foi alterado em outra sessão/)).toBeInTheDocument();
  expect(mock.rpc).not.toHaveBeenCalledWith('publish_campaign_time_change',expect.anything());
  mock.current={...mock.current,version:2,day:6};
  fireEvent.click(screen.getByRole('button',{name:/Atualizar versão sem perder data selecionada/}));
  expect(await screen.findByText(/Versão atualizada. Sua seleção foi preservada/)).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar data oficial'})).toBeEnabled());
 });
 it('retrocesso exige confirmação expressa e justificativa antes de habilitar o botão',async()=>{
  mock.current={...mock.current,month:1,day:1};
  setup();await screen.findByText(/Prévia:/);
  fireEvent.change(screen.getByRole('combobox',{name:'Ação temporal'}),{target:{value:'set'}});
  fireEvent.change(screen.getAllByRole('combobox',{name:'Mês',hidden:true})[0]!,{target:{value:'0'}});
  await screen.findByText(/Retrocesso histórico:/);
  const submit=screen.getByRole('button',{name:'Confirmar data oficial'});
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/Autorizar retrocesso histórico/}));
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Justificativa temporal'}),{target:{value:'Retificação da cronologia acordada'}});
  await waitFor(()=>expect(submit).toBeEnabled());
 });
 it('permite publicar só eventos, preservando o dia e utilizando o comando único',async()=>{
  setup();await screen.findByText(/Prévia:/);
  fireEvent.change(screen.getByRole('combobox',{name:'Ação temporal'}),{target:{value:'publish'}});
  const button=await screen.findByRole('button',{name:'Publicar eventos'});
  await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('publish_campaign_time_change',expect.objectContaining({
   p_mode:'publish',p_date:null,p_count:0
  })));
  expect(mock.current.day).toBe(1);
 });
 it('não declara sucesso quando o snapshot retornado diverge da prévia',async()=>{
  mock.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
   if(name==='get_character_age_dashboard')return {data:{
   current_year:args?.['p_year'],target_year:args?.['p_target_year'],
   totals:{total:0,nobles:0,alive:0,deceased:0,pending:0,conflicts:0,
    unknown:0,not_born:0,aged_nobles:0},characters:[],truncated:false,
  },error:null};
  if(name==='get_character_year_transitions')return {data:[],error:null};
  if(name==='get_campaign_chronology')return {data:{
   year:Number(args?.['p_year']??mock.current.year),
   month:Number(args?.['p_month']??mock.current.month),
   events:[],rounds:[],unassigned_round_count:0,
  },error:null};
  if(name==='get_character_registry_hub')return {data:{characters:[],pending:[],pending_total:0,count:0,relations:[],links:[]},error:null};
   if(name==='get_campaign_calendar')return {data:{...mock.current},error:null};
   if(name==='get_campaign_schedule_drafts'||name==='get_campaign_time_history')return {data:[],error:null};
   if(name==='preview_campaign_time_change')return {data:previewFor(args!),error:null};
   if(name==='publish_campaign_time_change')return {data:{...mock.current},error:null};
   return {data:[],error:null};
  });
  setup();
  const button=await screen.findByRole('button',{name:'Confirmar avanço de désdia'});
  await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('não retornou a data e versão esperadas');
  expect(screen.queryByText(/Calendário gravado e confirmado/)).not.toBeInTheDocument();
 });
});

it('seletor acompanha uma data histórica recebida após o carregamento',async()=>{
 function Example(){const [date,setDate]=useState('');
  return <><CampaignDatePicker value={date} onChange={setDate}/><button onClick={()=>setDate('1523-04-17')}>Receber data do banco</button></>;}
 render(<Example/>);
 fireEvent.click(screen.getByRole('button',{name:'Receber data do banco'}));
 await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Ano'})).toHaveValue(1523));
 expect(screen.getByRole('combobox',{name:'Mês'})).toHaveValue('3');
});
