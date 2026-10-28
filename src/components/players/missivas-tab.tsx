import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { CampaignContent, ImagePicker, uploadImages, type PendingImage } from '@/components/campaign-content';
import { filterLetters, hasDeliveredAnswer, matchesLetterBox, groupReceivedLetters, isLetterRead, nextLetterNumber, pendingRoundHouses, sentLetters, type LetterRow } from '@/lib/letters';
import { date, syncLabel } from './shared';
import type { Panel } from './panel-data';

function ReplyForm({letterId,replyId,recipientId,onSave}:{letterId:string;replyId?:string;recipientId:string;onSave:()=>unknown}){
  const {data:deliveryWeek=null}=useQuery({queryKey:['reply-delivery',recipientId],queryFn:async()=>{const r=await supabase.rpc('reply_delivery_week',{p_recipient:recipientId});if(r.error)throw r.error;return r.data;},refetchInterval:15000});
  const [open,setOpen]=useState(false),[content,setContent]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const key=useRef<string|null>(null);
  const [images,setImages]=useState<PendingImage[]>([]);
  return open?<form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);key.current??=crypto.randomUUID();let richContent;try{richContent=await uploadImages(content,images,key.current);}catch(err){setMessage(err instanceof Error?err.message:'Falha na imagem.');setBusy(false);return;}const draft=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';const {error}=draft?await supabase.rpc('save_weekly_reply_draft',{p_id:key.current,p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent}):await supabase.rpc('reply_weekly_message',{p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent,p_key:key.current,p_draft:false});if(error)setMessage(error.message);else{key.current=null;setContent('');setImages([]);setOpen(false);onSave();}setBusy(false);}}><p role="status">{deliveryWeek?`Esta resposta será entregue na Semana ${deliveryWeek}, quando o narrador a abrir.`:"Sem semana aberta."}</p><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy}>Salvar rascunho</Button><Button disabled={busy||deliveryWeek===null}>{busy?'Salvando…':'Enviar resposta'}</Button></div><p role="status">{message}</p></form>:<Button onClick={()=>setOpen(true)}>Responder</Button>;
}

function WriteLetter({data,onSave}:{data:Panel;onSave:()=>void}){
  const key=useRef<string|null>(null);const [busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const [images,setImages]=useState<PendingImage[]>([]);
  const [kind,setKind]=useState<'geral'|'reservada'>('geral');
  const [targets,setTargets]=useState<string[]>([]);
  const houses=data.houses.filter(h=>h.active&&h.season===2);
  const next=(data.rounds.find(r=>r.status==='open')?.number??Math.max(0,...data.rounds.map(r=>r.number)))+1;
  const toggle=(value:string)=>setTargets(list=>list.includes(value)?list.filter(v=>v!==value):[...list,value]);
  return <section><h2>Escrever missivas</h2><p className="text-muted-foreground">Missiva geral vai para todos os destinatários marcados; reservada vai para um só. A entrega depende da abertura explícita da semana pelo Narrador.</p><form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget;const f=new FormData(form);const recipients=kind==='geral'?targets:[String(f.get('recipient'))];if(!recipients.length||recipients.some(r=>!r)){setMsg(kind==='geral'?'Marque ao menos um destinatário.':'Escolha o destinatário.');return;}setBusy(true);setMsg('');key.current??=crypto.randomUUID();let richContent;try{richContent=await uploadImages(String(f.get('content')),images,key.current);}catch(err){setMsg(err instanceof Error?err.message:'Falha na imagem.');setBusy(false);return;}const numberRaw=String(f.get('number')??'').trim();const savingDraft=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';const {error}=await supabase.rpc(savingDraft?'save_letter_batch_drafts':'send_campaign_letter_batch',{p_kind:kind,p_number:numberRaw?Number(numberRaw):next,p_subject:String(f.get('subject')),p_content:richContent,p_recipients:recipients,p_key:key.current});setBusy(false);if(error){setMsg(error.message);return;}key.current=null;form.reset();setImages([]);setTargets([]);setMsg(savingDraft?'Rascunho salvo.':`Mensagem programada para ${recipients.length} destinatário(s); não abre a semana.`);onSave();}}>
    <fieldset className="campaign-form"><legend>Tipo da missiva</legend><label className="campaign-check"><input type="radio" name="kind" checked={kind==='geral'} onChange={()=>setKind('geral')}/>Geral — vai para todos os destinatários marcados</label><label className="campaign-check"><input type="radio" name="kind" checked={kind==='reservada'} onChange={()=>setKind('reservada')}/>Reservada — vai para uma única casa</label></fieldset>
    {kind==='geral'?<fieldset className="campaign-form"><legend>Destinatários ({targets.length} marcados)</legend>{houses.map(h=><label className="campaign-check" key={h.id}><input type="checkbox" checked={targets.includes('h:'+h.id)} onChange={()=>toggle('h:'+h.id)}/>Casa {h.name}</label>)}</fieldset>:<label>Destinatário<select name="recipient" required>{houses.map(h=><option key={h.id} value={'h:'+h.id}>Casa {h.name}</option>)}</select></label>}
    <label>Semana de entrega<input name="number" type="number" min={1} placeholder={`Automático: ${next}`}/></label>
    <label>Assunto<input name="subject" required/></label>
    <label>Missiva<textarea name="content" required rows={10}/></label>
    <ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy}>Salvar rascunho</Button><Button disabled={busy}>{busy?'Programando…':'Programar entrega'}</Button></div></form><p role="status">{msg}</p></section>;
}

