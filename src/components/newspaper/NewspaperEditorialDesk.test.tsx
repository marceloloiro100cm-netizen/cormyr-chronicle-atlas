import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {NewspaperEditorialDesk,type NewspaperEditorialProps} from './NewspaperEditorialDesk';

vi.mock('@/components/change-password',()=>({
 ChangePasswordButton:()=> <button type="button">Alterar senha</button>,
}));
vi.mock('@/lib/newspaper/data',()=>({
 signedCommissionImage:vi.fn(async()=>'blob:imagem-da-casa'),
 signedNewspaperAsset:vi.fn(async()=>'blob:imagem'),
}));
vi.mock('./NewspaperCanvas',()=>({
 NewspaperCanvas:()=> <div data-testid="newspaper-canvas">Página da edição</div>,
}));

function fixture():NewspaperEditorialProps{
 return {
  userId:'leonardo',current:null,history:[],reads:[],loading:false,
  editing:false,busy:false,selectedBlockId:null,error:'',message:'',
  hubDate:'1522-01-01',
  pendingCommissions:[],houseNames:new Map(),
  onInsertCommission:vi.fn(),onShowCommission:vi.fn(),onRejectCommission:vi.fn(),
  revisions:[],onRestoreRevision:vi.fn(),onUseEngraving:vi.fn(),
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
  for(const title of ['Painel do Jornal','Edição da Capa','Matérias','Pautas',
   'Correspondentes','Anúncios','Arquivo','Leitura e Alcance','Configurações']){
   expect(screen.getByRole('button',{name:title})).toBeInTheDocument();
  }
  expect(screen.getAllByRole('button',{name:'Publicar Edição'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
  expect(screen.getByText(/PRÉ-VISUALIZAÇÃO ILUSTRATIVA/)).toBeInTheDocument();
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
 it('mostra Pautas e Correspondentes sem dados inventados',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Pautas'}));
  expect(screen.getByText('Nenhum rascunho registrado.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Correspondentes'}));
  expect(screen.getByText(/Nenhum correspondente ainda/)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button',{name:'Edição da Capa'}));
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
  expect(screen.getByText(/Casa Crownsilver/)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button',{name:'Edição da Capa'}));
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
  render(<NewspaperEditorialDesk {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Usar gravura: Mercado de Suzail'}));
  expect(p.onUseEngraving).toHaveBeenCalledWith('/newspaper/gravuras/mercado_suzail.jpg','Mercado de Suzail');
  fireEvent.click(screen.getByRole('button',{name:'Arquivo'}));
  fireEvent.click(screen.getByRole('button',{name:'Restaurar'}));
  expect(p.onRestoreRevision).toHaveBeenCalledWith(p.revisions[0]);
 });
});
