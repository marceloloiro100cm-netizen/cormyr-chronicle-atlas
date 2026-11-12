import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ImagePlus,Megaphone,Send} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
 commissionNewspaperStory,markCommissionsSeen,signedCommissionImage,uploadCommissionImage,
} from '@/lib/newspaper/data';
import {
 COMMISSION_COST_WEALTH,COMMISSION_PENDING_LIMIT,commissionInEdition,houseCanCommission,
 unseenCommissionAnswers,validateCommissionDraft,
 type NewspaperCommission,type NewspaperEdition,
} from '@/lib/newspaper/model';

function safeError(cause:unknown){
 if(cause&&typeof cause==='object'&&'message' in cause&&typeof (cause as {message:unknown}).message==='string')
  return (cause as {message:string}).message;
 return 'Não foi possível concluir a operação.';
}
function dayLabel(iso:string){return new Date(iso).toLocaleDateString('pt-BR');}
function CommissionThumb({path}:{path:string}){
 const image=useQuery({queryKey:['newspaper-commission-image',path],
  queryFn:()=>signedCommissionImage(path),staleTime:45*60*1000,retry:false});
 if(!image.data)return <div className="newspaper-commission-thumb newspaper-commission-thumb-empty" role="status">
  {image.isError?'Imagem indisponível':'Carregando imagem…'}</div>;
 return <img className="newspaper-commission-thumb" src={image.data} alt="Imagem enviada pela Casa"/>;
}

