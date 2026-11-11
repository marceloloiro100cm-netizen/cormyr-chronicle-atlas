import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {NewspaperEditorialDesk,type NewspaperEditorialProps} from './NewspaperEditorialDesk';

vi.mock('@/components/change-password',()=>({
 ChangePasswordButton:()=> <button type="button">Alterar senha</button>,
}));
vi.mock('./NewspaperCanvas',()=>({
 NewspaperCanvas:()=> <div data-testid="newspaper-canvas">Página da edição</div>,
}));

function fixture():NewspaperEditorialProps{
 return {
  userId:'leonardo',current:null,history:[],reads:[],loading:false,
  editing:false,busy:false,selectedBlockId:null,error:'',message:'',
  hubDate:'1522-01-01',
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
});
