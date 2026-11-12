import {useEffect,useRef,useState,type CSSProperties,type DragEvent,type KeyboardEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {formatDate} from '@/lib/calendar/harptos';
import {signedNewspaperAsset} from '@/lib/newspaper/data';
import {newspaperResize,type NewspaperBlock,type NewspaperBlockType,type NewspaperEdition,type NewspaperImageStyle} from '@/lib/newspaper/model';

const BLOCK_DRAG_MIME='application/x-cormyr-newspaper-block';
const TOOL_DRAG_MIME='application/x-cormyr-newspaper-tool';

function InlineText({tag:Tag,value,editing,onChange,className,style,label}:{
 tag:'h1'|'h2'|'h3'|'p'|'blockquote'|'figcaption';
 value:string;editing:boolean;onChange:(next:string)=>void;
 className?:string;style?:CSSProperties;label:string;
}){
 return <Tag className={className} style={style}
  contentEditable={editing} suppressContentEditableWarning
  spellCheck={editing} aria-label={editing?label:undefined}
  data-newspaper-inline={editing?'true':undefined}
  onKeyDown={(event:KeyboardEvent<HTMLElement>)=>event.stopPropagation()}
  onBlur={event=>{
   if(!editing)return;
   const text=(event.currentTarget.innerText??event.currentTarget.textContent??'').replace(/\r/g,'').trim();
   if(text!==value)onChange(text);
  }}>{value}</Tag>;
}
function NewspaperImage({block,editing,onChange}:{
 block:NewspaperBlock;editing:boolean;onChange?:(patch:Partial<NewspaperBlock>)=>void;
}){
 const path=block.imagePath;
 const asset=useQuery({queryKey:['newspaper-asset',path],queryFn:()=>signedNewspaperAsset(path!),
  enabled:Boolean(path),staleTime:45*60*1000,retry:false});
 const src=path?asset.data:block.imageSrc;
 const [lightbox,setLightbox]=useState(false);
 const [zoom,setZoom]=useState(1);
 useEffect(()=>{
  if(!lightbox)return;
  const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')setLightbox(false);};
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[lightbox]);
 const style:NewspaperImageStyle=block.imageStyle??'vintage';
 return <figure className="newspaper-photo">
  {src?<button className="newspaper-image-open" type="button"
   onClick={event=>{event.stopPropagation();setZoom(1);setLightbox(true);}}
   title="Ampliar fotografia" aria-label="Ampliar fotografia">
    <img className={`newspaper-filter-${style}`} src={src}
     alt={block.caption||'Fotografia da edição'}
     style={block.autoHeight!==false?{maxHeight:650,height:'auto'}:{height:Math.max(130,block.height-44)}}/>
   </button>:<div className="newspaper-photo-placeholder" role="status">
    {path&&asset.isError?'Imagem indisponível':path?'Carregando fotografia…':'Adicione uma fotografia na Redação'}
   </div>}
  <InlineText tag="figcaption" value={block.caption??''} editing={editing}
   label="Editar legenda da fotografia" onChange={caption=>onChange?.({caption})}/>
  {lightbox&&src&&<div className="newspaper-lightbox" role="presentation"
   onMouseDown={event=>{if(event.target===event.currentTarget)setLightbox(false);}}>
   <div className="newspaper-lightbox-dialog" role="dialog" aria-modal="true"
    aria-label="Ampliação da gravura">
    <div className="newspaper-lightbox-controls">
     <strong>Gravura da edição</strong>
     <button type="button" onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>− Reduzir</button>
     <output aria-label="Nível de zoom">{Math.round(zoom*100)}%</output>
     <button type="button" onClick={()=>setZoom(z=>Math.min(3,z+.25))}>+ Ampliar</button>
     <button type="button" onClick={()=>setZoom(1)}>1:1</button>
     <button type="button" onClick={()=>setLightbox(false)}>Fechar ✕</button>
    </div>
    <div className="newspaper-lightbox-stage">
     <img className={`newspaper-filter-${style}`} src={src}
      alt={block.caption||'Fotografia ampliada'} style={{transform:`scale(${zoom})`}}/>
    </div>
    {block.caption&&<p>{block.caption}</p>}
   </div>
  </div>}
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
function NewspaperStory({block,editing,onChange}:{
 block:NewspaperBlock;editing:boolean;onChange?:(patch:Partial<NewspaperBlock>)=>void;
}){
 const [heading,...body]=block.text.split('\n');
 const paragraph=body.join('\n').trim();
 if(block.type==='headline')return <div className="newspaper-headline-block">
  <InlineText tag="h2" className="newspaper-headline" value={block.text} editing={editing}
   style={{textAlign:block.align??'left'}} label="Editar manchete"
   onChange={text=>onChange?.({text})}/>
  {(block.subtitle!==undefined||editing)&&<InlineText tag="p" className="newspaper-deck"
   value={block.subtitle??''} editing={editing} label="Editar subtítulo da manchete"
   onChange={subtitle=>onChange?.({subtitle})}/>}
 </div>;
 if(block.type==='subtitle')return <InlineText tag="h3" className="newspaper-subhead" value={block.text}
  editing={editing} label="Editar subtítulo" onChange={text=>onChange?.({text})}/>;
 if(block.type==='quote')return <InlineText tag="blockquote" className="newspaper-quote"
  value={block.text} editing={editing} label="Editar citação"
  onChange={text=>onChange?.({text})}/>;
 if(block.type==='image')return <NewspaperImage block={block} editing={editing} {...(onChange?{onChange}:{})}/>;
 if(block.type==='notice')return <aside className="newspaper-notice-block">
  <span className="newspaper-notice-seal" aria-hidden="true">{block.icon??'⚜'}</span>
  <div><InlineText tag="h3" value={heading??""} editing={editing} label="Editar título do aviso"
   onChange={next=>onChange?.({text:[next,paragraph].join('\n\n')})}/>
   <InlineText tag="p" value={paragraph} editing={editing} label="Editar texto do aviso"
    onChange={next=>onChange?.({text:[heading,next].join('\n\n')})}/></div>
 </aside>;
 return <article className="newspaper-article">
  <InlineText tag="h3" value={heading||'Título da notícia'} editing={editing}
   label="Editar título da reportagem"
   onChange={next=>onChange?.({text:[next,paragraph].join('\n\n')})}/>
  <InlineText tag="p" value={paragraph} editing={editing} label="Editar texto da reportagem"
   onChange={next=>onChange?.({text:[heading,next].join('\n\n')})}/>
  {block.byline&&<p className="newspaper-byline">Por {block.byline}</p>}
 </article>;
}
export function NewspaperCanvas({edition,editing=false,compactMasthead=false,selectedId,onSelect,onResize,
 onChangeBlock,onReorderBlock,onInsertBlock,onMoveBlock,onChangeEdition}:{
 edition:NewspaperEdition;editing?:boolean;compactMasthead?:boolean;selectedId?:string|null;
 onSelect?:(id:string)=>void;
 onResize?:(id:string,dimensions:Pick<NewspaperBlock,'span'|'height'>)=>void;
 onChangeBlock?:(id:string,patch:Partial<NewspaperBlock>)=>void;
 onReorderBlock?:(fromId:string,toId:string)=>void;
 onInsertBlock?:(type:NewspaperBlockType,beforeId:string|null)=>void;
 onMoveBlock?:(id:string,direction:-1|1)=>void;
 /** Edita o título e o lema direto no cabeçalho da folha. */
 onChangeEdition?:(patch:Partial<Pick<NewspaperEdition,'title'|'subtitle'>>)=>void;
}){
 const grid=useRef<HTMLDivElement|null>(null);
 const drag=useRef<{id:string;startX:number;startY:number;block:NewspaperBlock;column:number}|null>(null);
 const [dragOver,setDragOver]=useState<string|null>(null);
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
 const drop=(event:DragEvent<HTMLElement>,targetId:string|null)=>{
  if(!editing)return;
  event.preventDefault();event.stopPropagation();setDragOver(null);
  const moving=event.dataTransfer.getData(BLOCK_DRAG_MIME);
  if(moving&&targetId&&moving!==targetId){onReorderBlock?.(moving,targetId);return;}
  const type=event.dataTransfer.getData(TOOL_DRAG_MIME);
  if(['headline','subtitle','article','image','quote','notice'].includes(type)){
   onInsertBlock?.(type as NewspaperBlockType,targetId);
  }
 };
 return <div className={`newspaper-page newspaper-font-${edition.font_style} newspaper-template-${edition.template}`}>
  <header className="newspaper-masthead">
   <div className="newspaper-rule"/>
   {compactMasthead?<div className="newspaper-page-folio">
    <span>ANO II · EDIÇÃO Nº {String(edition.edition_no).padStart(3,'0')}</span>
    <span>A VOZ LIVRE DE CORMYR</span>
    <span>{formatDate(edition.campaign_date)}</span>
   </div>:<p>O CORREIO DO REINO · CORMYR · EDIÇÃO {String(edition.edition_no).padStart(3,'0')}</p>}
   <div className="newspaper-page-masthead">
    <img className="newspaper-lion" src="/newspaper/leao_esq.png" alt="" aria-hidden="true"/>
    <InlineText tag="h1" value={edition.title} editing={editing&&Boolean(onChangeEdition)}
     label="Editar nome do jornal" onChange={title=>{if(title)onChangeEdition?.({title});}}/>
    <img className="newspaper-lion" src="/newspaper/leao_dir.png" alt="" aria-hidden="true"/>
   </div>
   <div className="newspaper-meta"><span>{formatDate(edition.campaign_date)}</span><span>Folha independente de Cormyr</span></div>
   {(edition.subtitle||(editing&&onChangeEdition))&&<InlineText tag="h2" className="newspaper-subtitle"
    value={edition.subtitle} editing={editing&&Boolean(onChangeEdition)}
    label="Editar lema do jornal" onChange={subtitle=>onChangeEdition?.({subtitle})}/>}
   <div className="newspaper-double-rule"/>
  </header>
  {editing&&<p className="newspaper-canvas-tip">Clique nos textos para escrever · Arraste ⠿ para mudar a ordem · Puxe ↘ para redimensionar</p>}
  {edition.blocks.length>0&&<div ref={grid} className="newspaper-grid"
   onDragOver={event=>{if(editing)event.preventDefault();}}
   onDrop={event=>drop(event,null)}>
   {edition.blocks.map(block=><div key={block.id}
     className={`newspaper-story newspaper-story-${block.type}${editing?' newspaper-story-editable':''}${selectedId===block.id?' newspaper-story-selected':''}${dragOver===block.id?' newspaper-drag-over':''}`}
     style={{gridColumn:`span ${block.span}`}}
     onClick={()=>editing&&onSelect?.(block.id)}
     onKeyDown={event=>{
      if(editing&&event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){
       event.preventDefault();onSelect?.(block.id);
      }
     }}
     onDragOver={event=>{if(editing){event.preventDefault();setDragOver(block.id);}}}
     onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragOver(null);}}
     onDrop={event=>drop(event,block.id)}
     role={editing?'group':undefined} tabIndex={editing?0:undefined}
     aria-label={editing?`Editar bloco ${block.type}`:undefined}>
      {editing&&<button type="button" draggable className="newspaper-drag-handle"
       aria-label="Arrastar para mudar ordem deste bloco"
       title="Arraste para reposicionar o bloco"
       onClick={event=>event.stopPropagation()}
       onDragStart={event=>{
        event.dataTransfer.setData(BLOCK_DRAG_MIME,block.id);
        event.dataTransfer.effectAllowed='move';
       }}>⠿</button>}
      <NewspaperStory block={block} editing={editing}
       onChange={patch=>onChangeBlock?.(block.id,patch)}/>
      {editing&&onMoveBlock&&<div className="newspaper-move-buttons">
       <button type="button" aria-label="Mover bloco para cima" title="Subir"
        onClick={event=>{event.stopPropagation();onMoveBlock(block.id,-1);}}>↑</button>
       <button type="button" aria-label="Mover bloco para baixo" title="Descer"
        onClick={event=>{event.stopPropagation();onMoveBlock(block.id,1);}}>↓</button>
      </div>}
      {editing&&<button type="button" className="newspaper-resize-handle"
        aria-label="Arrastar para aumentar ou diminuir o bloco"
        title="Arraste para mudar largura e altura"
        onPointerDown={event=>startResize(event,block)}
        onPointerMove={moveResize}
        onPointerUp={()=>{drag.current=null;}}
        onPointerCancel={()=>{drag.current=null;}}>
        ↘
      </button>}
    </div>)}
  </div>}
  {editing&&onInsertBlock&&<div className="newspaper-drop-end"
   onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,null)}>
    Arraste um elemento da caixa de ferramentas até aqui ou clique nele para adicionar
   </div>}
  {edition.pdf_path&&<NewspaperPdf path={edition.pdf_path}/>}
  <footer className="newspaper-colophon">A FOLHA SEM SELO · A VOZ LIVRE DE CORMYR</footer>
 </div>;
}