export function MissivasTab({data,me,onSave,onError}:{data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void}){
  const empty={number:'',kind:'',answered:'',house:'',read:'',text:'',box:''};
  const [filters,setFilters]=useState(empty);
  const [compose,setCompose]=useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [threads,setThreads]=useState<Set<string>>(new Set());
  const [draft,setDraft]=useState<{key:number;subject:string;content:string}|null>(null);
  const [roundNumber,setRoundNumber]=useState('');
  const open=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const pendingHouses=data.admin?pendingRoundHouses(open,data.houses,data.players,data.members,data.letters as LetterRow[],data.replies):[];
  const allLetters=(data.letters as (LetterRow&{deleted_at?:string|null;publication_state?:string;delivery_week?:number|null})[]).filter(l=>matchesLetterBox(l,data.replies,filters.box));
  const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const letters=filterLetters(allLetters,data.replies,filters,{players:data.players,receipts:data.receipts,userId:data.user.id,admin:data.admin}).filter(l=>!filters.text||norm(l.subject+' '+l.content+' '+l.sender_name).includes(norm(filters.text)));
  const groups=filters.box==='enviadas'?[]:groupReceivedLetters(letters,data.user.id);
  const mine=filters.box==='recebidas'?[]:sentLetters(letters,data.user.id);
  const myHouses=data.members.filter(m=>m.player_id===me?.id).map(m=>m.house_id);
  const isRecipient=(letter:LetterRow)=>letter.recipient_player_id===me?.id||(letter.recipient_player_id===null&&myHouses.includes(letter.recipient_house_id??''));
  const toggle=(id:string)=>setExpanded(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleThread=(id:string)=>setThreads(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const houseName=(id:string|null)=>data.houses.find(h=>h.id===id)?.name;
  const card=(letter:LetterRow&{deleted_at?:string|null;publication_state?:string;delivery_week?:number|null},canAnswer:boolean)=>{
    const answers=data.replies.filter(r=>r.letter_id===letter.id);
    const receipt=data.receipts.find(r=>r.letter_id===letter.id&&r.user_id===data.user.id);
    const read=isLetterRead(letter.id,receipt,answers);
    const isOpen=expanded.has(letter.id);
    const threadLetters=letter.conversation_id?allLetters.filter(o=>o.conversation_id===letter.conversation_id&&o.id!==letter.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)):[];
    const threadOpen=threads.has(letter.id);
    const to=letter.recipient_house_id?'Casa '+(houseName(letter.recipient_house_id)??letter.recipient_house_id):letter.recipient_player_id?(data.players.find(p=>p.id===letter.recipient_player_id)?.name??'Jogador'):'Narrador';
    const fromHouse=letter.sender_player_id?houseName(data.players.find(p=>p.id===letter.sender_player_id)?.roster_house_id??null):null;
    const canDelete=!letter.deleted_at&&(data.admin||letter.sender_user_id===data.user.id);
    return <article className={'campaign-letter'+(isOpen?'':' recolhida')} key={letter.id} id={'missiva-'+letter.id}>
      <button type="button" className="campaign-letter-toggle" aria-expanded={isOpen} onClick={()=>toggle(letter.id)}>
        <ChevronDown size={18} className={isOpen?'rotate-180 transition-transform':'transition-transform'}/>
        <span className="campaign-eyebrow">{letter.letter_number?`Missiva ${letter.letter_number} · `:''}{letter.letter_kind==='geral'?'Geral':'Reservada'} · {hasDeliveredAnswer(letter,answers)?'Respondida · ':''}{read?'Lida':'Não lida'}{letter.publication_state==='draft'?' · Rascunho':letter.publication_state==='scheduled'?` · Aguardando abertura da Semana ${letter.delivery_week}`:''}{letter.deleted_at?' · Excluída':''}</span>
        <strong className="campaign-letter-subject">{letter.subject}</strong>
        <span className="text-muted-foreground text-sm">De: {letter.sender_name}{fromHouse?` (${fromHouse})`:''} · Para: {to} · {date(letter.created_at)}{answers.length?` · ${answers.length} resposta(s)`:''}</span>
      </button>
      {isOpen&&<div className="campaign-letter-body">
        <CampaignContent content={letter.content}/>
        <p className="text-muted-foreground text-sm">{syncLabel(letter.sync_state)} · {letter.last_synced_at?date(letter.last_synced_at):'Ainda não sincronizada'}</p>
        {answers.length>0&&<div className="campaign-replies">{answers.map(answer=><div key={answer.id}><span className="campaign-eyebrow">Missiva {answer.creation_week??answer.delivery_week??letter.letter_number??'?'} · Resposta</span><br/><strong>{answer.author_name}</strong>{answer.publication_state==='draft'?<p>Rascunho{answer.author_user_id===data.user.id&&!letter.deleted_at&&<ReplyDraftEdit answer={answer} onSave={onSave}/ >}{answer.author_user_id===data.user.id&&!letter.deleted_at&&<Button size="sm" variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const r=await supabase.rpc('schedule_weekly_reply_draft',{p_id:answer.id});if(r.error)onError(r.error.message);else onSave();}}>Programar entrega</Button>}</p>:answer.publication_state==='scheduled'&&<p>Aguardando abertura da Semana {answer.delivery_week}</p>}<small> · {date(answer.created_at)} · {syncLabel(answer.sync_state)}</small><CampaignContent content={answer.content}/>{!letter.deleted_at&&answer.author_user_id!==data.user.id&&answer.publication_state==='delivered'&&<ReplyForm letterId={letter.id} replyId={answer.id} recipientId={answer.author_user_id} onSave={onSave}/>}</div>)}</div>}
        {threadLetters.length>0&&<div className="campaign-thread"><Button size="sm" variant="ghost" aria-expanded={threadOpen} onClick={()=>toggleThread(letter.id)}>{threadOpen?'Ocultar fio da conversa':`Ver fio completo (${threadLetters.length} missiva(s) relacionada(s))`}</Button>{threadOpen&&threadLetters.map(other=>{const otherAnswers=data.replies.filter(r=>r.letter_id===other.id);return <div key={other.id} className="campaign-thread-item"><span className="campaign-eyebrow">{other.letter_number?`Missiva ${other.letter_number} · `:''}{other.letter_kind==='geral'?'Geral':'Reservada'}</span><strong>{other.subject}</strong><small> · De: {other.sender_name} · {date(other.created_at)}</small><CampaignContent content={other.content}/>{otherAnswers.map(a=><div key={a.id} className="campaign-replies"><span className="campaign-eyebrow">Missiva {a.creation_week??a.delivery_week??'?'} · Resposta</span><br/><strong>{a.author_name}</strong><small> · {date(a.created_at)}</small><CampaignContent content={a.content}/></div>)}</div>;})}</div>}
        {!letter.deleted_at&&<div className="campaign-actions">
          {!read&&letter.publication_state==='delivered'&&<Button variant="outline" onClick={async()=>{const {error}=await supabase.rpc('mark_letter_read',{p_id:letter.id});if(error&&error.code!=='23505')onError(error.message);else onSave();}}>Marcar como lida</Button>}
          {open!==null&&!data.admin&&<Button variant="outline" onClick={()=>{setDraft({key:Date.now(),subject:'Enc: '+letter.subject,content:`— Missiva encaminhada —\nDe: ${letter.sender_name} · ${date(letter.created_at)}\nAssunto: ${letter.subject}\n\n${letter.content}`});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Encaminhar</Button>}
          {canDelete&&<Button variant="outline" onClick={async()=>{if(!confirm('Excluir esta missiva? Ela deixará de aparecer para os jogadores.'))return;const {error}=await supabase.rpc('delete_campaign_letter',{p_id:letter.id});if(error)onError(error.message);else onSave();}}>Excluir</Button>}
        </div>}
        {letter.publication_state==='draft'&&letter.sender_user_id===data.user.id&&<Button variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const result=await supabase.rpc('schedule_letter_draft',{p_id:letter.id,p_week:letter.delivery_week??open??nextLetterNumber(data.letters)});if(result.error)onError(result.error.message);else onSave();}}>Programar entrega</Button>}{!letter.deleted_at&&(data.admin||(letter.publication_state==='draft'&&letter.sender_user_id===data.user.id))&&<LetterEdit letter={letter} onSave={onSave}/>}
        {!letter.deleted_at&&letter.publication_state==='delivered'&&letter.sender_user_id!==data.user.id&&canAnswer&&<ReplyForm letterId={letter.id} recipientId={letter.sender_user_id} onSave={onSave}/>}
        <Button variant="ghost" size="sm" onClick={()=>{toggle(letter.id);document.getElementById('missiva-'+letter.id)?.scrollIntoView({block:'nearest'});}}>Recolher</Button>
      </div>}
    </article>;
  };
  const sel=(label:string,key:keyof typeof empty,opts:[string,string][])=><label>{label}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}>{opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
  const numbers=[...new Set(data.letters.map(l=>l.letter_number).filter((n):n is number=>n!==null))].sort((a,b)=>b-a);
  const visibleIds=[...groups.flatMap(g=>g.letters),...mine].map(l=>l.id);
  return <div className="campaign-mail-layout">
    <aside className="campaign-mail-side" aria-label="Filtros das missivas">
      <p className="campaign-eyebrow">FILTROS</p>
      <label>Buscar<input type="search" value={filters.text} onChange={e=>setFilters({...filters,text:e.target.value})} placeholder="Assunto, texto ou remetente…"/></label>
      {sel('Caixa','box',[['','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas'],['programadas','Programadas'],['rascunhos','Rascunhos'],['historico','Histórico por semana'],...(data.admin?[['excluidas','Excluídas']] as [string,string][]:[])])}
      {data.admin&&sel('Casa','house',[['','Todas as casas'],...data.houses.filter(h=>h.active&&h.season===2).map(h=>[h.id,h.name] as [string,string])])}
      {sel('Semana','number',[['','Todas as semanas'],...numbers.map(n=>[String(n),'Semana '+n] as [string,string])])}
      {sel('Tipo','kind',[['','Todos os tipos'],['geral','Geral'],['reservada','Reservada']])}
      {sel('Resposta','answered',[['','Todas'],['yes','Respondidas'],['no','Não respondidas']])}
      {sel('Leitura','read',[['','Todas'],['no','Não lidas'],['yes','Lidas']])}
      {groups.some(g=>g.number!==null)&&<nav className="campaign-mail-jump" aria-label="Ir para uma semana de missiva">{groups.filter(g=>g.number!==null).map(g=><button key={g.number} type="button" onClick={()=>document.getElementById('grupo-missiva-'+g.number)?.scrollIntoView({behavior:'smooth',block:'start'})}>Missiva {g.number}</button>)}</nav>}
      <Button variant="outline" onClick={()=>setFilters(empty)}>Limpar filtros</Button>
      <div className="campaign-actions"><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set(visibleIds))}>Expandir todas</Button><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set())}>Recolher todas</Button></div>
      {!data.admin&&open!==null&&<Button onClick={()=>{setDraft({key:Date.now(),subject:'',content:''});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Escrever missiva</Button>}
    </aside>
    <div>
      <div className={'campaign-round '+(open===null?'fechada':'')} role="status">{open===null?'Missivas fechadas, aguarde o narrador abrir a próxima semana.':`Missiva ${open} aberta — respostas, novas missivas e encaminhamentos liberados.`}</div>
      {data.admin&&<><div className="campaign-heading"><h2>Gestão de missivas</h2><Button onClick={()=>setCompose(v=>!v)}>{compose?'Fechar escrita':'Escrever missiva'}</Button></div>
        <section className="campaign-round-pending" aria-label="Casas com respostas pendentes">
          <h3>{open===null?'Respostas da rodada':`Missiva ${open} · Casas com respostas pendentes`}</h3>
          {open===null?<p className="text-muted-foreground">Nenhuma rodada aberta.</p>:<><p>{pendingHouses.length} casa{pendingHouses.length===1?'':'s'} aguardando resposta</p>{pendingHouses.length===0?<p className="text-muted-foreground">Nenhuma resposta pendente às missivas entregues nesta rodada.</p>:<ul>{pendingHouses.map(h=><li key={h.id}><div><strong>{h.name}</strong><span className="text-muted-foreground text-sm">{h.letterIds.length} missiva{h.letterIds.length===1?'':'s'} pendente{h.letterIds.length===1?'':'s'}</span></div><Button size="sm" variant="outline" onClick={()=>{setFilters({...empty,house:h.id});setExpanded(new Set(h.letterIds));}}>Ver missivas</Button></li>)}</ul>}</>}
        </section>
        <p>{allLetters.length} missivas · {allLetters.filter(l=>!hasDeliveredAnswer(l,data.replies)).length} não respondidas</p>
        <div className="campaign-actions">{open!==null&&<Button variant="outline" onClick={async()=>{if(!confirm(`Fechar a Missiva ${open}? Os jogadores não poderão mais responder nem escrever.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:open,p_closed:true});if(error)onError(error.message);else onSave();}}>Fechar Missiva {open}</Button>}<input type="number" min={1} style={{width:140}} value={roundNumber} onChange={e=>setRoundNumber(e.target.value)} placeholder={`Nº (ex.: ${(numbers[0]??0)+1})`} aria-label="Número da missiva a abrir"/><Button variant="outline" onClick={async()=>{const n=Number(roundNumber||(numbers[0]??0)+1);const preview=data.letters.filter(l=>l.delivery_week===n&&l.publication_state==='scheduled');const responses=data.replies.filter(r=>r.delivery_week===n&&r.publication_state==='scheduled');if(!confirm(`Abrir Semana ${n}? ${preview.length} mensagens e ${responses.length} respostas serão liberadas. Destinatários: ${preview.map(l=>houseName(l.recipient_house_id)||'Jogador autorizado').join(', ')||'Nenhuma nova mensagem'}. A semana anterior será encerrada.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:n,p_closed:false});if(error)onError(error.message);else{setRoundNumber('');onSave();}}}>Abrir missiva</Button></div>
        {compose&&<WriteLetter data={data} onSave={onSave}/>}</>}
      {filters.box!=='enviadas'&&<><div className="campaign-heading"><h2>{filters.box==='excluidas'?'Missivas excluídas':'Missivas recebidas'}</h2><span>{groups.reduce((n,g)=>n+g.letters.length,0)} missivas</span></div>
      {groups.length===0&&<p className="campaign-empty">Nenhuma missiva encontrada.</p>}
      {groups.map(group=><section key={group.number??'sem-numero'} id={group.number!==null?'grupo-missiva-'+group.number:undefined} className="campaign-mail-group">{group.number!==null&&<h3 className="campaign-letter-number">Missiva {group.number}{data.rounds.find(r=>r.number===group.number)?.closed?' · fechada':''}</h3>}{group.letters.map(letter=>card(letter,isRecipient(letter)||data.admin))}</section>)}</>}
      {filters.box!=='recebidas'&&<><div className="campaign-heading"><h2>Missivas enviadas por você</h2><span>{mine.length} missivas</span></div>
      {mine.length===0&&<p className="campaign-empty">Nenhuma missiva enviada encontrada.</p>}
      {mine.map(letter=>card(letter,data.admin))}</>}
      {!data.admin&&<NewLetter key={draft?.key??0} data={data} myHouses={myHouses} initial={draft} onSave={onSave}/>}
    </div>
  </div>;
}

function NewLetter({data,myHouses,initial,onSave}:{data:Panel;myHouses:string[];initial:{subject:string;content:string}|null;onSave:()=>void}){
  const [images,setImages]=useState<PendingImage[]>([]);
  const [busy,setBusy]=useState(false),[msg,setMsg]=useState('');const key=useRef<string|null>(null);
  const houses=data.houses.filter(h=>h.active&&h.season===2&&!myHouses.includes(h.id));
  const currentWeek=data.rounds.find(r=>r.status==='open')?.number??null;
  return <details className="campaign-add" id="nova-missiva" open={Boolean(initial)}><summary>Escrever nova missiva</summary><form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget;const f=new FormData(form);setBusy(true);setMsg('');key.current??=crypto.randomUUID();let richContent;try{richContent=await uploadImages(String(f.get('content')),images,key.current);}catch(err){setMsg(err instanceof Error?err.message:'Falha na imagem.');setBusy(false);return;}const to=String(f.get('to'));const savingDraft=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';const {error}=await supabase.rpc(savingDraft?'save_letter_draft':'player_send_letter_to',savingDraft?{p_id:key.current,p_house:(to||null) as unknown as string,p_subject:String(f.get('subject')),p_content:richContent,p_week:currentWeek as unknown as number}:{p_subject:String(f.get('subject')),p_content:richContent,p_house:to||null as unknown as string,p_key:key.current});setBusy(false);if(error){setMsg(error.message);return;}key.current=null;form.reset();setImages([]);setMsg(savingDraft?'Rascunho salvo.':to?'Missiva enviada à casa. O Narrador também pode lê-la.':'Missiva enviada ao Narrador.');onSave();}}>
    <label>Destinatário<select name="to" defaultValue=""><option value="">Narrador</option>{houses.map(h=><option key={h.id} value={h.id}>Casa {h.name}</option>)}</select></label>
    <p className="text-muted-foreground text-sm">Missivas entre casas são sempre visíveis ao Narrador.</p>
    <label>Assunto<input name="subject" required defaultValue={initial?.subject}/></label><label>Missiva<textarea name="content" required rows={8} defaultValue={initial?.content}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><p>{currentWeek?`Esta mensagem será entregue na Semana ${currentWeek}.`:'Sem semana aberta: você pode salvar um rascunho.'}</p><div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy}>Salvar rascunho</Button><Button disabled={busy||currentWeek===null}>{busy?'Enviando…':'Enviar missiva'}</Button></div><p role="status">{msg}</p></form></details>;
}

function LetterEdit({letter,onSave}:{letter:LetterRow;onSave:()=>void}){
  const [open,setOpen]=useState(false),[subject,setSubject]=useState(letter.subject),[content,setContent]=useState(letter.content),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [images,setImages]=useState<PendingImage[]>([]);
  const {data:versions=[]}=useQuery({queryKey:['letter-versions',letter.id,letter.version],enabled:open,queryFn:async()=>{const r=await supabase.from('letter_versions').select('*').eq('letter_id',letter.id).order('version',{ascending:false});if(r.error)throw r.error;return r.data??[];}});
  if(!open)return <Button variant="outline" onClick={()=>{setSubject(letter.subject);setContent(letter.content);setOpen(true);}}>Editar missiva</Button>;
  return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const rich=await uploadImages(content,images,crypto.randomUUID());const result=await supabase.rpc(letter.publication_state==='draft'?'edit_letter_draft':'edit_campaign_letter',{p_id:letter.id,p_version:letter.version??1,p_subject:subject,p_content:rich});if(result.error)throw result.error;setOpen(false);setImages([]);onSave();}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível salvar.');}finally{setBusy(false);}}}><label>Assunto<input required value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>Missiva<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button disabled={busy}>Salvar nova versão</Button><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button></div><details><summary>Histórico de versões</summary>{versions.map(v=><div key={v.id}><strong>Versão {v.version}</strong><CampaignContent content={typeof v.snapshot==='object'&&v.snapshot&&'content' in v.snapshot?String(v.snapshot['content']):''}/></div>)}</details><p role="status">{message}</p></form>;
}

function ReplyDraftEdit({answer,onSave}:{answer:Panel['replies'][number];onSave:()=>void}){
 const [editing,setEditing]=useState(false),[content,setContent]=useState(answer.content),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!editing)return <Button size="sm" variant="outline" onClick={()=>{setContent(answer.content);setEditing(true);}}>Editar rascunho</Button>;
 return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);const r=await supabase.rpc('save_weekly_reply_draft',{p_id:answer.id,p_letter:answer.letter_id,p_reply:(answer.reply_to_id===answer.letter_id?null:answer.reply_to_id) as unknown as string,p_content:content});setBusy(false);if(r.error)setError(r.error.message);else{setEditing(false);onSave();}}}><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><Button disabled={busy}>Salvar rascunho</Button><Button type="button" variant="outline" onClick={()=>{if(content===answer.content||confirm('Descartar alterações não salvas?'))setEditing(false);}}>Cancelar</Button><p role="status">{error}</p></form>;
}
