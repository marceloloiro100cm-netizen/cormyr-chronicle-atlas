import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MissivasTab} from '@/components/players/missivas-tab';
import type {Panel} from '@/components/players/panel-data';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn(async()=>({data:2,error:null}))}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,from:()=>({select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})}}));
vi.mock('@/components/campaign-content',()=>({CampaignContent:({content}:{content:string})=><div>{content}</div>,ImagePicker:()=>null,uploadImages:async(content:string)=>content}));
const letter={id:'letter',sender_user_id:'me',sender_player_id:'player',sender_name:'Autor',recipient_house_id:'other',recipient_player_id:null,subject:'Ordem enviada',content:'Original',created_at:'2026-10-28',sync_state:'pending',last_synced_at:null,letter_number:1,letter_kind:'reservada',publication_state:'delivered',delivery_week:1,version:1};
function data(replies:unknown[]=[]){return {user:{id:'me'},admin:false,players:[{id:'player',user_id:'me',name:'Autor'}],members:[{player_id:'player',house_id:'home'}],houses:[{id:'home',name:'Casa',active:true,season:2},{id:'other',name:'Outra',active:true,season:2}],letters:[letter],replies,receipts:[],rounds:[{number:1,status:'open'}],records:[],catalog:[]} as unknown as Panel;}
function mount(panel:Panel){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissivasTab data={panel} me={panel.players[0]} onSave={vi.fn()} onError={vi.fn()}/></QueryClientProvider>);}
afterEach(()=>{cleanup();rpc.mockClear();});
describe('interface de missivas',()=>{
 it('permite marcar como lida uma resposta em missiva enviada',async()=>{
  mount(data([{id:'reply',letter_id:'letter',author_user_id:'other',author_name:'Outro',content:'Resposta recebida',publication_state:'delivered',created_at:'2026-10-28'}]));
  fireEvent.click(screen.getByRole('button',{name:/Ordem enviada/}));
  fireEvent.click(screen.getByRole('button',{name:'Marcar como lida'}));
  expect(rpc).toHaveBeenCalledWith('mark_letter_read',{p_id:'letter'});
 });
 it('mostra e permite editar resposta em rascunho dentro de conversa entregue',async()=>{
  mount(data([{id:'draft',letter_id:'letter',reply_to_id:'reply',author_user_id:'me',author_name:'Autor',content:'Texto salvo',publication_state:'draft',created_at:'2026-10-28'}]));
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'rascunhos'}});
  fireEvent.click(screen.getByRole('button',{name:/Ordem enviada/}));
  fireEvent.click(screen.getByRole('button',{name:'Editar rascunho'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'Texto atualizado'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Salvar rascunho'})[0]!);
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('save_weekly_reply_draft',{p_id:'draft',p_letter:'letter',p_reply:'reply',p_content:'Texto atualizado'}));
 });
 it('recupera o texto de uma nova missiva ao voltar à aba',()=>{
  const view=mount(data());
  fireEvent.change(screen.getByLabelText('Assunto'),{target:{value:'Rascunho local'}});
  fireEvent.change(screen.getByLabelText('Missiva'),{target:{value:'Texto preservado'}});
  view.unmount();mount(data());
  expect(screen.getByLabelText('Assunto')).toHaveValue('Rascunho local');
  expect(screen.getByLabelText('Missiva')).toHaveValue('Texto preservado');
 });
});
