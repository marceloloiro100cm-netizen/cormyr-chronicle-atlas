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
 if(name==='get_campaign_calendar')return {data:{year:1522,month:0,day:1,festival:null,auto_advance:true,version:1,published_week:1},error:null};
 if(name==='mail_page')return {data:{total:currentPanel.letters.length,letters:currentPanel.letters,replies:currentPanel.replies,kpis:{delivered:7,awaiting_house:3,awaiting_narrator:2,scheduled_replies_next:4,drafts:1}},error:null};
 if(name==='mail_compose_options')return {data:options,error:null};
 if(name==='mail_insights')return {data:[],error:null};
 if(name==='dated_mail_action')return {data:{ids:['a','b'],state:'delivered',week:1},error:null};
 return {data:2,error:null};
}));
function mount(panel:Panel){currentPanel=panel;return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissivasTab data={panel} me={panel.players[0]} onSave={vi.fn()} onError={vi.fn()}/></QueryClientProvider>);}
afterEach(()=>{cleanup();rpc.mockClear();});
async function findSentSubject(name:RegExp){
 const displayed=screen.queryByRole('button',{name});
 if(displayed)return displayed;
 fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'enviadas'}});
 return await screen.findByRole('button',{name});
}
describe('interface de missivas',()=>{
 it('mantém a listagem de enviadas oculta por padrão e permite recuperá-la pelo filtro',async()=>{
  mount(data());
  await waitFor(()=>expect(screen.getByText('Nenhuma missiva encontrada.')).toBeInTheDocument());
  expect(screen.queryByRole('button',{name:/Ordem enviada/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'enviadas'}});
  expect(await screen.findByRole('button',{name:/Ordem enviada/})).toBeInTheDocument();
 });
 it('exibe missivas enviadas pelo Narrador quando a caixa está em Todas',async()=>{
  const panel={...data(),admin:true} as unknown as Panel;
  mount(panel);
  expect(await screen.findByRole('button',{name:/Ordem enviada/})).toBeInTheDocument();
 });
 it('permite marcar como lida uma resposta em missiva enviada',async()=>{
  mount(data([{id:'reply',letter_id:'letter',author_user_id:'other',author_name:'Outro',content:'Resposta recebida',publication_state:'delivered',created_at:'2026-10-28'}]));
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  fireEvent.click(screen.getByRole('button',{name:'Marcar como lida'}));
  expect(rpc).toHaveBeenCalledWith('mark_letter_read',{p_id:'letter'});
 });
 it('mostra e permite editar resposta em rascunho dentro de conversa entregue',async()=>{
  mount(data([{id:'draft',letter_id:'letter',reply_to_id:'reply',author_user_id:'me',author_name:'Autor',content:'Texto salvo',publication_state:'draft',created_at:'2026-10-28'}]));
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'rascunhos'}});
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  fireEvent.click(screen.getByRole('button',{name:'Editar rascunho'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'Texto atualizado'}});
  fireEvent.click(screen.getAllByText('Selecionar dia no calendário')[0]!);
  fireEvent.click((await screen.findAllByRole('button',{name:'1 de Hammer, 1522',hidden:true}))[0]!);
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

describe('apresentação de fios de respostas',()=>{
 it('termina a missiva original na assinatura de Mara e mostra Genevieve num cartão de resposta separado',async()=>{
  const panel={...data([{
   id:'reply-harcourt',letter_id:'letter',reply_to_id:'letter',
   author_user_id:'harcourt-user',author_name:'Lady Genevieve Harcourt',
   content:'Mara\n\nSeu irmão voltou depois de dez anos e encontrou uma oficina funcionando.',
   publication_state:'delivered',created_at:'2026-10-30',campaign_date:null,sync_state:'synced',
  }]),letters:[{...letter,subject:'O filho que ficou',sender_name:'Mara, Carpinteira de Goldsun',
   content:'Lady Genevieve,\n\nA oficina ainda leva o nome dele na porta.\n\nMara, Carpinteira de Goldsun'}]} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/O filho que ficou/));
  const original=screen.getByRole('region',{name:'Texto da missiva original'});
  const thread=screen.getByRole('region',{name:'Fio de respostas: O filho que ficou'});
  const reply=screen.getByRole('article',{name:'Resposta de Lady Genevieve Harcourt'});
  expect(original).toHaveTextContent('Mara, Carpinteira de Goldsun');
  expect(original).not.toHaveTextContent('Seu irmão voltou depois de dez anos');
  expect(original.nextElementSibling).toBe(thread);
  expect(thread).toHaveTextContent('Fio de respostas');
  expect(thread).toHaveTextContent('1 resposta');
  expect(reply).toHaveClass('campaign-reply-card');
  expect(reply).toHaveTextContent('Lady Genevieve Harcourt');
  expect(reply).toHaveTextContent('Seu irmão voltou depois de dez anos');
  expect(reply).toHaveTextContent('Sem data histórica informada');
 });
 it('não cria fio de resposta quando só existe a missiva original',async()=>{
  mount(data());
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  expect(screen.getByRole('region',{name:'Texto da missiva original'})).toHaveTextContent('Original');
  expect(screen.queryByRole('region',{name:/Fio de respostas:/})).not.toBeInTheDocument();
 });
});

