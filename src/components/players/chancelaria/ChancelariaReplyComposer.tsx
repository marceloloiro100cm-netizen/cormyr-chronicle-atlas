import {useEffect,useRef,useState,type ReactNode} from 'react';
import {CalendarDays,ImagePlus,Maximize2,Minimize2} from 'lucide-react';
import {ImagePicker,type PendingImage} from '@/components/campaign-content';
import {DesdiaDateBar} from '@/components/calendar/desdia-date-bar';
import {formatDate} from '@/lib/calendar/harptos';
import {handleTextareaTab} from '@/lib/text/textarea-indent';
import {Icon} from '@/components/players/narrator/narrator-ui';

export type ReplySubmitPayload={
 text:string;
 images:PendingImage[];
 campaignDate:string;
 signedBy:string|null;
 deliveryWeek:number|null;
 draft:boolean;
};

export function ChancelariaReplyComposer({
 textareaId,
 placeholder,
 draftKey,
 today,
 admin,
 busy,
 uploading=false,
 defaultDeliveryWeek=null,
 note,
 recentSigs=[],
 onSubmit,
}:{
 textareaId:string;
 placeholder:string;
 draftKey:string;
 today:string;
 admin:boolean;
 busy:boolean;
 uploading?:boolean;
 defaultDeliveryWeek?:number|null;
 note:ReactNode;
 recentSigs?:string[];
 onSubmit:(payload:ReplySubmitPayload)=>Promise<boolean>;
}){
 const readDraft=()=>{try{return localStorage.getItem(draftKey)??sessionStorage.getItem(draftKey)??'';}catch{return '';}};
 const [reply,setReplyState]=useState(readDraft);
 const [signed,setSigned]=useState('');
 const [replyDate,setReplyDate]=useState(today);
 const [images,setImages]=useState<PendingImage[]>([]);
 const [weekInput,setWeekInput]=useState('');
 const [showDate,setShowDate]=useState(false);
 const [showImages,setShowImages]=useState(false);
 const [expanded,setExpanded]=useState(false);
 const [focused,setFocused]=useState(false);
 const replyRef=useRef<HTMLTextAreaElement>(null);

 // Atualiza a data padrão quando o relógio oficial termina de carregar ou muda de conversa.
 useEffect(()=>{if(today&&!replyDate)setReplyDate(today);},[today,replyDate]);
 useEffect(()=>{
  setReplyState(readDraft());
  setReplyDate(today);
  setImages([]);
  setWeekInput('');
  setShowDate(false);
  setShowImages(false);
 },[draftKey]);// eslint-disable-line react-hooks/exhaustive-deps

 const setReply=(value:string)=>{
  setReplyState(value);
  try{
   if(value)localStorage.setItem(draftKey,value);
   else{localStorage.removeItem(draftKey);sessionStorage.removeItem(draftKey);}
  }catch{/* só em memória */}
 };

 useEffect(()=>{
  const t=replyRef.current;
  if(!t)return;
  if(expanded){t.style.height='auto';return;}
  t.style.height='auto';
  t.style.height=Math.min(t.scrollHeight+2,Math.round(window.innerHeight*.38))+'px';
 },[reply,expanded]);

 const effectiveDate=replyDate||today;
 const customDate=Boolean(today&&effectiveDate&&effectiveDate!==today);
 const parsedWeek=admin&&weekInput.trim()&&Number.isSafeInteger(Number(weekInput))&&Number(weekInput)>=1
  ?Number(weekInput):null;
 const active=focused||Boolean(reply.trim())||showDate||showImages||expanded||images.length>0||customDate||parsedWeek!==null;

 const triggerSubmit=async(draft:boolean)=>{
  if(busy||!reply.trim())return;
  const ok=await onSubmit({
   text:reply,
   images,
   campaignDate:effectiveDate,
   signedBy:admin?(signed.trim()||null):null,
   deliveryWeek:parsedWeek,
   draft,
  });
  if(!ok)return;
  setReply('');
  setImages([]);
  setWeekInput('');
  setReplyDate(today);
  setShowDate(false);
  setShowImages(false);
  setExpanded(false);
 };

 return <form className={'chn-reply'+(active?' chn-reply--active':'')+(expanded?' chn-reply--expanded':'')}
  onSubmit={e=>{e.preventDefault();void triggerSubmit(false);}}
  onFocus={()=>setFocused(true)}
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}>

  <div className="chn-reply-tools" role="toolbar" aria-label="Opções da resposta">
   <button type="button"
    className={'chn-tool-chip'+(showDate||customDate?' chn-tool-chip--on':'')}
    aria-expanded={showDate}
    onClick={()=>setShowDate(v=>!v)}>
    <CalendarDays size={14} aria-hidden="true"/>
    <span>{effectiveDate?formatDate(effectiveDate):'Data da campanha'}</span>
   </button>

   <button type="button"
    className={'chn-tool-chip'+(showImages||images.length>0?' chn-tool-chip--on':'')}
    aria-expanded={showImages}
    onClick={()=>setShowImages(v=>!v)}>
    <ImagePlus size={14} aria-hidden="true"/>
    <span>{images.length>0?`${images.length} ${images.length===1?'imagem':'imagens'}`:'Anexar imagem'}</span>
   </button>

   {admin&&<label className="chn-week-chip" title="Opcional: defina em qual semana esta resposta será entregue">
    <span>Entrega:</span>
    <input type="number" min={1} inputMode="numeric" value={weekInput}
     placeholder={defaultDeliveryWeek!==null?`Sem. ${defaultDeliveryWeek}`:'Auto'}
     aria-label="Semana de entrega da resposta"
     onChange={e=>setWeekInput(e.target.value)}/>
   </label>}

   <span className="chn-spacer"/>
   <button type="button" className="chn-tool-chip"
    aria-pressed={expanded}
    onClick={()=>setExpanded(v=>!v)}>
    {expanded?<><Minimize2 size={14} aria-hidden="true"/><span>Compactar</span></>:<><Maximize2 size={14} aria-hidden="true"/><span>Expandir</span></>}
   </button>
  </div>

  {showDate&&<div className="chn-reply-drawer">
   <DesdiaDateBar value={effectiveDate} officialDate={today||undefined}
    allowFullCalendar={admin} disabled={busy}
    label="Data da resposta"
    onChange={setReplyDate}/>
  </div>}

  {showImages&&<div className="chn-reply-drawer">
   <ImagePicker images={images} onChange={setImages} disabled={busy}/>
  </div>}

  <div className="chn-reply-main">
   <textarea id={textareaId} ref={replyRef} rows={expanded?7:2} value={reply}
    onChange={e=>setReply(e.target.value)}
    onKeyDown={e=>{
     if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&reply.trim()&&!busy){e.preventDefault();void triggerSubmit(false);return;}
     handleTextareaTab(e,setReply);
    }}
    placeholder={placeholder} aria-label="Texto da resposta"/>
   <button type="submit" className="chn-btn chn-btn--primary" disabled={busy||!reply.trim()}>
    <Icon name="send" size={15}/>{uploading?'Enviando imagens…':'Enviar'}
   </button>
  </div>

  <div className="chn-reply-extra">
   {admin&&<div className="chn-sign-row">
    <input className="chn-sign" list="chn-npc-sigs" maxLength={120} value={signed} onChange={e=>setSigned(e.target.value)}
     placeholder="Assinado por (NPC ou cargo), opcional" aria-label="Assinado por (NPC ou cargo)"/>
    <datalist id="chn-npc-sigs">{recentSigs.map(s=><option key={s} value={s}/>)}</datalist>
    {recentSigs.length>0&&<div className="chn-sign-chips" aria-label="Assinaturas recentes">
     {recentSigs.slice(0,4).map(s=><button key={s} type="button" className="chn-sign-chip" onClick={()=>setSigned(s)}>{s}</button>)}
    </div>}
   </div>}
   <span className="chn-note">{note}</span>
   <button type="button" className="chn-btn chn-btn--sm" disabled={busy||!reply.trim()} onClick={()=>void triggerSubmit(true)}>
    Salvar rascunho
   </button>
  </div>
 </form>;
}
