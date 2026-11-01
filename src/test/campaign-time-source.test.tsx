import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useCampaignTime, getCampaignTime, validateCampaignTimeSnapshot, campaignTimeView, CAMPAIGN_TIME_QUERY_KEY} from '@/lib/calendar/campaign-time';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useState} from 'react';

const mocks=vi.hoisted(()=>({
 rpc:vi.fn(),
 current:{year:1522,month:0,day:21,festival:null as string|null,auto_advance:true,version:1,published_week:2},
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>mocks.rpc(...args)}}));

beforeEach(()=>{
 mocks.current={year:1522,month:0,day:21,festival:null,auto_advance:true,version:1,published_week:2};
 mocks.rpc.mockReset();
 mocks.rpc.mockImplementation(async (name:string)=>name==='get_campaign_calendar'
   ?{data:{...mocks.current},error:null}
   :{data:null,error:{message:'Unexpected call'}});
});
afterEach(cleanup);

describe('Hub Temporal · Lote 3 · leitura oficial única',()=>{
 it('valida a fonte do servidor e preserva o shape da publicação',async()=>{
  const time=await getCampaignTime();
  expect(time).toMatchObject({year:1522,month:0,day:21,version:1,published_week:2});
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('get_campaign_calendar');
  expect(CAMPAIGN_TIME_QUERY_KEY).toEqual(['campaign-calendar']);
  expect(campaignTimeView(time)).toMatchObject({
   date:'1522-01-21',year:1522,month:0,day:21,desdia:3,season:'winter',
  });
 });

 it('rejeita ausência de resposta, ano fictício, data divergente, festival inválido e versão incorreta',()=>{
  const valid={...mocks.current};
  expect(()=>validateCampaignTimeSnapshot(null)).toThrow('indisponível');
  expect(()=>validateCampaignTimeSnapshot({...valid,year:0})).toThrow('inválida');
  expect(()=>validateCampaignTimeSnapshot({...valid,month:12})).toThrow('inválida');
  expect(()=>validateCampaignTimeSnapshot({...valid,day:31})).toThrow('inválida');
  expect(()=>validateCampaignTimeSnapshot({...valid,month:0,festival:'greengrass',day:30})).toThrow('incompatíveis');
  expect(()=>validateCampaignTimeSnapshot({...valid,year:1523,month:6,day:30,festival:'shieldmeet'})).toThrow('inválida');
  expect(()=>validateCampaignTimeSnapshot({...valid,version:-1})).toThrow('inválida');
  expect(()=>validateCampaignTimeSnapshot({...valid,auto_advance:null})).toThrow('inválida');
 });

 it('dois componentes compartilham a mesma consulta e atualizam juntos com mudança de ano',async()=>{
  const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
  function Clock({label}:{label:string}){
   const time=useCampaignTime();
   return <span>{label}: {time.data?.year??'indisponível'} CV</span>;
  }
  render(<QueryClientProvider client={qc}><Clock label="Narrador"/><Clock label="Casa"/></QueryClientProvider>);
  expect(await screen.findByText('Narrador: 1522 CV')).toBeInTheDocument();
  expect(screen.getByText('Casa: 1522 CV')).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.current={...mocks.current,year:1523,month:0,day:1,version:2};
  await act(async()=>{await qc.invalidateQueries({queryKey:CAMPAIGN_TIME_QUERY_KEY});});
  await waitFor(()=>expect(screen.getByText('Narrador: 1523 CV')).toBeInTheDocument());
  expect(screen.getByText('Casa: 1523 CV')).toBeInTheDocument();
 });

 it('não usa 1522 como fallback se a fonte oficial ficar indisponível',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{message:'Sem acesso à campanha'}});
  await expect(getCampaignTime()).rejects.toMatchObject({message:'Sem acesso à campanha'});
  expect(()=>validateCampaignTimeSnapshot(undefined)).toThrow();
 });

 it('o seletor inicia no ano oficial sem atribuir automaticamente data à missiva',async()=>{
  function Form(){
   const [value,setValue]=useState('');
   return <CampaignDatePicker value={value} referenceDate="1523-04-17" onChange={setValue}/>;
  }
  render(<Form/>);
  fireEvent.click(screen.getByText('Selecionar dia no calendário'));
  expect(screen.getByRole('spinbutton',{name:'Ano'})).toHaveValue(1523);
  expect(screen.getByRole('combobox',{name:'Mês'})).toHaveValue('3');
  expect(screen.getByRole('combobox',{name:'Dia selecionado'})).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'18 de Tarsakh, 1523'}));
  expect(screen.getByRole('combobox',{name:'Dia selecionado'})).toHaveValue('1523-04-18');
 });

 it('seletor sem data oficial não presume um ano atual',()=>{
  render(<CampaignDatePicker value="" onChange={()=>{}}/>);
  fireEvent.click(screen.getByText('Selecionar dia no calendário'));
  expect(screen.getByRole('spinbutton',{name:'Ano'})).toHaveValue(null);
  expect(screen.getByText(/Informe um ano ou aguarde a data oficial/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/^1 de Hammer/})).not.toBeInTheDocument();
 });
});
