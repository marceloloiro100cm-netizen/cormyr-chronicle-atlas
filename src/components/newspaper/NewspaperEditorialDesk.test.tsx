import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NewspaperEditorialDesk,type NewspaperEditorialProps} from './NewspaperEditorialDesk';

vi.mock('@/components/change-password',()=>({
 ChangePasswordButton:()=> <button type="button">Alterar senha</button>,
}));
vi.mock('@/lib/newspaper/data',()=>({
 signedCommissionImage:vi.fn(async()=>'blob:imagem-da-casa'),
 signedNewspaperAsset:vi.fn(async()=>'blob:imagem'),
 signedEngravingImage:vi.fn(async()=>'blob:gravura'),
}));
vi.mock('./NewspaperCalendar',()=>({
 NewspaperCalendar:({onWriteAbout}:{onWriteAbout:(date:string,title?:string)=>void})=>
  <button type="button" onClick={()=>onWriteAbout('1522-01-01','Midwinter')}>Escrever sobre a data</button>,
}));
vi.mock('./NewspaperCanvas',()=>({
 NewspaperCanvas:()=> <div data-testid="newspaper-canvas">Página da edição</div>,
}));

function fixture():NewspaperEditorialProps{
 return {
  userId:'leonardo',current:null,history:[],reads:[],loading:false,
  editing:false,busy:false,selectedBlockId:null,error:'',message:'',
  hubDate:'1522-01-01',
  settings:{title:'A Folha Sem Selo',subtitle:'O jornal independente de Cormyr',template:'classico',font_style:'classico'},
  onSaveSettings:vi.fn(async()=>true),
  pendingCommissions:[],commissions:[],houseNames:new Map(),
  onInsertCommission:vi.fn(),onShowCommission:vi.fn(),onRejectCommission:vi.fn(),
  storyModels:[],onUseStoryModel:vi.fn(),onSaveStoryModel:vi.fn(async()=>true),onDeleteStoryModel:vi.fn(),onDeleteEdition:vi.fn(),
  engravings:[],onUploadEngraving:vi.fn(async()=>true),onToggleEngraving:vi.fn(),onDeleteEngraving:vi.fn(),onUseStoredEngraving:vi.fn(),
  staff:[],onSaveStaff:vi.fn(async()=>true),onDeleteStaff:vi.fn(),onWriteAboutDate:vi.fn(),
  revisions:[],onRestoreRevision:vi.fn(),
  engravingsLoading:false,onRestoreEngravings:vi.fn(),
  canUndo:false,canRedo:false,canPasteBlock:false,onUndo:vi.fn(),onRedo:vi.fn(),
  onCopyBlock:vi.fn(()=>'texto'),onCutBlock:vi.fn(()=>'texto'),onPasteBlock:vi.fn(),
  dirty:false,onDiscard:vi.fn(),onDeleteDraft:vi.fn(),
  onNew:vi.fn(),onOpen:vi.fn(),onSave:vi.fn(),onEdit:vi.fn(),
  onPreview:vi.fn(),onPatch:vi.fn(),onSelectBlock:vi.fn(),
  onPatchBlock:vi.fn(),onAddBlock:vi.fn(),onRemoveBlock:vi.fn(),
  onMoveBlock:vi.fn(),onDuplicateBlock:vi.fn(),onReorderBlock:vi.fn(),
  onInsertBefore:vi.fn(),onResizeBlock:vi.fn(),onUpload:vi.fn(),
  onCancel:vi.fn(),onSignout:vi.fn(),
 };
}

