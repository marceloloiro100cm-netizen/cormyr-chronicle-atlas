import {useEffect,useRef,useState,type CSSProperties,type DragEvent,type KeyboardEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {formatDate} from '@/lib/calendar/harptos';
import {signedNewspaperAsset} from '@/lib/newspaper/data';
import {blockFocus,editionWords,panFocus,readingMinutes} from '@/lib/newspaper/editing';
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
function NewspaperImage({block,editing,selected=false,onChange}:{
 block:NewspaperBlock;editing:boolean;selected?:boolean;onChange?:(patch:Partial<NewspaperBlock>)=>void;
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
 const fixed=block.autoHeight===false;
 const focus=blockFocus(block),cropZoom=block.cropZoom??1;
 // Recorte por arraste: só na edição, com o bloco selecionado e altura fixa.
 const canCrop=editing&&selected&&fixed&&Boolean(onChange);
 const pan=useRef<{x:number;y:number;px:number;py:number;moved:boolean}|null>(null);
 const startPan=(event:React.PointerEvent<HTMLButtonElement>)=>{
  if(!canCrop)return;
  pan.current={x:focus.x,y:focus.y,px:event.clientX,py:event.clientY,moved:false};
  event.currentTarget.setPointerCapture?.(event.pointerId);
 };
 const movePan=(event:React.PointerEvent<HTMLButtonElement>)=>{
  const start=pan.current;
  if(!start)return;
  const dx=event.clientX-start.px,dy=event.clientY-start.py;
  if(!start.moved&&Math.hypot(dx,dy)<4)return;
  start.moved=true;
  const box=event.currentTarget.getBoundingClientRect();
  const next=panFocus({x:start.x,y:start.y},dx,dy,{width:box.width,height:box.height},cropZoom);
  onChange?.({focusX:next.x,focusY:next.y});
 };
 return <figure className="newspaper-photo">
  {src?<button className={`newspaper-image-open${fixed?' newspaper-image-crop':''}${canCrop?' newspaper-image-crop-active':''}`} type="button"
   onPointerDown={startPan} onPointerMove={movePan}
   onPointerUp={()=>{window.setTimeout(()=>{pan.current=null;},0);}}
   onPointerCancel={()=>{pan.current=null;}}
   onClick={event=>{
    event.stopPropagation();
    if(pan.current?.moved){event.preventDefault();return;}
    setZoom(1);setLightbox(true);
   }}
   title={canCrop?'Arraste para escolher o recorte':'Ampliar fotografia'} aria-label={canCrop?'Arrastar para recortar a fotografia':'Ampliar fotografia'}>
    <img className={`newspaper-filter-${style} ${fixed?'newspaper-img-fixed':'newspaper-img-auto'}`} src={src}
     alt={block.caption||'Fotografia da edição'} draggable={false}
     style={fixed?{height:Math.max(130,block.height-44),
      objectPosition:`${focus.x}% ${focus.y}%`,
      ...(cropZoom>1?{transform:`scale(${cropZoom})`,transformOrigin:`${focus.x}% ${focus.y}%`}:{})}:undefined}/>
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
function NewspaperStory({block,editing,selected=false,onChange}:{
 block:NewspaperBlock;editing:boolean;selected?:boolean;onChange?:(patch:Partial<NewspaperBlock>)=>void;
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
 if(block.type==='image')return <NewspaperImage block={block} editing={editing} selected={selected} {...(onChange?{onChange}:{})}/>;
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
   {...(block.dropCap?{className:'newspaper-dropcap'}:{})}
   onChange={next=>onChange?.({text:[heading,next].join('\n\n')})}/>
  {block.byline&&<p className="newspaper-byline">Por {block.byline}</p>}
 </article>;
}
export function NewspaperCanvas({edition,editing=false,compactMasthead=false,selectedId,onSelect,onResize,
 onChangeBlock,onReorderBlock,onInsertBlock,onMoveBlock,onChangeEdition}:{
 edition:NewspaperEdition;editing?:boolean;compactMasthead?:boolean;selectedId?:string|null;
 onSelect?:(id:string)=>void;
 /** `base` são os blocos de quando o arraste começou: o refluxo parte sempre deles. */
 onResize?:(id:string,dimensions:{span?:number;height?:number},base:readonly NewspaperBlock[])=>void;
 onChangeBlock?:(id:string,patch:Partial<NewspaperBlock>)=>void;
 onReorderBlock?:(fromId:string,toId:string)=>void;
 onInsertBlock?:(type:NewspaperBlockType,beforeId:string|null)=>void;
 onMoveBlock?:(id:string,direction:-1|1)=>void;
 /** Edita o título e o lema direto no cabeçalho da folha. */
 onChangeEdition?:(patch:Partial<Pick<NewspaperEdition,'title'|'subtitle'>>)=>void;
}){
 const grid=useRef<HTMLDivElement|null>(null);
 const minutes=readingMinutes(editionWords(edition.blocks));
 const drag=useRef<{id:string;startX:number;startY:number;block:NewspaperBlock;column:number;
  base:readonly NewspaperBlock[];mode:'both'|'width'}|null>(null);
 const [dragOver,setDragOver]=useState<string|null>(null);
 const startResize=(event:React.PointerEvent<HTMLButtonElement>,block:NewspaperBlock,mode:'both'|'width'='both')=>{
  if(!editing||!onResize||block.pinned)return;
  event.preventDefault();event.stopPropagation();
  const width=grid.current?.getBoundingClientRect().width??720;
  drag.current={id:block.id,startX:event.clientX,startY:event.clientY,block,column:width/12,
   base:edition.blocks,mode};
  event.currentTarget.setPointerCapture?.(event.pointerId);
 };
 const moveResize=(event:React.PointerEvent<HTMLButtonElement>)=>{
  const d=drag.current;
  if(!d||!onResize)return;
  const size=newspaperResize(d.block,event.clientX-d.startX,event.clientY-d.startY,d.column);
  onResize(d.id,d.mode==='width'?{span:size.span}:size,d.base);
 };
 const drop=(event:DragEvent<HTMLElement>,targetId:string|null)=>{
  if(!editing)return;
  event.preventDefault();event.stopPropagation();setDragOver(null);
  const moving=event.dataTransfer.getData(BLOCK_DRAG_MIME);
  if(moving&&targetId&&moving!==targetId){onReorderBlock?.(moving,targetId);return;}
  if(moving)return;
  const type=event.dataTransfer.getData(TOOL_DRAG_MIME);
  if(['headline','subtitle','article','image','quote','notice'].includes(type)){
   onInsertBlock?.(type as NewspaperBlockType,targetId);
  }
 };
 return <div className={`newspaper-page newspaper-font-${edition.font_style} newspaper-template-${edition.template}`}>
  <header className="newspaper-masthead">
   <div className="newspaper-rule"/>
   {compactMasthead?<div className="newspaper-page-folio">
    <span>EDIÇÃO Nº {String(edition.edition_no).padStart(3,'0')}</span>
    <span>{formatDate(edition.campaign_date)}</span>
    {!editing&&minutes>0&&<span className="newspaper-reading-time">Leitura: cerca de {minutes} min</span>}
   </div>:<p>O CORREIO DO REINO · CORMYR · EDIÇÃO {String(edition.edition_no).padStart(3,'0')}</p>}
   <div className="newspaper-page-masthead">
    <img className="newspaper-crest" src="/newspaper/brasao_reino.webp" alt="" aria-hidden="true"/>
    <InlineText tag="h1" value={edition.title} editing={editing&&Boolean(onChangeEdition)}
     label="Editar nome do jornal" onChange={title=>{if(title)onChangeEdition?.({title});}}/>
    <img className="newspaper-crest newspaper-crest-mirror" src="/newspaper/brasao_reino.webp" alt="" aria-hidden="true"/>
   </div>
   {!compactMasthead&&<div className="newspaper-meta"><span>{formatDate(edition.campaign_date)}</span><span>Folha independente de Cormyr</span></div>}
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
     className={`newspaper-story newspaper-story-${block.type}${editing?' newspaper-story-editable':''}${selectedId===block.id?' newspaper-story-selected':''}${block.pinned?' newspaper-story-pinned':''}${dragOver===block.id?' newspaper-drag-over':''}`}
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
      {editing&&!block.pinned&&<button type="button" draggable className="newspaper-drag-handle"
       aria-label="Arrastar para mudar ordem deste bloco"
       title="Arraste para reposicionar o bloco"
       onClick={event=>event.stopPropagation()}
       onDragStart={event=>{
        event.dataTransfer.setData(BLOCK_DRAG_MIME,block.id);
        event.dataTransfer.effectAllowed='move';
       }}>⠿</button>}
      {editing&&onChangeBlock&&<button type="button" className="newspaper-lock-button"
       aria-pressed={Boolean(block.pinned)}
       aria-label={block.pinned?'Destravar bloco fixo':'Fixar bloco'}
       title={block.pinned?'Bloco fixo: posição e tamanho travados. Clique para destravar.':'Fixar posição e tamanho deste bloco'}
       onClick={event=>{event.stopPropagation();onChangeBlock(block.id,{pinned:!block.pinned});}}>
        {block.pinned?'🔒':'🔓'}</button>}
      <NewspaperStory block={block} editing={editing} selected={selectedId===block.id}
       onChange={patch=>onChangeBlock?.(block.id,patch)}/>
      {editing&&onMoveBlock&&!block.pinned&&<div className="newspaper-move-buttons">
       <button type="button" aria-label="Mover bloco para cima" title="Subir"
        onClick={event=>{event.stopPropagation();onMoveBlock(block.id,-1);}}>↑</button>
       <button type="button" aria-label="Mover bloco para baixo" title="Descer"
        onClick={event=>{event.stopPropagation();onMoveBlock(block.id,1);}}>↓</button>
      </div>}
      {editing&&!block.pinned&&<button type="button" className="newspaper-edge-handle"
        aria-label="Arrastar a lateral para mudar a largura do bloco"
        title="Arraste a lateral: muda só a largura e ajusta o vizinho da linha"
        onPointerDown={event=>startResize(event,block,'width')}
        onPointerMove={moveResize}
        onPointerUp={()=>{drag.current=null;}}
        onPointerCancel={()=>{drag.current=null;}}/>}
      {editing&&!block.pinned&&<button type="button" className="newspaper-resize-handle"
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
  <footer className="newspaper-colophon">{edition.title.toUpperCase()} · A VOZ LIVRE DE CORMYR</footer>
 </div>;
}
