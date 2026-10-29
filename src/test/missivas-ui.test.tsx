import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MissivasTab} from '@/components/players/missivas-tab';
import type {Panel} from '@/components/players/panel-data';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn<(name:string,args?:unknown)=>Promise<{data:unknown;error:null}>>(async()=>({data:2,error:null}))}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,from:()=>({select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})}}));
vi.mock('@/components/campaign-content',()=>({CampaignContent:({content}:{content:string})=><div>{content}</div>,ImagePicker:()=>null,uploadImages:async(content:string)=>content}));
const letter={id:'letter',sender_user_id:'me',sender_player_id:'player',sender_name:'Autor',recipient_house_id:'other',recipient_player_id:null,subject:'Ordem enviada',content:'Original',created_at:'2026-10-28',sync_state:'pending',last_synced_at:null,letter_number:1,letter_kind:'reservada',publication_state:'delivered',delivery_week:1,version:1};
function data(replies:unknown[]=[]){return {user:{id:'me'},admin:false,players:[{id:'player',user_id:'me',name:'Autor'}],members:[{player_id:'player',house_id:'home'}],houses:[{id:'home',name:'Casa',active:true,season:2},{id:'other',name:'Outra',active:true,season:2}],letters:[letter],replies,receipts:[],rounds:[{number:1,status:'open'}],records:[],catalog:[]} as unknown as Panel;}
let currentPanel:Panel;
const options={players:[{id:'player',name:'Autor',houses:['home']},{id:'other-player',name:'Destinatário B',houses:['other']},{id:'third-player',name:'Destinatário C',houses:[]}],houses:[{id:'home',name:'Casa',version:1,court:[{id:'c1',name:'Administrador',role:'Administrador'}],units:[{id:'u1',name:'Guarda',available:true}]}]};
beforeEach(()=>rpc.mockImplementation(async(name:string)=>{
 if(name==='mail_page')return {data:{total:currentPanel.letters.length,letters:currentPanel.letters,replies:currentPanel.replies},error:null};
 if(name==='mail_compose_options')return {data:options,error:null};
 if(name==='mail_insights')return {data:[],error:null};
 if(name==='dated_mail_action')return {data:{ids:['a','b'],state:'delivered',week:1},error:null};
 return {data:2,error:null};
}));
function mount(panel:Panel){currentPanel=panel;return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissivasTab data={panel} me={panel.players[0]} onSave={vi.fn()} onError={vi.fn()}/></QueryClientProvider>);}
afterEach(()=>{cleanup();rpc.mockClear();});
describe('interface de missivas',()=>{
 it('permite marcar como lida uma resposta em missiva enviada',async()=>{
  mount(data([{id:'reply',letter_id:'letter',author_user_id:'other',author_name:'Outro',content:'Resposta recebida',publication_state:'delivered',created_at:'2026-10-28'}]));
  fireEvent.click(await screen.findByRole('button',{name:/Ordem enviada/}));
  fireEvent.click(screen.getByRole('button',{name:'Marcar como lida'}));
  expect(rpc).toHaveBeenCalledWith('mark_letter_read',{p_id:'letter'});
 });
 it('mostra e permite editar resposta em rascunho dentro de conversa entregue',async()=>{
  mount(data([{id:'draft',letter_id:'letter',reply_to_id:'reply',author_user_id:'me',author_name:'Autor',content:'Texto salvo',publication_state:'draft',created_at:'2026-10-28'}]));
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'rascunhos'}});
  fireEvent.click(await screen.findByRole('button',{name:/Ordem enviada/}));
  fireEvent.click(screen.getByRole('button',{name:'Editar rascunho'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'Texto atualizado'}});
  fireEvent.click(screen.getAllByText('Selecionar dia no calendário')[0]!);
  fireEvent.click(screen.getAllByRole('button',{name:'1 de Hammer, 1522',hidden:true})[0]!);
  fireEvent.click(screen.getAllByRole('button',{name:'Salvar rascunho'})[0]!);
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('dated_mail_action',{p_action:'save_weekly_reply_draft',p_date:'1522-01-01',p_args:{p_id:'draft',p_letter:'letter',p_reply:'reply',p_content:'Texto atualizado'}}));
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

describe('novos destinatários e vínculos',()=>{
 it('envia para dois jogadores com corte e unidade opcionais selecionadas',async()=>{
  mount(data());
  fireEvent.click(await screen.findByLabelText(/Destinatário B/));
  fireEvent.click(screen.getByLabelText(/Destinatário C/));
  fireEvent.click(screen.getByLabelText('Narrador'));
  fireEvent.change(screen.getByLabelText('Membro da corte (opcional)'),{target:{value:'c1'}});
  fireEvent.change(screen.getByLabelText('Unidade militar (opcional)'),{target:{value:'u1'}});
  fireEvent.change(screen.getByLabelText('Assunto'),{target:{value:'Marcha'}});
  fireEvent.change(screen.getByLabelText('Missiva'),{target:{value:'Acompanhar a coluna'}});
  fireEvent.click(screen.getByText('Selecionar dia no calendário'));
  fireEvent.click(screen.getByRole('button',{name:'1 de Hammer, 1522',hidden:true}));
  fireEvent.click(screen.getByRole('button',{name:'Enviar missiva'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('dated_mail_action',expect.objectContaining({p_action:'send_linked_mail',p_date:'1522-01-01',p_args:expect.objectContaining({p_targets:['p:other-player','p:third-player'],p_origin:'home',p_court:'c1',p_unit:'u1',p_role:'executor',p_draft:false})})));
 });
 it('mostra ambos os novos filtros e os envia ao servidor',async()=>{
  mount(data());await screen.findByLabelText(/Destinatário B/);
  fireEvent.change(screen.getByLabelText('Membro da corte'),{target:{value:'home:c1'}});
  fireEvent.change(screen.getByLabelText('Unidade militar'),{target:{value:'home:u1'}});
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('mail_page',expect.objectContaining({p_filters:expect.objectContaining({court:'home:c1',unit:'home:u1'})})));
 });
});