/** Jogador: escreve a notícia, anexa a imagem e paga 1 de Riqueza. */
export function CommissionForm({houseId,userId,commissions}:{
 houseId:string;userId:string;commissions:NewspaperCommission[];
}){
 const qc=useQueryClient();
 const [open,setOpen]=useState(false);
 const [title,setTitle]=useState('');
 const [body,setBody]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [done,setDone]=useState('');
 // A mesma chave é reutilizada em novas tentativas: reenviar nunca cobra duas vezes.
 const key=useRef<string>(crypto.randomUUID());
 const mine=commissions.filter(c=>c.house_id===houseId);
 const unseen=unseenCommissionAnswers(commissions,houseId);
 const canHire=houseCanCommission(commissions,houseId);
 const confirmSeen=async()=>{
  try{
   await markCommissionsSeen(houseId);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-commissions',userId]});
  }catch(cause){setError(safeError(cause));}
 };
 const submit=async()=>{
  if(busy)return;
  if(!canHire){setError(`Sua Casa já tem ${COMMISSION_PENDING_LIMIT} notícias aguardando publicação.`);return;}
  const problem=validateCommissionDraft({title,body});
  if(problem){setError(problem);return;}
  if(!window.confirm(`Contratar esta notícia custa ${COMMISSION_COST_WEALTH} de Riqueza da sua Casa. Deseja enviar?`))return;
  setBusy(true);setError('');setDone('');
  try{
   const imagePath=file?await uploadCommissionImage(houseId,file):null;
   await commissionNewspaperStory({houseId,title,body,imagePath,requestKey:key.current});
   key.current=crypto.randomUUID();
   setTitle('');setBody('');setFile(null);setOpen(false);
   setDone('Notícia enviada ao Editor-Chefe. Ela será publicada na próxima edição.');
   await Promise.all([
    qc.invalidateQueries({queryKey:['campaign-newspaper-commissions',userId]}),
    qc.invalidateQueries({queryKey:['campaign-panel']}),
    qc.invalidateQueries({queryKey:['noble-house']}),
   ]);
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 return <section className="newspaper-commission" aria-label="Contratar notícia">
  <header>
   <div><strong><Megaphone size={17}/> Contratar notícia</strong>
    <span>Custa {COMMISSION_COST_WEALTH} de Riqueza da sua Casa. Escreva o texto e anexe uma imagem; o Editor-Chefe revisa e publica.</span></div>
   {!open&&<Button type="button" disabled={!canHire} onClick={()=>{setOpen(true);setDone('');}}>Escrever notícia</Button>}
  </header>
  {!canHire&&<p className="newspaper-notice" role="status">
   Sua Casa já tem {COMMISSION_PENDING_LIMIT} notícias aguardando publicação. Aguarde o Editor-Chefe para contratar outra.</p>}
  {unseen.length>0&&<div className="newspaper-commission-news" role="status">
   <strong>Novidades dos seus pedidos</strong>
   {unseen.map(c=><p key={c.id} className={c.state==='rejected'?'newspaper-commission-rejected':undefined}>
    {c.state==='published'?`“${c.title}” foi publicada no jornal.`:
     `“${c.title}” foi recusada e 1 de Riqueza voltou à Casa.${c.rejection_note?` Nota: ${c.rejection_note}`:''}`}</p>)}
   <Button type="button" variant="outline" onClick={()=>{void confirmSeen();}}>Entendi</Button>
  </div>}
  {done&&<p className="newspaper-notice" role="status">{done}</p>}
  {open&&<form className="newspaper-commission-form" onSubmit={e=>{e.preventDefault();void submit();}}>
   <label>Título da notícia
    <input value={title} maxLength={180} placeholder="Ex.: Casa anuncia grande feira em Suzail"
     onChange={e=>setTitle(e.target.value)}/></label>
   <label>Texto
    <textarea rows={7} value={body} maxLength={6000}
     placeholder="Escreva a notícia como ela deve aparecer no jornal."
     onChange={e=>setBody(e.target.value)}/>
    <small>{body.length}/6000</small></label>
   <label className="newspaper-upload"><ImagePlus size={17}/> {file?file.name:'Anexar imagem (opcional)'}
    <input type="file" accept="image/png,image/jpeg,image/webp"
     onChange={e=>{setFile(e.target.files?.[0]??null);e.target.value='';}}/></label>
   {error&&<p className="newspaper-alert" role="alert">{error}</p>}
   <div className="newspaper-commission-actions">
    <Button type="button" variant="outline" disabled={busy}
     onClick={()=>{setOpen(false);setError('');}}>Cancelar</Button>
    <Button type="submit" disabled={busy}><Send size={15}/> {busy?'Enviando…':`Enviar · ${COMMISSION_COST_WEALTH} de Riqueza`}</Button>
   </div>
  </form>}
  {mine.length>0&&<div className="newspaper-commission-list" aria-label="Suas notícias contratadas">
   <strong>Suas notícias contratadas</strong>
   {mine.map(c=><div key={c.id} className="newspaper-commission-row">
    <span>{c.title}</span>
    <small className={c.state==='rejected'?'newspaper-commission-rejected':undefined}>
     {c.state==='published'?'Publicada':c.state==='rejected'?'Recusada · 1 de Riqueza devolvida':'Aguardando publicação'} · {dayLabel(c.created_at)}</small>
    {c.state==='rejected'&&c.rejection_note&&<p className="newspaper-commission-rejected">
     Nota do Editor-Chefe: {c.rejection_note}</p>}
   </div>)}
  </div>}
 </section>;
}

function CommissionCard({commission:c,houseName,edition,busy,onInsert,onShow,onReject}:{
 commission:NewspaperCommission;houseName:string;edition:NewspaperEdition|null;busy:boolean;
 onInsert:(commission:NewspaperCommission)=>void;
 onShow:(commission:NewspaperCommission)=>void;
 onReject:(commission:NewspaperCommission,note:string)=>void;
}){
 const [rejecting,setRejecting]=useState(false);
 const [note,setNote]=useState('');
 const inEdition=commissionInEdition(edition,c.id);
 return <article className="newspaper-commission-card">
  <header><strong>{c.title}</strong>
   <small>{houseName} · {dayLabel(c.created_at)} · {c.cost_wealth} de Riqueza paga</small></header>
  {c.image_path&&<CommissionThumb path={c.image_path}/>}
  <p>{c.body.length>320?c.body.slice(0,320)+'…':c.body}</p>
  {rejecting?<div className="newspaper-commission-reject">
   <label>Nota para a Casa (explique o motivo; a Riqueza será devolvida)
    <textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}
     placeholder="Ex.: A notícia revela segredos da Coroa e não pode circular."/></label>
   <div className="newspaper-commission-actions">
    <Button type="button" variant="outline" disabled={busy}
     onClick={()=>{setRejecting(false);setNote('');}}>Voltar</Button>
    <Button type="button" disabled={busy||note.trim().length<3}
     onClick={()=>onReject(c,note)}>Recusar e devolver 1 de Riqueza</Button>
   </div>
  </div>:<div className="newspaper-commission-actions">
   {inEdition?<Button type="button" variant="outline" onClick={()=>onShow(c)}>Na edição atual · ver na capa</Button>
    :<>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>setRejecting(true)}>Recusar</Button>
     <Button type="button" disabled={busy} onClick={()=>onInsert(c)}>Inserir na edição e editar</Button>
    </>}
  </div>}
 </article>;
}

/** Editor-Chefe (e Narrador): pedidos pendentes. Publicar a edição os retira desta lista. */
export function CommissionInbox({commissions,houseNames,edition,busy,onInsert,onShow,onReject}:{
 commissions:NewspaperCommission[];houseNames:Map<string,string>;
 edition:NewspaperEdition|null;busy:boolean;
 onInsert:(commission:NewspaperCommission)=>void;
 onShow:(commission:NewspaperCommission)=>void;
 onReject:(commission:NewspaperCommission,note:string)=>void;
}){
 if(commissions.length===0)return <p className="folha-empty-copy newspaper-commission-empty">
  Nenhuma notícia contratada aguardando publicação.</p>;
 return <div className="newspaper-commission-inbox">
  {commissions.map(c=><CommissionCard key={c.id} commission={c}
   houseName={houseNames.get(c.house_id)??c.house_id} edition={edition} busy={busy}
   onInsert={onInsert} onShow={onShow} onReject={onReject}/>)}
 </div>;
}
