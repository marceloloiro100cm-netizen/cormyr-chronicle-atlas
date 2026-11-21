import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FirebaseNewspaperReader,safePublishedBlocks} from './FirebaseNewspaperReader';

afterEach(cleanup);

const edition={
  id:'edition-1',title:'A Folha Sem Selo',subtitle:'Crônicas do reino',
  editionNo:4,campaignDate:'1522-01-05',
  blocks:[
    {id:'one',type:'headline',text:'A Nova Gazeta',subtitle:'Notícias de Cormyr'},
    {id:'two',type:'article',text:'A Corte\n\nA primavera chegou.',byline:'Redação'},
    {id:'three',type:'image',imageSrc:'/newspaper/gravuras/cormyr.jpg',
      caption:'Castelo em Cormyr'},
    {id:'four',type:'notice',text:'AVISO\n\nA imprensa é livre.'},
  ],
};

describe('Firebase Cloud — jornal publicado para leitura',()=>{
  it('apresenta a edição como jornal, sem o JSON dos blocos nem controles editoriais',()=>{
    const {container}=render(<FirebaseNewspaperReader edition={edition}/>);
    expect(screen.getByRole('heading',{name:'A Folha Sem Selo'}))
      .toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'A Nova Gazeta'}))
      .toBeInTheDocument();
    expect(screen.getByText('A primavera chegou.')).toBeInTheDocument();
    expect(screen.getAllByText('Crônicas do reino').length).toBeGreaterThan(0);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelector('.newspaper-drag-handle')).toBeNull();
  });

  it('escapa textos de edição, ignorando HTML e scripts arbitrários',()=>{
    const unsafe={...edition,blocks:[
      {id:'story',type:'article',text:'Título\n\n<img src=x onerror=alert(1)>'},
      {id:'head',type:'headline',text:'<script>private()</script>'},
    ]};
    const {container}=render(<FirebaseNewspaperReader edition={unsafe}/>);
    expect(screen.getByText('<script>private()</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('aceita somente imagens públicas de origem local, nunca URLs externas nem travessia',()=>{
    const blocks=safePublishedBlocks([
      {type:'image',imageSrc:'/newspaper/gravuras/mapa.png'},
      {type:'image',imageSrc:'https://unauthorized.example.com/x.png'},
      {type:'image',imageSrc:'/newspaper/../private.png'},
      {type:'image',imageSrc:'javascript:alert(1)'},
      {type:'image',imageSrc:'/cormyr/images/crest.webp'},
    ]);
    expect(blocks.map(b=>b.imageSrc)).toEqual([
      '/newspaper/gravuras/mapa.png',null,null,null,
      '/cormyr/images/crest.webp',
    ]);
  });

  it('mantém a imagem importada vinculada à edição, sem expor o caminho privado',()=>{
    const blocks=safePublishedBlocks([{
      type:'image',imagePath:'writer/legacy/foto.png',caption:'Original da edição',
    }], 'edition-1');
    expect(blocks[0]?.imageSrc).toBe('/api/public/newspaper-image?edition=edition-1&index=0');
    expect(JSON.stringify(blocks)).not.toContain('writer/legacy');
    const {container}=render(<FirebaseNewspaperReader edition={{
      ...edition,id:'edition-1',blocks:[{
        type:'image',imagePath:'writer/legacy/foto.png',caption:'Original da edição',
      }],
    }}/>);
    expect(container.querySelector('img')?.getAttribute('src'))
      .toBe('/api/public/newspaper-image?edition=edition-1&index=0');
  });

  it('não lê caminhos privados da Storage nem depende da API antiga',()=>{
    const {container}=render(<FirebaseNewspaperReader edition={{
      ...edition,blocks:[{type:'image',imagePath:'bucket/private/picture.jpg',
        caption:'A gravura migrada'}],
    }}/>);
    const img=container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(
      '/api/public/newspaper-image?edition=edition-1&index=0'
    );
    expect(img?.getAttribute('src')).not.toContain('bucket/private');
    fireEvent.error(img!);
    expect(screen.getByText(/Gravura original ainda não disponível/))
      .toBeInTheDocument();
    expect(screen.getByText('A gravura migrada')).toBeInTheDocument();
  });

  it('ignora blocos inválidos, limita a quantidade, mas não corta texto histórico',()=>{
    const huge=[...Array.from({length:83},(_,i)=>({
      id:String(i),type:'article',text:'A'.repeat(20000),
    })),null,4,{},[]];
    const normalized=safePublishedBlocks(huge);
    expect(normalized).toHaveLength(80);
    expect(normalized.every(b=>b.text.length===20000)).toBe(true);
    expect(safePublishedBlocks({blocks:[]})).toEqual([]);
  });
});
