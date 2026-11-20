import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Panel} from '@/components/players/panel-data';

const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>{
 const chain:Record<string,unknown>={};
 Object.assign(chain,{select:()=>chain,eq:()=>chain,maybeSingle:()=>chain,
  then:(resolve:(v:unknown)=>unknown)=>resolve({data:[],error:null})});
 return {supabase:{rpc:mock.rpc,from:()=>chain}};
});
vi.mock('@/lib/calendar/campaign-time',()=>({useCampaignTime:()=>({data:{year:1522,month:9,day:23,festival:null}})}));
vi.mock('@/components/players/mail-compose',()=>({MailComposer:()=><p>Formulário de nova missiva</p>,replaceMailDraft:()=>true}));
vi.mock('@/components/players/narrator-mail-notes',()=>({NarratorMailNotes:()=>null}));
vi.mock('@/components/players/letter-consequences',()=>({LetterConsequences:()=>null}));
vi.mock('@/components/campaign-content',()=>({CampaignContent:({content}:{content:string})=><p>{content}</p>}));
vi.mock('@/components/campaign-private-clock',()=>({default:()=><small>Crônicas do Reino</small>}));

import {I18nProvider} from '@/lib/i18n/context';
import {NarratorWorkspace,RepresentationOptions} from '@/components/players/narrator/NarratorWorkspace';
import {ChancelariaNarrador} from '@/components/players/chancelaria/ChancelariaNarrador';

afterEach(()=>{cleanup();mock.rpc.mockReset();});

describe('Visão do Narrador v5: casca', () => {
 it('o rail, a semana e o selo de missivas levam aos módulos', () => {
  const onSection=vi.fn();
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><I18nProvider><NarratorWorkspace menu={[['painel','Conselho das casas'],['missivas','Missivas'],['calendario','Hub Temporal']]}
   section="painel" onSection={onSection} unread={2} openRound={3} represent={<span/>}
   account={<button type="button">Sair</button>} message="" onDismissMessage={()=>{}}><p>conteúdo</p></NarratorWorkspace></I18nProvider></QueryClientProvider>);
  expect(screen.getByRole('navigation',{name:'Menu do Narrador'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Conselho das casas'})).toHaveAttribute('aria-current','page');
  fireEvent.click(screen.getByRole('button',{name:'Missivas: 2 conversas com correspondência não lida'}));
  expect(onSection).toHaveBeenLastCalledWith('missivas');
  fireEvent.click(screen.getByRole('button',{name:/^Semana 3 aberta/}));
  expect(onSection).toHaveBeenLastCalledWith('calendario');
  fireEvent.click(screen.getByRole('button',{name:'Conta do Narrador'}));
  expect(screen.getByRole('button',{name:'Conta do Narrador'})).toHaveAttribute('aria-expanded','true');
 });

 it('agrupa "Acessar como jogador" pelos grupos de narração', () => {
  const {container}=render(<select aria-label="Acessar como jogador"><RepresentationOptions selfUserId="narrador"
   houses={[{id:'harcourt',name:'Harcourt'},{id:'goldfin',name:'Goldfin'}]}
   players={[
    {id:'p1',name:'Carlos',active:true,user_id:'u1',roster_house_id:'harcourt'},
    {id:'p2',name:'Ana',active:true,user_id:'u2',roster_house_id:'goldfin'},
    {id:'p3',name:'Inativo',active:false,user_id:'u3',roster_house_id:'goldfin'},
    {id:'p4',name:'Narrador',active:true,user_id:'narrador',roster_house_id:null},
   ]}/></select>);
  expect([...container.querySelectorAll('optgroup')].map(g=>g.label)).toEqual(['Grupo 1 · Costa do Dragão','Grupo 2 · Horselands']);
  expect([...container.querySelectorAll('option')].map(o=>o.textContent)).toEqual(['Casa Goldfin · Ana','Casa Harcourt · Carlos']);
 });
});

const LETTER={id:'a'.repeat(64),source:'firebase-cloud',sender_user_id:'u-harcourt',sender_name:'Lady Genevieve Harcourt',
 origin_house_id:'harcourt',recipient_house_id:null,recipient_player_id:null,subject:'A ponte de Emberfall Crossing',
 content:'As cheias levaram dois pilares da ponte.',created_at:'2026-11-10T00:00:00Z',publication_state:'delivered',
 delivery_week:3,creation_week:3,conversation_id:'a'.repeat(64),letter_kind:'reservada',sync_state:'synced',last_synced_at:null,letter_number:1};
const panel={admin:true,user:{id:'narrador'},players:[],members:[],receipts:[],rounds:[{number:2,status:'closed'},{number:3,status:'open'}],
 houses:[{id:'harcourt',name:'Harcourt',active:true,season:2,crest:null,lord_name:'Genevieve Harcourt',castle:'Honorwatch Keep',region:'Horselands'}],
} as unknown as Panel;

function mountChancelaria(){
 mock.rpc.mockImplementation(async(name:string)=>name==='mail_page'
  ?{data:{total:1,letters:[LETTER],replies:[]},error:null}:{data:null,error:null});
 const onOpenHub=vi.fn();
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><ChancelariaNarrador data={panel} me={undefined} onSave={vi.fn()} onError={vi.fn()}
  onOpenHub={onOpenHub}/></QueryClientProvider>);
 return {onOpenHub};
}

describe('Visão do Narrador v5: Chancelaria', () => {
 it('lista, lê, marca como lida e responde pelas RPCs existentes', async () => {
  mountChancelaria();
  expect(await screen.findByRole('heading',{name:'A ponte de Emberfall Crossing'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/^Precisa de atenção/})).toHaveTextContent('1');
  fireEvent.click(screen.getAllByRole('button',{name:'Marcar como lida'})[0]!);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('mark_letter_read',{p_id:LETTER.id}));
  fireEvent.change(screen.getByRole('textbox',{name:'Texto da resposta'}),{target:{value:'A Coroa envia pedreiros.'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('dated_mail_action',expect.objectContaining({
   p_action:'reply_weekly_message',p_date:'1522-10-23',
   p_args:expect.objectContaining({p_letter:LETTER.id,p_content:'A Coroa envia pedreiros.'}),
  })));
 });

 it('abre o Hub Temporal e a escrita de nova missiva no lugar do leitor', async () => {
  const {onOpenHub}=mountChancelaria();
  await screen.findByRole('heading',{name:'A ponte de Emberfall Crossing'});
  fireEvent.click(screen.getByRole('button',{name:'Ir para o Hub Temporal →'}));
  expect(onOpenHub).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Nova missiva'}));
  expect(await screen.findByText('Formulário de nova missiva')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button',{name:'Fechar'})[0]!);
  expect(screen.queryByText('Formulário de nova missiva')).toBeNull();
 });
});
