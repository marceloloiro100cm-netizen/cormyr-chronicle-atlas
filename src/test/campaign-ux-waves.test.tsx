import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {houseNavigationVisible} from '@/lib/house/navigation';
import {resolveLinkNames,rememberSignature,loadRecentSignatures} from '@/lib/mail/link-labels';
import type {Panel} from '@/components/players/panel-data';

const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>{
 const chain:Record<string,unknown>={};
 Object.assign(chain,{select:()=>chain,eq:()=>chain,maybeSingle:()=>chain,
  then:(resolve:(v:unknown)=>unknown)=>resolve({data:[],error:null})});
 return {supabase:{rpc:mock.rpc,from:()=>chain}};
});
vi.mock('@/lib/calendar/campaign-time',()=>({useCampaignTime:()=>({data:{year:1522,month:9,day:21,festival:null}})}));
vi.mock('@/components/players/narrator-mail-notes',()=>({NarratorMailNotes:()=>null}));
vi.mock('@/components/players/letter-consequences',()=>({LetterConsequences:()=>null}));
vi.mock('@/components/campaign-content',()=>({CampaignContent:({content}:{content:string})=><p>{content}</p>,ImagePicker:()=>null,uploadImages:async(c:string)=>c}));

import {ChancelariaMissivas} from '@/components/players/chancelaria/ChancelariaMissivas';

afterEach(()=>{cleanup();mock.rpc.mockReset();localStorage.clear();});

describe('Melhorias UX (Ondas 1, 2 e 3)',()=>{
 it('oculta a aba Criação para jogadores quando a Casa já está ativa e mantém para o Narrador e rascunhos',()=>{
  expect(houseNavigationVisible('creation',false,true,'active')).toBe(false);
  expect(houseNavigationVisible('creation',false,true,'draft')).toBe(true);
  expect(houseNavigationVisible('creation',true,true,'active')).toBe(true);
  expect(houseNavigationVisible('army',false,true,'active')).toBe(true);
 });

 it('resolve nomes reais de Corte e Unidade vinculadas e lembra assinaturas recentes de NPCs',()=>{
  const resolved=resolveLinkNames([{
   id:'harcourt',name:'Harcourt',
   court:[{id:'c1',name:'Sor Aldric',role:'Castelão'}],
   units:[{id:'u1',name:'Guarda da Ponte',available:true}],
  }],'c1','u1');
  expect(resolved).toEqual({courtLabel:'Sor Aldric · Castelão',unitLabel:'Guarda da Ponte'});

  rememberSignature('Conselho de Elversult');
  rememberSignature('Dragões Púrpuras');
  expect(loadRecentSignatures()).toEqual(['Dragões Púrpuras','Conselho de Elversult']);
 });

 it('renderiza Chancelaria v5 para jogadores com brasão, nome real dos vínculos e sem avisos técnicos de Storage',async()=>{
  const letter={
   id:'b'.repeat(64),source:'firebase-cloud',sender_user_id:'narrador',sender_name:'Narrador',
   origin_house_id:null,recipient_house_id:'harcourt',recipient_player_id:null,
   subject:'Convocação real em Suzail',content:'A Coroa convoca o conselho da Casa.',
   created_at:'2026-11-20T00:00:00Z',publication_state:'delivered',
   delivery_week:4,creation_week:4,conversation_id:'b'.repeat(64),letter_kind:'reservada',
   sync_state:'synced',last_synced_at:null,letter_number:2,
   court_member_id:'c1',military_unit_id:'u1',
  };
  mock.rpc.mockImplementation(async(name:string)=>{
   if(name==='mail_page')return {data:{total:1,letters:[letter],replies:[]},error:null};
   if(name==='mail_compose_options')return {
    data:{players:[],houses:[{id:'harcourt',name:'Harcourt',version:1,court:[{id:'c1',name:'Sor Aldric',role:'Castelão'}],units:[{id:'u1',name:'Guarda da Ponte',available:true}]}]},
    error:null,
   };
   return {data:null,error:null};
  });
  const panel={
   admin:false,user:{id:'u-player'},
   players:[{id:'p1',user_id:'u-player',name:'Jogador',active:true,roster_house_id:'harcourt'}],
   members:[{player_id:'p1',house_id:'harcourt',can_edit:true}],
   receipts:[],rounds:[{number:4,status:'open'}],
   houses:[{id:'harcourt',name:'Harcourt',active:true,season:2,crest:null,lord_name:'Lady Genevieve',castle:'Honorwatch Keep',region:'Horselands'}],
  } as unknown as Panel;

  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}>
   <ChancelariaMissivas data={panel} me={panel.players[0]} onSave={vi.fn()} onError={vi.fn()}/>
  </QueryClientProvider>);

  expect(await screen.findByRole('heading',{name:'Convocação real em Suzail'})).toBeInTheDocument();
  expect(await screen.findByText(/Sor Aldric · Castelão/)).toBeInTheDocument();
  expect(screen.getByText(/Guarda da Ponte/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Minha Casa/})).toBeInTheDocument();
  expect(screen.queryByText(/homologação do Firebase Storage/i)).toBeNull();
 });
});
