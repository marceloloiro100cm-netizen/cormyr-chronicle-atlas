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
 it('altura fixa usa o recorte livre (foco e ampliação); altura automática mostra a imagem inteira',()=>{
  const crop:NewspaperEdition={...edition,blocks:edition.blocks.map(b=>b.type==='image'?
   {...b,autoHeight:false,focusX:20,focusY:80,cropZoom:1.5}:b)};
  const {unmount}=render(<NewspaperCanvas edition={crop} editing={false}/>);
  const img=screen.getByRole('img',{name:'Castelo de Cormyr'});
  expect(img).toHaveClass('newspaper-img-fixed');
  expect((img as HTMLElement).style.objectPosition).toBe('20% 80%');
  expect((img as HTMLElement).style.transform).toBe('scale(1.5)');
  unmount();
  render(<NewspaperCanvas edition={edition} editing={false}/>);
  expect(screen.getByRole('img',{name:'Castelo de Cormyr'})).toHaveClass('newspaper-img-auto');
 });
 it('mostra o tempo de leitura a quem lê, mas não durante a edição',()=>{
  const {unmount}=render(<NewspaperCanvas edition={edition} compactMasthead/>);
  expect(screen.getByText(/Leitura: cerca de 1 min/)).toBeInTheDocument();
  unmount();
  render(<NewspaperCanvas edition={edition} compactMasthead editing/>);
  expect(screen.queryByText(/Leitura: cerca de/)).toBeNull();
 });
 it('bloco fixo mostra o cadeado e perde alça, setas e redimensionamento; o texto segue editável',()=>{
  const fixed:NewspaperEdition={...edition,blocks:edition.blocks.map(b=>b.id==='text'?{...b,pinned:true}:b)};
  render(<NewspaperCanvas edition={fixed} editing onChangeBlock={vi.fn()} onMoveBlock={vi.fn()} onResize={vi.fn()}/>);
  const block=screen.getByRole('group',{name:'Editar bloco article'});
  expect(block).toHaveClass('newspaper-story-pinned');
  expect(screen.getByRole('button',{name:'Destravar bloco fixo'})).toBeInTheDocument();
  expect(block.querySelector('.newspaper-resize-handle')).toBeNull();
  expect(block.querySelector('.newspaper-edge-handle')).toBeNull();
  expect(block.querySelector('.newspaper-drag-handle')).toBeNull();
  expect(block.querySelector('.newspaper-move-buttons')).toBeNull();
  expect(screen.getByRole('heading',{level:3,name:'Editar título da reportagem'})).toHaveAttribute('contenteditable','true');
 });
 it('o cadeado alterna a fixação e a lateral redimensiona só a largura, a partir dos blocos do início do arraste',()=>{
  const change=vi.fn(),resize=vi.fn();
  render(<NewspaperCanvas edition={edition} editing onChangeBlock={change} onResize={resize}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'Fixar bloco'})[1]!);
  expect(change).toHaveBeenCalledWith('text',{pinned:true});
  expect(screen.getAllByRole('button',{name:'Arrastar a lateral para mudar a largura do bloco'}).length).toBe(3);
 });
 it('letra capitular só marca o primeiro parágrafo da matéria que a pediu',()=>{
  const cap:NewspaperEdition={...edition,blocks:edition.blocks.map(b=>b.id==='text'?{...b,dropCap:true}:b)};
  const {container}=render(<NewspaperCanvas edition={cap}/>);
  expect(container.querySelectorAll('.newspaper-dropcap')).toHaveLength(1);
 });
});