describe('Redação A Folha Sem Selo',()=>{
 it('mostra a identidade, ações principais e os nove itens de navegação',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  expect(screen.getByRole('heading',{level:1,name:'A Folha Sem Selo'})).toBeInTheDocument();
  for(const title of ['Painel do Jornal','Escrever o Jornal','Matérias','Calendário',
   'Redação','Anúncios','Arquivo','Leitura e Alcance','Configurações']){
   expect(screen.getByRole('button',{name:title})).toBeInTheDocument();
  }
  expect(screen.getAllByRole('button',{name:'Publicar Edição'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
  expect(screen.getByText('Nenhuma edição publicada ainda')).toBeInTheDocument();
 });
 it('abre a redação com um clique mas não concede navegação de Casas',()=>{
  const props=fixture();render(<NewspaperEditorialDesk {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever Matéria'}));
  expect(props.onNew).toHaveBeenCalledWith('article');
  fireEvent.click(screen.getByRole('button',{name:'Configurações'}));
  expect(screen.queryByRole('button',{name:/outros módulos de cormyr/i})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Missivas'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Ficha'})).not.toBeInTheDocument();
 });
 it('mostra a Redação vazia e o calendário escreve sobre a data',()=>{
  const p=fixture();
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Redação'}));
  expect(screen.getByText(/Nenhum funcionário ainda/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Calendário'}));
  fireEvent.click(screen.getByRole('button',{name:'Escrever sobre a data'}));
  expect(p.onWriteAboutDate).toHaveBeenCalledWith('Dia de Midwinter',expect.stringContaining('Escreva aqui'));
 });
 it('a assinatura é uma caixa com os membros da Redação (Nome e Cargo)',()=>{
  const p=fixture();
  p.staff=[{id:'s1',name:'Elaine Vox',specialty:'Cronista da Corte',bio:'',photo_path:null,created_at:'',updated_at:''}];
  p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'classico',font_style:'classico',
   state:'draft',pdf_path:null,version:1,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
   blocks:[{id:'b1',type:'article',text:'Título\n\nTexto',span:6,height:190}],
  };
  p.editing=true;p.selectedBlockId='b1';
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.change(screen.getByLabelText(/Assinatura do correspondente/),{target:{value:'Elaine Vox, Cronista da Corte'}});
  expect(p.onPatchBlock).toHaveBeenCalledWith('b1',{byline:'Elaine Vox, Cronista da Corte'});
 });
 it('mostra a pré-visualização do modelo e da fonte nas Configurações',()=>{
  const p=fixture();
  p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'guerra',font_style:'condensado',
   state:'draft',pdf_path:null,version:1,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,blocks:[],
  };
  p.settings={...p.settings,template:'guerra',font_style:'condensado'};
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Configurações'}));
  expect(screen.getByLabelText('Pré-visualização do modelo e da fonte')).toBeInTheDocument();
  expect(screen.getAllByText(/Imprensa · Impact/).length).toBeGreaterThan(1);
 });
 it('permite duplicar, formatar gravuras e adicionar aviso sem trocar de perfil',()=>{
  const p=fixture();
  p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:2,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'Notícias de Cormyr',template:'classico',
   font_style:'classico',state:'draft',pdf_path:null,version:1,publication_revision:0,
   created_by:'leonardo',updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
   blocks:[{id:'image1',type:'image',text:'',caption:'Retrato',span:6,height:210,imageStyle:'vintage'}],
  };
  p.editing=true;p.selectedBlockId='image1';
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  fireEvent.click(screen.getByRole('button',{name:'Duplicar bloco'}));
  expect(p.onDuplicateBlock).toHaveBeenCalledWith('image1');
  fireEvent.change(screen.getByLabelText('Estilo da gravura'),{target:{value:'woodcut'}});
  expect(p.onPatchBlock).toHaveBeenCalledWith('image1',{imageStyle:'woodcut'});
  fireEvent.click(screen.getByRole('button',{name:'Aviso / Destaque'}));
  expect(p.onAddBlock).toHaveBeenCalledWith('notice',6);
  expect(screen.queryByRole('button',{name:'Missivas'})).not.toBeInTheDocument();
 });
 it('não permite arquivar rascunhos ainda não publicados',()=>{
  const p=fixture();p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:1,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'O jornal independente de Cormyr',
   template:'classico',font_style:'classico',state:'draft',
   blocks:[{id:'b1',type:'headline',text:'Uma manchete',span:12,height:130}],
   pdf_path:null,version:1,publication_revision:0,created_by:'leonardo',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
  };
  render(<NewspaperEditorialDesk {...p}/>);
  expect(screen.getByRole('button',{name:'Arquivar'})).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button',{name:'Publicar Edição'})[0]!);
  expect(p.onSave).toHaveBeenCalledWith('published');
 });
 it('lista as notícias contratadas em Anúncios e as insere na edição para o Editor-Chefe editar',()=>{
  const p=fixture();
  p.houseNames=new Map([['crownsilver','Casa Crownsilver']]);
  p.pendingCommissions=[{
   id:'11111111-1111-4111-8111-111111111111',house_id:'crownsilver',requested_by:'u1',
   title:'Grande feira em Suzail',body:'A Casa Crownsilver anuncia uma feira de três dias.',
   image_path:null,cost_wealth:1,state:'pending',request_key:'k1',newspaper_id:null,
   created_at:'2026-11-11T12:00:00Z',published_at:null,rejection_note:null,rejected_at:null,seen_at:null,
  }];
  render(<NewspaperEditorialDesk {...p}/>);
  expect(screen.getByLabelText('1 notícia(s) contratada(s) pendente(s)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Anúncios/}));
  expect(screen.getByText('Grande feira em Suzail')).toBeInTheDocument();
  expect(screen.getByText(/^Casa Crownsilver ·/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Inserir na edição e editar'}));
  expect(p.onInsertCommission).toHaveBeenCalledWith(p.pendingCommissions[0]);
 });
 it('sem pedidos, Anúncios informa que não há notícias contratadas pendentes',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Anúncios'}));
  expect(screen.getByText('Nenhuma notícia contratada aguardando publicação.')).toBeInTheDocument();
 });
 it('recusa o pedido com nota obrigatória e devolução de Riqueza',()=>{
  const p=fixture();
  p.pendingCommissions=[{
   id:'11111111-1111-4111-8111-111111111111',house_id:'crownsilver',requested_by:'u1',
   title:'Segredo da Coroa',body:'Texto que não pode circular no reino.',
   image_path:null,cost_wealth:1,state:'pending',request_key:'k2',newspaper_id:null,
   created_at:'2026-11-11T12:00:00Z',published_at:null,rejection_note:null,rejected_at:null,seen_at:null,
  }];
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:/Anúncios/}));
  fireEvent.click(screen.getByRole('button',{name:'Recusar'}));
  const confirm=screen.getByRole('button',{name:/Recusar e devolver 1 de Riqueza/});
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Nota para a Casa/),{target:{value:'Revela segredos da Coroa.'}});
  fireEvent.click(confirm);
  expect(p.onRejectCommission).toHaveBeenCalledWith(p.pendingCommissions[0],'Revela segredos da Coroa.');
 });
 it('exclui rascunho, descarta alterações e troca de edição pelo seletor do topo',()=>{
  const p=fixture();
  const draft={
   id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'classico' as const,font_style:'classico' as const,
   state:'draft' as const,pdf_path:null,version:1,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
   blocks:[{id:'b1',type:'article' as const,text:'Título\n\nTexto',span:6,height:190}],
  };
  p.current=draft;p.history=[draft];p.dirty=true;p.editing=true;p.selectedBlockId='b1';
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Excluir rascunho'}));
  expect(p.onDeleteDraft).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Descartar alterações'}));
  expect(p.onDiscard).toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'Cancelar envio'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próxima edição'}));
  expect(p.onNew).toHaveBeenCalled();
  expect(screen.getByLabelText('Trocar de edição')).toBeInTheDocument();
 });
 it('usa larguras prontas e insere subtítulo como bloco próprio',()=>{
  const p=fixture();
  p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'classico',font_style:'classico',
   state:'draft',pdf_path:null,version:1,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
   blocks:[{id:'b1',type:'article',text:'Título\n\nTexto',span:6,height:190}],
  };
  p.editing=true;p.selectedBlockId='b1';
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  fireEvent.click(screen.getByRole('button',{name:'2/3'}));
  expect(p.onPatchBlock).toHaveBeenCalledWith('b1',{span:8});
  fireEvent.click(screen.getByRole('button',{name:'Subtítulo'}));
  expect(p.onAddBlock).toHaveBeenCalledWith('subtitle',12);
 });
 it('aplica gravura do acervo e restaura uma revisão anterior',()=>{
  const p=fixture();
  p.current={
   id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'classico',font_style:'classico',
   state:'draft',pdf_path:null,version:4,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,blocks:[],
  };
  p.history=[p.current];
  p.revisions=[{id:9,newspaper_id:p.current.id,previous_version:3,changed_at:'2026-11-11T12:00:00Z',
   snapshot:{title:'Antigo',blocks:[]}}];
  p.editing=true;
  const original={id:'o3',name:'Mercado de Suzail',image_path:null,public_src:'/newspaper/gravuras/mercado_suzail.jpg',
   in_collection:true,created_at:''};
  p.engravings=[original];
  render(<QueryClientProvider client={new QueryClient()}><NewspaperEditorialDesk {...p}/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Usar gravura: Mercado de Suzail'}));
  expect(p.onUseStoredEngraving).toHaveBeenCalledWith(original);
  fireEvent.click(screen.getByRole('button',{name:'Arquivo'}));
  fireEvent.click(screen.getByRole('button',{name:'Restaurar'}));
  expect(p.onRestoreRevision).toHaveBeenCalledWith(p.revisions[0]);
 });
 it('Matérias oferece os 6 modelos, usa um e duplica com novo nome',async()=>{
  const p=fixture();
  p.storyModels=[{id:'m1',name:'Meu modelo',description:'',builtin:false,blocks:[]}];
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  expect(screen.getByText('Escolha o modelo que você quer utilizar.')).toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:'Usar este modelo'})).toHaveLength(7);
  fireEvent.click(screen.getAllByRole('button',{name:'Usar este modelo'})[0]!);
  expect(p.onUseStoryModel).toHaveBeenCalledWith(expect.objectContaining({id:'builtin-corte'}));
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  fireEvent.click(screen.getByRole('button',{name:'Duplicar Entrevista'}));
  const name=screen.getByLabelText('Nome do modelo') as HTMLInputElement;
  expect(name.value).toBe('Cópia de Entrevista');
  fireEvent.change(name,{target:{value:'Entrevista da Corte'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar modelo'}));
  await Promise.resolve();
  expect(p.onSaveStoryModel).toHaveBeenCalledWith(expect.objectContaining({name:'Entrevista da Corte'}));
 });
 it('o Arquivo tem lixeira por edição e o selo do aviso é uma fileira de botões',()=>{
  const p=fixture();
  const e={
   id:'00000000-0000-4000-8000-000000000002',edition_no:2,campaign_date:'1522-01-01',
   title:'A Folha Sem Selo',subtitle:'',template:'classico' as const,font_style:'classico' as const,
   state:'cancelled' as const,pdf_path:null,version:1,publication_revision:0,created_by:'l',
   updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
   blocks:[{id:'n1',type:'notice' as const,text:'Notas\n\nTexto',icon:'⚜',span:6,height:150}],
  };
  p.history=[e];p.current={...e,state:'draft'};p.editing=true;p.selectedBlockId='n1';
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Selo ⚠'}));
  expect(p.onPatchBlock).toHaveBeenCalledWith('n1',{icon:'⚠'});
  fireEvent.click(screen.getByRole('button',{name:'Arquivo'}));
  fireEvent.click(screen.getByRole('button',{name:'Excluir edição nº 2'}));
  expect(p.onDeleteEdition).toHaveBeenCalledWith(e);
 });
 it('o topo diz só Jornal e Gravuras do Reino controla o acervo pela bolinha',()=>{
  const p=fixture();
  const item={id:'g1',name:'Torre de Suzail',image_path:'a.png',public_src:null,in_collection:true,created_at:''};
  const off={id:'g2',name:'Praça velha',image_path:'b.png',public_src:null,in_collection:false,created_at:''};
  p.engravings=[item,off];
  render(<QueryClientProvider client={new QueryClient()}><NewspaperEditorialDesk {...p}/></QueryClientProvider>);
  expect(screen.queryByText(/SEGUNDA TEMPORADA/)).toBeNull();
  expect(screen.getAllByText(/JORNAL/).length).toBeGreaterThan(0);
  expect(screen.getByRole('button',{name:'Usar gravura: Torre de Suzail'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Usar gravura: Praça velha'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  fireEvent.click(screen.getByRole('button',{name:/Gravuras do Reino/}));
  fireEvent.click(screen.getByRole('switch',{name:'Praça velha: aparece no acervo'}));
  expect(p.onToggleEngraving).toHaveBeenCalledWith(off,true);
  fireEvent.click(screen.getByRole('button',{name:'Excluir gravura Torre de Suzail'}));
  expect(p.onDeleteEngraving).toHaveBeenCalledWith(item);
 });
 it('clicar num modelo de matéria mostra a prévia ao lado',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  fireEvent.click(screen.getByRole('button',{name:'Entrevista'}));
  expect(screen.getByLabelText(/Prévia do modelo Entrevista/)).toBeTruthy();
 });
 it('as Configurações funcionam sem edição aberta e mudam a fonte do título do site',async()=>{
  const p=fixture();
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Configurações'}));
  expect(screen.queryByText(/Crie uma edição antes/)).toBeNull();
  const title=screen.getByRole('heading',{level:1,name:'A Folha Sem Selo'});
  expect(title.closest('header')?.className).toContain('folha-font-classico');
  fireEvent.change(screen.getByLabelText('Fonte'),{target:{value:'condensado'}});
  expect(title.closest('header')?.className).toContain('folha-font-condensado');
  expect(screen.getByText('Alterações ainda não salvas.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Salvar configurações/}));
  expect(p.onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({font_style:'condensado',title:'A Folha Sem Selo'}));
 });
 it('o status não se contradiz: sem conteúdo avisa o que falta',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  expect(screen.getByText('Falta conteúdo para publicar')).toBeInTheDocument();
  expect(screen.queryByText('Pronta para publicação')).toBeNull();
 });
});

function draftEdition(blocks:NewspaperEditorialProps['history'][number]['blocks'],extra:Partial<NewspaperEditorialProps['history'][number]>={}){
 return {
  id:'00000000-0000-4000-8000-000000000001',edition_no:3,campaign_date:'1522-01-01',
  title:'A Folha Sem Selo',subtitle:'',template:'classico' as const,font_style:'classico' as const,
  state:'draft' as const,pdf_path:null,version:4,publication_revision:0,created_by:'l',
  updated_at:'',published_at:null,archived_at:null,cancelled_at:null,blocks,...extra,
 };
}
function editingFixture(){
 const p=fixture();
 p.current=draftEdition([{id:'b1',type:'article',text:'Título\n\nUma frase com sete palavras aqui hoje',span:6,height:190}]);
 p.history=[p.current];p.editing=true;p.selectedBlockId='b1';
 return p;
}

describe('Melhorias do Jornal (12/11/2026)',()=>{
 it('o acervo da folha mostra só o que está no banco e permite restaurar as originais',()=>{
  const p=fixture();
  render(<QueryClientProvider client={new QueryClient()}><NewspaperEditorialDesk {...p}/></QueryClientProvider>);
  expect(screen.queryByRole('button',{name:'Usar gravura: Castelo de Cormyr'})).toBeNull();
  expect(screen.getByText(/Acervo vazio/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  fireEvent.click(screen.getByRole('button',{name:/Gravuras do Reino/}));
  fireEvent.click(screen.getByRole('button',{name:'Restaurar gravuras originais do Reino'}));
  expect(p.onRestoreEngravings).toHaveBeenCalled();
 });
 it('gravuras originais aparecem no gerenciador e podem ser excluídas',()=>{
  const p=fixture();
  const original={id:'o1',name:'Castelo de Cormyr',image_path:null,public_src:'/newspaper/gravuras/castelo_cormyr.jpg',
   in_collection:true,created_at:''};
  p.engravings=[original];
  render(<QueryClientProvider client={new QueryClient()}><NewspaperEditorialDesk {...p}/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Matérias'}));
  fireEvent.click(screen.getByRole('button',{name:/Gravuras do Reino/}));
  expect(screen.getByText(/original do Reino/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Excluir gravura Castelo de Cormyr'}));
  expect(p.onDeleteEngraving).toHaveBeenCalledWith(original);
 });
 it('barra de ferramentas: desfazer, refazer, copiar, recortar e colar',()=>{
  const p=editingFixture();p.canUndo=true;p.canRedo=true;p.canPasteBlock=true;
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  fireEvent.click(screen.getByRole('button',{name:/Desfazer/}));
  fireEvent.click(screen.getByRole('button',{name:/Refazer/}));
  fireEvent.click(screen.getByRole('button',{name:/Copiar/}));
  fireEvent.click(screen.getByRole('button',{name:/Recortar/}));
  fireEvent.click(screen.getByRole('button',{name:/Colar/}));
  expect(p.onUndo).toHaveBeenCalled();expect(p.onRedo).toHaveBeenCalled();
  expect(p.onCopyBlock).toHaveBeenCalledWith('b1');expect(p.onCutBlock).toHaveBeenCalledWith('b1');
  expect(p.onPasteBlock).toHaveBeenCalledWith('',[]);
 });
 it('atalhos de teclado valem para o bloco, mas não dentro de um texto',()=>{
  const p=editingFixture();
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  fireEvent.keyDown(document.body,{key:'z',ctrlKey:true});
  fireEvent.keyDown(document.body,{key:'z',ctrlKey:true,shiftKey:true});
  fireEvent.keyDown(document.body,{key:'y',ctrlKey:true});
  fireEvent.keyDown(document.body,{key:'d',ctrlKey:true});
  fireEvent.keyDown(document.body,{key:'Delete'});
  expect(p.onUndo).toHaveBeenCalledTimes(1);
  expect(p.onRedo).toHaveBeenCalledTimes(2);
  expect(p.onDuplicateBlock).toHaveBeenCalledWith('b1');
  expect(p.onRemoveBlock).toHaveBeenCalledWith('b1');
  // Dentro de um campo de texto o navegador cuida do próprio Ctrl+Z.
  const area=screen.getAllByRole('textbox')[0]!;
  fireEvent.keyDown(area,{key:'z',ctrlKey:true});
  expect(p.onUndo).toHaveBeenCalledTimes(1);
 });
 it('Ctrl+C, Ctrl+X e Ctrl+V trabalham com blocos',()=>{
  const p=editingFixture();
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  const setData=vi.fn();
  fireEvent.copy(document.body,{clipboardData:{setData}});
  expect(p.onCopyBlock).toHaveBeenCalledWith('b1');
  expect(setData).toHaveBeenCalledWith('text/plain','texto');
  fireEvent.cut(document.body,{clipboardData:{setData}});
  expect(p.onCutBlock).toHaveBeenCalledWith('b1');
  fireEvent.paste(document.body,{clipboardData:{files:[],getData:()=>'CORMYR-FOLHA-BLOCOS:v1\n[]'}});
  expect(p.onPasteBlock).toHaveBeenCalledWith('CORMYR-FOLHA-BLOCOS:v1\n[]',[]);
 });
 it('mostra palavras da edição e agenda ou cancela a publicação',()=>{
  const p=editingFixture();
  p.current=draftEdition(p.current!.blocks,{publish_on:'1522-02-05'});
  p.history=[p.current];
  render(<NewspaperEditorialDesk {...p}/>);
  expect(screen.getAllByText(/\d+ palavras/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Será publicada sozinha em/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Cancelar agendamento'}));
  expect(p.onPatch).toHaveBeenCalledWith({publish_on:null});
 });
 it('troca para a edição anterior e a seguinte com as setas',()=>{
  const p=editingFixture();
  const older=draftEdition([],{id:'00000000-0000-4000-8000-000000000002',edition_no:2});
  const newer=draftEdition([],{id:'00000000-0000-4000-8000-000000000003',edition_no:4});
  p.history=[newer,p.current!,older];
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ver edição anterior'}));
  expect(p.onOpen).toHaveBeenCalledWith(older);
  fireEvent.click(screen.getByRole('button',{name:'Ver edição seguinte'}));
  expect(p.onOpen).toHaveBeenCalledWith(newer);
 });
});

describe('Relatório de revisão: bloco fixo, capitular e auditoria',()=>{
 it('fixar um bloco trava mover, remover e largura; a letra capitular liga por matéria',()=>{
  const p=editingFixture();
  p.current=draftEdition([{id:'b1',type:'article',text:'Título\n\nCorpo do texto',span:6,height:190,pinned:true}]);
  p.history=[p.current];
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever o Jornal'}));
  expect((screen.getByRole('button',{name:'Remover bloco'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Mover bloco para cima'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'2/3'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox',{name:/Fixar bloco/}));
  expect(p.onPatchBlock).toHaveBeenCalledWith('b1',{pinned:false});
  fireEvent.click(screen.getByRole('checkbox',{name:/Letra capitular/}));
  expect(p.onPatchBlock).toHaveBeenCalledWith('b1',{dropCap:true});
 });
 it('a auditoria mostra pedido pago e texto publicado lado a lado',()=>{
  const p=fixture();
  const edition=draftEdition([{id:'a',type:'article',text:'Festa na corte\n\nTexto suavizado pelo editor',span:6,height:190,
   commissionId:'11111111-1111-4111-8111-111111111111'}],{state:'published' as const});
  p.history=[edition];p.houseNames=new Map([['h1','Casa Crownsilver']]);
  p.commissions=[{id:'11111111-1111-4111-8111-111111111111',house_id:'h1',requested_by:'u',title:'Festa na corte',
   body:'Texto original e agressivo',image_path:null,cost_wealth:1,state:'published',request_key:'k',
   newspaper_id:edition.id,created_at:'2026-11-01T10:00:00Z',published_at:'2026-11-02T10:00:00Z',
   rejection_note:null,rejected_at:null,seen_at:null}];
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Arquivo'}));
  expect(screen.getByText('Editado pelo Editor-Chefe')).toBeTruthy();
  expect(screen.getByText('Texto original e agressivo')).toBeTruthy();
  expect(screen.getByText(/Texto suavizado pelo editor/)).toBeTruthy();
  expect(screen.getByText(/1 de Riqueza/)).toBeTruthy();
 });
});