describe('novos destinatários e vínculos',()=>{
 it('envia para uma casa sem mostrar jogadores individuais e preserva vínculos opcionais',async()=>{
  mount(data());
  fireEvent.click(screen.getByRole('checkbox',{name:'Outra'}));
  await waitFor(()=>expect(screen.getByLabelText('Membro da corte (opcional)').querySelector('option[value="c1"]')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Membro da corte (opcional)'),{target:{value:'c1'}});
  fireEvent.change(screen.getByLabelText('Unidade militar (opcional)'),{target:{value:'u1'}});
  fireEvent.change(screen.getByLabelText('Assunto'),{target:{value:'Marcha'}});
  fireEvent.change(screen.getByLabelText('Missiva'),{target:{value:'Acompanhar a coluna'}});
  fireEvent.click(screen.getByText('Selecionar dia no calendário'));
  fireEvent.click(await screen.findByRole('button',{name:'1 de Hammer, 1522',hidden:true}));
  fireEvent.click(screen.getByRole('button',{name:'Enviar missiva'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('dated_mail_action',expect.objectContaining({p_action:'send_linked_mail',p_date:'1522-01-01',p_args:expect.objectContaining({p_targets:['h:other'],p_origin:'home',p_court:'c1',p_unit:'u1',p_role:'executor',p_draft:false})})));
 });
 it('mostra ambos os novos filtros e os envia ao servidor',async()=>{
  mount(data());await waitFor(()=>expect(screen.getByLabelText('Membro da corte (opcional)').querySelector('option[value="c1"]')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Membro da corte'),{target:{value:'home:c1'}});
  fireEvent.change(screen.getByLabelText('Unidade militar'),{target:{value:'home:u1'}});
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('mail_page',expect.objectContaining({p_filters:expect.objectContaining({court:'home:c1',unit:'home:u1'})})));
 });
});

describe('lote 2: destinatários e semanas',()=>{
 it('Narrador não consegue salvar ou enviar missiva sem destinatários',async()=>{
   const panel={...data(),user:{id:'narrator-no-recipient'},admin:true} as unknown as Panel;
   mount(panel);
   fireEvent.click(screen.getByRole('button',{name:'Escrever missiva'}));
   await waitFor(()=>expect(screen.getByText(/Nenhuma casa selecionada/)).toBeInTheDocument());
   expect(screen.getByRole('button',{name:'Salvar rascunho'})).toBeDisabled();
   expect(screen.getByRole('button',{name:'Programar entrega'})).toBeDisabled();
 });
 it('distingue a semana de envio da semana de recebimento no cartão',async()=>{
   const panel={...data(),letters:[{...letter,creation_week:1,delivery_week:2,letter_number:2}]} as unknown as Panel;
   mount(panel);
   await findSentSubject(/Ordem enviada/);
   await waitFor(()=>expect(screen.getByRole('button',{name:/Ordem enviada/})).toHaveTextContent('Enviada na Semana 1 · Recebida na Semana 2'));
   fireEvent.click(screen.getByRole('button',{name:/Ordem enviada/}));
   expect(screen.getAllByText('Enviada na Semana 1 · Recebida na Semana 2').length).toBeGreaterThanOrEqual(1);
 });
 it('mostra semana de criação e entrega nas respostas de missivas relacionadas',async()=>{
   const panel={...data([{
     id:'reply-related',letter_id:'related',author_user_id:'another',
     author_name:'Lady da Corte',content:'Resposta relacionada',
     creation_week:2,delivery_week:3,publication_state:'delivered',created_at:'2026-10-29',
   }]),letters:[
     {...letter,conversation_id:'thread-one'},
     {...letter,id:'related',subject:'Carta relacionada',conversation_id:'thread-one',created_at:'2026-10-29'},
   ]} as unknown as Panel;
   mount(panel);
   fireEvent.click(await findSentSubject(/Ordem enviada/));
   fireEvent.click(screen.getByRole('button',{name:/Ver relacionadas nesta página/}));
   expect(screen.getByText('Resposta · Enviada na Semana 2 · Recebida na Semana 3')).toBeInTheDocument();
 });
 it('bloqueia tentativa de abrir uma semana com salto pelo painel',async()=>{
   const panel={...data(),user:{id:'narrator-test-week'},admin:true,rounds:[{number:1,status:'closed'},{number:2,status:'open'}]} as unknown as Panel;
   const error=vi.fn();
   currentPanel=panel;
   render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissivasTab data={panel} me={panel.players[0]} onSave={vi.fn()} onError={error}/></QueryClientProvider>);
   fireEvent.change(screen.getByRole('spinbutton',{name:'Número da missiva a abrir'}),{target:{value:'9'}});
   fireEvent.click(screen.getByRole('button',{name:'Abrir missiva'}));
   expect(error).toHaveBeenCalledWith(expect.stringContaining('A próxima semana permitida é 3'));
   expect(rpc).not.toHaveBeenCalledWith('set_letter_round',expect.anything());
 });
});

describe('lote 3: gestão e leitura do Narrador',()=>{
 it('separa recibo de leitura da Casa do recebimento de respostas pelo Mestre',async()=>{
  const panel={...data([{
    id:'house-reply',letter_id:'letter',author_user_id:'house-user',author_name:'Casa destinatária',
    content:'Resposta nova',publication_state:'delivered',created_at:'2026-10-29T13:00:00Z',
  }]),admin:true,letters:[{...letter,recipient_read:true}]} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  const indicators=screen.getByRole('region',{name:'Indicadores de leitura separados'});
  expect(indicators).toHaveTextContent('Leitura da Casa: Leitura registrada');
  expect(indicators).toHaveTextContent('Leitura do Narrador: Nova resposta não lida');
  expect(screen.getByRole('button',{name:/Ordem enviada/})).toHaveTextContent('Aguardando resposta do Narrador');
  fireEvent.click(screen.getByRole('button',{name:'Marcar como lida'}));
  expect(rpc).toHaveBeenCalledWith('mark_letter_read',{p_id:'letter'});
 });
 it('não oferece marcar como lida quando o Mestre apenas aguarda resposta da Casa',async()=>{
  const panel={...data(),admin:true} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  expect(screen.getByRole('button',{name:/Ordem enviada/})).toHaveTextContent('Aguardando resposta da Casa');
  expect(screen.getByRole('region',{name:'Indicadores de leitura separados'})).toHaveTextContent('Nenhuma resposta entregue');
  expect(screen.queryByRole('button',{name:'Marcar como lida'})).not.toBeInTheDocument();
 });
 it('envia ao servidor filtros de turno e de respostas programadas na semana do retorno',async()=>{
  const panel={...data([{id:'programmed',letter_id:'letter',author_user_id:'me',author_name:'Mestre',content:'Programada',publication_state:'scheduled',delivery_week:3,creation_week:2}]),admin:true} as unknown as Panel;
  mount(panel);
  fireEvent.change(screen.getByLabelText('Resposta'),{target:{value:'pending-outgoing'}});
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('mail_page',expect.objectContaining({p_filters:expect.objectContaining({answered:'pending-outgoing'})})));
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'programadas'}});
  fireEvent.change(screen.getByLabelText('Semana'),{target:{value:'3'}});
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('mail_page',expect.objectContaining({p_filters:expect.objectContaining({box:'programadas',number:'3'})})));
 });
});

