import {useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {formatDate} from '@/lib/calendar/harptos';
import {signedNewspaperAsset} from '@/lib/newspaper/data';
import {newspaperResize,type NewspaperBlock,type NewspaperEdition} from '@/lib/newspaper/model';

function NewspaperImage({path,caption,height}:{path:string;caption:string;height:number}){
 const asset=useQuery({queryKey:['newspaper-asset',path],queryFn:()=>signedNewspaperAsset(path),
  staleTime:45*60*1000,retry:false});
 return <figure className="newspaper-photo">
  {asset.data?<img src={asset.data} alt={caption||'Fotografia da edição'} style={{height:Math.max(130,height-44)}}/>:
   <div className="newspaper-photo-placeholder">{asset.isError?'Imagem indisponível':'Carregando fotografia…'}</div>}
  {caption&&<figcaption>{caption}</figcaption>}
 </figure>;
}
function NewspaperPdf({path}:{path:string}){
 const asset=useQuery({queryKey:['newspaper-asset',path],queryFn:()=>signedNewspaperAsset(path),
  staleTime:45*60*1000,retry:false});
 return <section className="newspaper-pdf" aria-label="Edição em PDF">
   <div className="newspaper-pdf-tools"><strong>Fac-símile da edição original</strong>
    {asset.data&&<a href={asset.data} target="_blank" rel="noopener noreferrer">Abrir PDF em tela cheia</a>}
   </div>
   {asset.data?<iframe title="Jornal em PDF" src={asset.data+'#view=FitH&toolbar=1'}
      loading="lazy" referrerPolicy="no-referrer"/>:
    <p role="status">{asset.isError?'Não foi possível abrir o PDF.':'Preparando visualização…'}</p>}
   <p className="newspaper-pdf-mobile-hint">No celular, utilize “Abrir PDF em tela cheia” para ampliar o texto.</p>
  </section>;
}
function NewspaperStory({block}:{block:NewspaperBlock}){
 const [heading,...body]=block.text.split('\n');
 if(block.type==='headline')return <h2 className="newspaper-headline">{block.text}</h2>;
 if(block.type==='quote')return <blockquote className="newspaper-quote">{block.text}</blockquote>;
 if(block.type==='image')return block.imagePath?
  <NewspaperImage path={block.imagePath} caption={block.caption??''} height={block.height}/>:
  <div className="newspaper-photo-placeholder">Adicione uma fotografia</div>;
 return <div className="newspaper-article">
   <h3>{heading||'Título da notícia'}</h3>
   <p>{body.join('\n').trim()||'Escreva o conteúdo da reportagem…'}</p>
  </div>;
}
export function NewspaperCanvas({edition,editing=false,compactMasthead=false,selectedId,onSelect,onResize}:{
 edition:NewspaperEdition;editing?:boolean;compactMasthead?:boolean;selectedId?:string|null;
 onSelect?:(id:string)=>void;
 onResize?:(id:string,dimensions:Pick<NewspaperBlock,'span'|'height'>)=>void;
}){
 const grid=useRef<HTMLDivElement|null>(null);
 const drag=useRef<{id:string;startX:number;startY:number;block:NewspaperBlock;column:number}|null>(null);
 const startResize=(event:React.PointerEvent<HTMLButtonElement>,block:NewspaperBlock)=>{
  if(!editing||!onResize)return;
  event.preventDefault();event.stopPropagation();
  const width=grid.current?.getBoundingClientRect().width??720;
  drag.current={id:block.id,startX:event.clientX,startY:event.clientY,block,column:width/12};
  event.currentTarget.setPointerCapture(event.pointerId);
 };
 const moveResize=(event:React.PointerEvent<HTMLButtonElement>)=>{
  const d=drag.current;
  if(!d||!onResize)return;
  onResize(d.id,newspaperResize(d.block,event.clientX-d.startX,event.clientY-d.startY,d.column));
 };
 return <div className={`newspaper-page newspaper-font-${edition.font_style} newspaper-template-${edition.template}`}>
  <header className="newspaper-masthead">
   <div className="newspaper-rule"/>
   {compactMasthead?<div className="newspaper-page-folio">
    <span>ANO II · EDIÇÃO Nº {String(edition.edition_no).padStart(3,'0')}</span>
    <span>A VOZ LIVRE DE CORMYR</span>
    <span>{formatDate(edition.campaign_date)}</span>
   </div>:<>
    <p>O CORREIO DO REINO · CORMYR · EDIÇÃO {String(edition.edition_no).padStart(3,'0')}</p>
    <h1>{edition.title}</h1>
    <div className="newspaper-meta"><span>{formatDate(edition.campaign_date)}</span><span>Folha independente de Cormyr</span></div>
    {edition.subtitle&&<h2 className="newspaper-subtitle">{edition.subtitle}</h2>}
   </>}
   <div className="newspaper-double-rule"/>
  </header>
  {edition.blocks.length>0&&<div ref={grid} className="newspaper-grid">
   {edition.blocks.map(block=><div key={block.id}
     className={`newspaper-story newspaper-story-${block.type}${editing?' newspaper-story-editable':''}${selectedId===block.id?' newspaper-story-selected':''}`}
     style={{gridColumn:`span ${block.span}`}}
     onClick={()=>editing&&onSelect?.(block.id)}
     onKeyDown={e=>{if(editing&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect?.(block.id);}}}
     role={editing?'button':undefined} tabIndex={editing?0:undefined}
     aria-label={editing?`Selecionar bloco ${block.type}`:undefined}>
      <NewspaperStory block={block}/>
      {editing&&<button type="button" className="newspaper-resize-handle"
        aria-label="Arrastar para aumentar ou diminuir o bloco"
        title="Arraste para mudar largura e altura"
        onPointerDown={e=>startResize(e,block)}
        onPointerMove={moveResize}
        onPointerUp={()=>{drag.current=null;}}
        onPointerCancel={()=>{drag.current=null;}}>
        ↘
      </button>}
    </div>)}
  </div>}
  {edition.pdf_path&&<NewspaperPdf path={edition.pdf_path}/>}
  <footer className="newspaper-colophon">CRÔNICAS DE CORMYR · A VERDADE EM CADA EDIÇÃO</footer>
 </div>;
}
