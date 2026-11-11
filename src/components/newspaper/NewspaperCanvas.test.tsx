import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NewspaperCanvas} from './NewspaperCanvas';
import type {NewspaperEdition} from '@/lib/newspaper/model';

vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:'https://example.org/photo.png',isError:false})}));
vi.mock('@/lib/newspaper/data',()=>({signedNewspaperAsset:vi.fn()}));
afterEach(cleanup);

const edition:NewspaperEdition={
 id:'00000000-0000-4000-8000-000000000001',edition_no:1,
 campaign_date:'1522-01-01',title:'A Folha Sem Selo',subtitle:'Crônicas do Reino',
 template:'classico',font_style:'classico',state:'draft',pdf_path:null,
 version:1,publication_revision:0,created_by:'editor',
 updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
 blocks:[
  {id:'head',type:'headline',text:'Manchete inicial',subtitle:'Uma notícia importante',span:12,height:130},
  {id:'text',type:'article',text:'Crônica\n\nO relato do reino',span:6,height:190},
  {id:'image',type:'image',text:'',imagePath:'id/photo.jpg',caption:'Castelo de Cormyr',
   imageStyle:'woodcut',span:6,height:250},
 ],
};

describe('Jornal: editor visual integrado ao banco',()=>{
 it('edita manchetes diretamente na folha, sem HTML arbitrário',()=>{
  const update=vi.fn();
  render(<NewspaperCanvas edition={edition} editing onChangeBlock={update}/>);
  const heading=screen.getByRole('heading',{level:2,name:'Editar manchete'});
  Object.defineProperty(heading,'innerText',{configurable:true,value:'Nova manchete',writable:true});
  fireEvent.blur(heading);
  expect(update).toHaveBeenCalledWith('head',{text:'Nova manchete'});
  expect(screen.getByText('Uma notícia importante')).toBeInTheDocument();
  expect(screen.getByRole('heading',{level:1,name:'A Folha Sem Selo'})).toBeInTheDocument();
 });
 it('permite reposicionar blocos com a alça sem alterar o texto',()=>{
  const move=vi.fn();
  const newBlock=vi.fn();
  render(<NewspaperCanvas edition={edition} editing onReorderBlock={move} onInsertBlock={newBlock}/>);
  const target=screen.getByRole('group',{name:'Editar bloco headline'});
  const dataTransfer={getData:(type:string)=>type==='application/x-cormyr-newspaper-block'?'text':''};
  fireEvent.drop(target,{dataTransfer});
  expect(move).toHaveBeenCalledWith('text','head');
  const newDataTransfer={getData:(type:string)=>type==='application/x-cormyr-newspaper-tool'?'notice':''};
  fireEvent.drop(target,{dataTransfer:newDataTransfer});
  expect(newBlock).toHaveBeenCalledWith('notice','head');
 });
 it('oferece filtros e ampliação de gravura a quem lê, sem ferramentas editoriais',()=>{
  render(<NewspaperCanvas edition={edition} editing={false}/>);
  expect(screen.queryByRole('button',{name:/arrastar para mudar ordem/i})).not.toBeInTheDocument();
  const img=screen.getByRole('img',{name:'Castelo de Cormyr'});
  expect(img).toHaveClass('newspaper-filter-woodcut');
  fireEvent.click(screen.getByRole('button',{name:'Ampliar fotografia'}));
  expect(screen.getByRole('dialog',{name:'Ampliação da gravura'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'+ Ampliar'}));
  expect(screen.getByText('125%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Fechar ✕'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
});