describe('lote 4: métricas completas do Narrador',()=>{
 it('mostra KPIs retornados pelo servidor sem confundir paginação com resultado filtrado',async()=>{
   const panel={...data(),admin:true} as unknown as Panel;
   mount(panel);
   const stats=await screen.findByRole('region',{name:'Indicadores da gestão de missivas'});
   await waitFor(()=>expect(stats).toHaveTextContent('7Entregues'));
   expect(stats).toHaveTextContent('3Aguardando Jogador');
   expect(stats).toHaveTextContent('2Aguardando Narrador');
   expect(stats).toHaveTextContent('4Respostas programadas (próx. semana)');
   expect(stats).toHaveTextContent('1Rascunhos do Narrador');
   expect(screen.queryByText(/Indicadores de todos os resultados dos filtros ativos/)).not.toBeInTheDocument();
   fireEvent.change(screen.getByLabelText('Resposta'),{target:{value:'awaiting-house'}});
   await waitFor(()=>expect(rpc).toHaveBeenCalledWith('mail_page',expect.objectContaining({
     p_filters:expect.objectContaining({answered:'awaiting-house'})
   })));
 });
});

describe('lote 5: complementos e manutenção do fio',()=>{
 it('Narrador pode adicionar complemento na própria carta antes de receber resposta',async()=>{
  const panel={...data(),admin:true,
    players:[{id:'player',user_id:'me',name:'Narrador',active:true},
      {id:'recipient',user_id:'house-member',name:'Destinatária',active:true,require_password_change:false}],
    members:[{player_id:'recipient',house_id:'other'}]} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  fireEvent.click(screen.getByRole('button',{name:'Adicionar complemento'}));
  expect(screen.getByRole('textbox',{name:'Resposta'})).toBeInTheDocument();
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('reply_delivery_week',{p_recipient:'house-member'}));
 });
 it('Narrador recebe botão de resposta ao último comentário de jogador na carta que ele iniciou',async()=>{
  const panel={...data([{id:'house-answer',letter_id:'letter',author_user_id:'house-member',
    author_name:'Destinatária',content:'Recebido',created_at:'2026-10-30T10:00:00Z',publication_state:'delivered'}]),
    admin:true,players:[{id:'recipient',user_id:'house-member',name:'Destinatária',active:true,require_password_change:false}],
    members:[{player_id:'recipient',house_id:'other'}]} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  fireEvent.click(screen.getByRole('button',{name:'Responder à Casa'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Resposta'}),{target:{value:'O Narrador respondeu'}});
  fireEvent.click(screen.getByText('Selecionar dia no calendário'));
  fireEvent.click(await screen.findByRole('button',{name:'1 de Hammer, 1522',hidden:true}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Enviar resposta'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Enviar resposta'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('dated_mail_action',expect.objectContaining({
    p_action:'reply_weekly_message',
    p_args:expect.objectContaining({p_letter:'letter',p_reply:'house-answer',p_content:'O Narrador respondeu'})
  })));
 });
 it('administrador edita versão entregue e exclui resposta por exclusão lógica',async()=>{
  const panel={...data([{id:'reply-edited',letter_id:'letter',author_user_id:'house-member',author_name:'Destinatária',
    content:'Texto original',publication_state:'delivered',created_at:'2026-10-29T10:00:00Z',version:3}]),admin:true} as unknown as Panel;
  mount(panel);
  fireEvent.click(await findSentSubject(/Ordem enviada/));
  fireEvent.click(screen.getByRole('button',{name:'Editar resposta'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Texto da resposta'}),{target:{value:'Versão corrigida'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar resposta revisada'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('edit_letter_reply',{p_id:'reply-edited',p_version:3,p_content:'Versão corrigida'}));
  const originalConfirm=globalThis.confirm;
  vi.stubGlobal('confirm',()=>true);
  try{
   fireEvent.click(screen.getByRole('button',{name:'Excluir resposta'}));
   await waitFor(()=>expect(rpc).toHaveBeenCalledWith('delete_letter_reply',{p_id:'reply-edited',p_version:3}));
  }finally{vi.stubGlobal('confirm',originalConfirm);}
 });
 it('cartas irmãs do mesmo lote nunca exibem as respostas privadas como fio relacionado',async()=>{
  const panel={...data([{id:'secret-reply',letter_id:'other-letter',author_user_id:'another',
    author_name:'Segredo particular',content:'Mensagem confidencial',publication_state:'delivered',created_at:'2026-10-29'}]),
    admin:true,letters:[
      {...letter,id:'letter',batch_key:'batch',conversation_id:'shared-legacy'},
      {...letter,id:'other-letter',batch_key:'batch',conversation_id:'shared-legacy',created_at:'2026-10-29'},
    ]} as unknown as Panel;
  mount(panel);
  fireEvent.change(screen.getByLabelText('Caixa'),{target:{value:'enviadas'}});
  fireEvent.click((await screen.findAllByRole('button',{name:/Ordem enviada/}))[0]!);
  expect(screen.queryByRole('button',{name:/Ver relacionadas nesta página/})).not.toBeInTheDocument();
 });
});
