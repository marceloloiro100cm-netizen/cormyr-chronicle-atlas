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
  onMoveBlock:vi.fn(),onResizeBlock:vi.fn(),onUpload:vi.fn(),
  onCancel:vi.fn(),onOtherModules:vi.fn(),onSignout:vi.fn(),
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
 it('abre a redação de matérias com um clique e permite voltar aos outros módulos',()=>{
  const props=fixture();render(<NewspaperEditorialDesk {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Escrever Matéria'}));
  expect(props.onNew).toHaveBeenCalledWith('article');
  fireEvent.click(screen.getByRole('button',{name:'Configurações'}));
  fireEvent.click(screen.getByRole('button',{name:'Abrir outros módulos de Cormyr'}));
  expect(props.onOtherModules).toHaveBeenCalledOnce();
 });
 it('mostra Pautas e Correspondentes sem prometer dados não implementados',()=>{
  render(<NewspaperEditorialDesk {...fixture()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Pautas'}));
  expect(screen.getByText('Nenhum rascunho registrado.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Correspondentes'}));
  expect(screen.getByText(/respectivo módulo for desenvolvido/)).toBeInTheDocument();
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
