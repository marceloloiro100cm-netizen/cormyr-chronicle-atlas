import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PlayerRepresentation} from '@/components/player-representation';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),datedMail:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('@/lib/calendar/mail',()=>({datedMail:mocks.datedMail}));
vi.mock('@/components/campaign-content',()=>({CampaignContent:({content}:{content:string})=><span>{content}</span>}));
const playerId='00000000-0000-0000-0000-000000000002';
const letterId='00000000-0000-0000-0000-000000000100';
const gmReplyId='00000000-0000-0000-0000-000000000105';
const panel={player:{id:'p',user_id:playerId,name:'Jogador representado'},week:3,
 houses:[],records:[],letters:[{id:letterId,subject:'Missiva enviada por mim',sender_user_id:playerId,
 publication_state:'delivered',content:'A primeira missiva',delivery_week:2}],
 replies:[{id:gmReplyId,letter_id:letterId,reply_to_id:letterId,author_user_id:'narrador',
 recipient_user_id:playerId,author_name:'Narrador',content:'Resposta do Mestre',publication_state:'delivered',deleted_at:null}]};
beforeEach(()=>{
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='campaign_representation_action'?panel:name==='get_campaign_calendar'?{year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:3}:null,error:null}));
 mocks.datedMail.mockResolvedValue({data:{id:'r'},error:null});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('lote 6: respostas por representação administrativa',()=>{
 it('associa tréplica à resposta do Narrador, não à própria carta do jogador',async()=>{
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PlayerRepresentation onReturn={vi.fn()}/></QueryClientProvider>);
  fireEvent.click(await screen.findByText(/Semana 2 · Missiva enviada por mim/));
  fireEvent.change(screen.getByRole('combobox',{name:'Mensagem à qual responder em Missiva enviada por mim'}),
   {target:{value:gmReplyId}});
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'Tréplica registrada'}});
  fireEvent.click(screen.getAllByText('Selecionar dia no calendário')[0]!);
  fireEvent.click((await screen.findAllByRole('button',{name:'1 de Hammer, 1522',hidden:true}))[0]!);
  fireEvent.click(screen.getByRole('button',{name:'Responder como jogador'}));
  await waitFor(()=>expect(mocks.datedMail).toHaveBeenCalledWith('representation',{
   p_action:'reply',p_args:{letter:letterId,reply:gmReplyId,content:'Tréplica registrada',key:expect.any(String),draft:false}
  },'1522-01-01'));
 });
 it('oferece salvar rascunho de resposta mesmo que a semana esteja fechada',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==='campaign_representation_action'?{...panel,week:null}:name==='get_campaign_calendar'?{year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:3}:null,error:null}));
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PlayerRepresentation onReturn={vi.fn()}/></QueryClientProvider>);
  fireEvent.click(await screen.findByText(/Semana 2 · Missiva enviada por mim/));
  expect(screen.getByRole('button',{name:'Responder como jogador'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'Rascunho secreto'}});
  fireEvent.click(screen.getAllByText('Selecionar dia no calendário')[0]!);
  fireEvent.click((await screen.findAllByRole('button',{name:'1 de Hammer, 1522',hidden:true}))[0]!);
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho como jogador'}));
  await waitFor(()=>expect(mocks.datedMail).toHaveBeenCalledWith('representation',{
   p_action:'reply',p_args:expect.objectContaining({letter:letterId,draft:true,content:'Rascunho secreto'})
  },'1522-01-01'));
 });
});
