import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {CampaignContent} from '@/components/campaign-content';
import {MailComposer,replaceMailDraft} from '@/components/players/mail-compose';
import {NarratorMailNotes} from '@/components/players/narrator-mail-notes';
import {LetterConsequences,type LetterConsequenceRow} from '@/components/players/letter-consequences';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,formatCampaignPeriod} from '@/lib/calendar/harptos';
import {datedMail} from '@/lib/calendar/mail';
import type {Panel} from '@/components/players/panel-data';
import {
  buildConversations,conversationUnread,queueMembers,
  type MailRow,type ReplyRow,type Conversation,type QueueId,
} from './chancelaria-model';
import './chancelaria.css';

/**
 * Chancelaria de Missivas (protótipo v4) ligada ao Firebase.
 * Filas de trabalho, lista e leitura lado a lado, leitura que só conta
 * quando marcada, resposta, edição e cancelamento enquanto a semana estiver
 * aberta e as ferramentas do Narrador. Toda permissão é do servidor.
 */
const loose=(name:string,args:Record<string,unknown>)=>
  (supabase.rpc as unknown as (this:unknown,n:string,a:Record<string,unknown>)=>
    PromiseLike<{data:unknown;error:{message:string}|null}>).call(supabase,name,args);
type MailPage={total:number;letters:MailRow[];replies:ReplyRow[]};
async function allMail(trash:boolean):Promise<MailPage>{
  const page=async(n:number)=>{
    const r=await loose(trash?'mail_trash_page':'mail_page',{p_filters:{},p_page:n,p_size:50});
    if(r.error)throw Error(r.error.message);
    return r.data as MailPage;
  };
  const first=await page(0);
  const count=Math.min(Math.ceil(first.total/50),200);
  const rest=await Promise.all(Array.from({length:Math.max(count-1,0)},(_,i)=>page(i+1)));
  const pages=[first,...rest];
  return {total:first.total,letters:pages.flatMap(p=>p.letters),replies:pages.flatMap(p=>p.replies)};
}
const GROUP_OPTIONS:[string,string][]=[['','Ambos'],...NARRATION_GROUPS.map(g=>[g.id,g.label] as [string,string])];
const QUEUE_TEXT:Record<QueueId,[string,string]>={
  attention:['Precisa de atenção','Cartas ou respostas novas para você'],
  yourturn:['Sua vez','A última palavra não é sua'],
  waiting:['Aguardando outros','Você escreveu por último'],
  mediation:['Mediação','Cartas entre Casas (acompanhamento)'],
  scheduled:['Programadas','Saem quando a semana delas abrir'],
  drafts:['Rascunhos','Ainda não enviadas'],
  trash:['Lixeira','Canceladas ou excluídas, com restauração'],
  all:['Todas','Tudo o que você pode ler'],
};

export function ChancelariaMissivas({data,me,onSave,onError,onManage,onClassic}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;onClassic?:(()=>void)|undefined;
}){
  const qc=useQueryClient();
  const admin=data.admin,uid=data.user.id;
  const [queue,setQueue]=useState<QueueId>('attention');
  const [selected,setSelected]=useState<string|null>(null);
  const [pane,setPane]=useState<'list'|'reader'>('list');
  const [search,setSearch]=useState('');
  const [group,setGroup]=useState('');
  const [house,setHouse]=useState('');
  const [week,setWeek]=useState('');
  const [timeline,setTimeline]=useState(false);
  const [compose,setCompose]=useState<{subject:string;content:string}|null|false>(false);
  const [message,setMessage]=useState('');
  const {data:clock}=useCampaignTime();
  const today=clock?dateKey(clock):'';
  const openRound=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const mail=useQuery({queryKey:['chancelaria-mail',uid],queryFn:()=>allMail(false),refetchInterval:30000});
  const trash=useQuery({queryKey:['chancelaria-trash',uid],queryFn:()=>allMail(true),enabled:queue==='trash'});
  const myHouses=useMemo(()=>new Set(data.members.filter(m=>m.player_id===me?.id).map(m=>m.house_id)),[data.members,me?.id]);
  const editHouses=useMemo(()=>new Set(data.members.filter(m=>m.player_id===me?.id&&
    m.can_edit).map(m=>m.house_id)),[data.members,me?.id]);
  const houseName=(id:string|null|undefined)=>id?data.houses.find(h=>h.id===id)?.name??'Casa':'Narrador';
  const conversations=useMemo(()=>buildConversations(mail.data?.letters??[],mail.data?.replies??[]),[mail.data]);
  const trashConversations=useMemo(()=>buildConversations(trash.data?.letters??[],trash.data?.replies??[]),[trash.data]);
  const ctx={uid,admin,receipts:data.receipts,openRound,editHouses};
  const groupHouses=group?new Set(narrationHouseIds(group,data.houses.map(h=>h.id))):null;
  const inScope=(c:Conversation)=>{
    const ids=[c.root.origin_house_id,c.root.recipient_house_id].filter(Boolean) as string[];
    if(groupHouses&&!ids.some(id=>groupHouses.has(id)))return false;
    if(house&&!ids.includes(house))return false;
    if(week&&String(c.root.delivery_week??'')!==week)return false;
    if(search.trim()){
      const q=search.trim().toLowerCase();
      const hay=[c.root.subject,c.root.content,c.root.sender_name,...c.items.map(i=>i.content+' '+(i.author??''))].join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  };
  const base=conversations.filter(inScope);
  const queues:QueueId[]=admin?['attention','yourturn','mediation','scheduled','drafts','trash','all']
    :['attention','yourturn','waiting','scheduled','drafts','trash','all'];
  const members=(q:QueueId)=>q==='trash'?trashConversations.filter(inScope):queueMembers(q,base,ctx);
  const list=members(queue).slice().sort((a,b)=>
    timeline?(a.root.delivery_week??0)-(b.root.delivery_week??0)||a.root.created_at.localeCompare(b.root.created_at)
      :Number(conversationUnread(b,ctx))-Number(conversationUnread(a,ctx))||b.lastAt.localeCompare(a.lastAt));
  const current=list.find(c=>c.root.id===selected)??null;
  useEffect(()=>{
    if(!current&&list[0]&&window.innerWidth>=1000)setSelected(list[0].root.id);
  },[queue,list.length]);// eslint-disable-line react-hooks/exhaustive-deps
  const refresh=()=>{
    void qc.invalidateQueries({queryKey:['chancelaria-mail']});
    void qc.invalidateQueries({queryKey:['chancelaria-trash']});
    void qc.invalidateQueries({queryKey:['letter-consequences']});
    onSave();
  };
  const run=async(label:string,work:()=>PromiseLike<{error:{message:string}|null}>)=>{
    setMessage('');
    const r=await work();
    if(r.error){onError(r.error.message);setMessage(r.error.message);}
    else{setMessage(label);refresh();}
  };
  const markRead=(c:Conversation)=>run('Marcada como lida.',async()=>{
    for(const id of c.unreadLetterIds(ctx)){
      const r=await loose('mark_letter_read',{p_id:id});
      if(r.error&&!/23505/.test(r.error.message))return r;
    }
    return {error:null};
  });
  const markUnread=(c:Conversation)=>run('Marcada como não lida.',()=>loose('mark_letter_unread',{p_id:c.lastIncomingLetterId(uid)??c.root.id}));
  const weeks=[...new Set(conversations.map(c=>c.root.delivery_week).filter((n):n is number=>typeof n==='number'))].sort((a,b)=>a-b);
  if(mail.isPending)return <section className="chancelaria"><p role="status">Carregando a Chancelaria…</p></section>;
  if(mail.error)return <section className="chancelaria"><p role="alert">Não foi possível carregar as missivas. {mail.error.message}</p>
    <button type="button" className="ch-btn" onClick={()=>void mail.refetch()}>Tentar novamente</button></section>;
  return <section className={'chancelaria'+(pane==='reader'?' ch-reading':'')} aria-label="Chancelaria de Missivas">
    <header className="ch-top">
      <div><div className="ch-sub">{openRound?`Semana ${openRound} aberta`:'Sem semana aberta'}{clock?' · '+formatCampaignPeriod(clock):''}</div>
        <h2>Chancelaria de Missivas</h2></div>
      <div className="ch-actions">
        <span className="ch-badge">{admin?'Narrador':'Casa '+[...myHouses].map(houseName).join(', ')}</span>
        {admin&&<a className="ch-btn" href="/firebase-hub">⏭ Abrir semana no HUB</a>}
        <button type="button" className="ch-btn primary" onClick={()=>{if(replaceMailDraft(uid))setCompose(null);}}>🪶 Nova missiva</button>
        {onClassic&&<button type="button" className="ch-btn" onClick={onClassic}>Visão clássica</button>}
      </div>
    </header>
    <div className="ch-toolbar">
      {admin?<div className="ch-seg" role="group" aria-label="Grupo de narração">
        {GROUP_OPTIONS.map(([id,label])=>
          <button type="button" key={id} aria-pressed={group===id} className={group===id?'on':''}
            onClick={()=>{setGroup(id);setHouse('');}}>{label}</button>)}
      </div>:<span className="ch-muted">Você só vê cartas da sua Casa e as gerais do seu grupo.</span>}
      {admin&&<label className="ch-inline">Casa<select value={house} onChange={e=>setHouse(e.target.value)}>
        <option value="">Todas</option>
        {data.houses.filter(h=>h.active&&(!groupHouses||groupHouses.has(h.id))).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
      </select></label>}
      <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar em cartas e respostas" aria-label="Buscar"/>
      <label className="ch-inline">Semana<select value={week} onChange={e=>setWeek(e.target.value)}>
        <option value="">Todas</option>{weeks.map(w=><option key={w} value={String(w)}>Semana {w}</option>)}</select></label>
      <button type="button" className="ch-btn" aria-pressed={timeline} onClick={()=>setTimeline(t=>!t)}>{timeline?'📋 Escrivaninha':'🕰️ Linha do tempo'}</button>
    </div>
    <nav className="ch-queues" aria-label="Filas">
      {queues.map(q=>{const n=members(q).length;return <button type="button" key={q} aria-pressed={queue===q}
        className={'ch-queue'+(queue===q?' on':'')} onClick={()=>{setQueue(q);setPane('list');setSelected(null);}}>
        <span className="ch-q-title">{QUEUE_TEXT[q][0]}</span>
        <span className={'ch-q-count'+(q==='attention'&&n?' hot':'')}>{q==='trash'&&!trash.data?'…':n}</span>
        <span className="ch-q-desc">{QUEUE_TEXT[q][1]}</span></button>;})}
    </nav>
    <p className="ch-note">Mostrando <b>{list.length}</b> conversa(s). <b>A leitura só conta quando você marca.</b> {message&&<span role="status">{message}</span>}</p>
    <div className="ch-ws">
      <div className="ch-list" role="list">
        {list.length===0&&<p className="ch-empty">Nada nesta fila.</p>}
        {list.map(c=>{const unread=conversationUnread(c,ctx);return <div key={c.root.id} role="listitem"
          className={'ch-item'+(c.root.id===selected?' sel':'')+(unread?' unread':'')}>
          <button type="button" className="ch-item-open" onClick={()=>{setSelected(c.root.id);setPane('reader');}}>
            <span className="ch-item-top">
              <span className={'ch-kind '+c.kind}>{c.kindLabel}</span>
              <span className="ch-muted">Sem. {c.root.delivery_week??'?'}</span>
              {c.root.publication_state==='scheduled'&&<span className="ch-tag sched">⏳ Programada</span>}
              {c.root.publication_state==='draft'&&<span className="ch-tag sched">Rascunho</span>}
              {unread&&<span className="ch-tag new">Nova</span>}
              {c.items.length>0&&<span className="ch-muted">{c.items.length} resp.</span>}
            </span>
            <span className="ch-item-title">{c.root.subject}</span>
            <span className="ch-item-meta">{c.root.sender_name} · {houseName(c.root.origin_house_id)} → {houseName(c.root.recipient_house_id)}</span>
          </button>
          {queue!=='trash'&&<button type="button" className="ch-readtoggle" aria-label={unread?'Marcar como lida':'Marcar como não lida'}
            title={unread?'Marcar como lida':'Marcar como não lida'} onClick={()=>void(unread?markRead(c):markUnread(c))}>{unread?'✉':'📭'}</button>}
        </div>;})}
      </div>
      <div className="ch-reader">
        {current?<Reader c={current} data={data} uid={uid} admin={admin} today={today} openRound={openRound}
          editHouses={editHouses} houseName={houseName} trashMode={queue==='trash'} ctx={ctx}
          onBack={()=>setPane('list')} onRead={()=>void markRead(current)} onUnread={()=>void markUnread(current)}
          onForward={()=>{if(replaceMailDraft(uid))setCompose({subject:'Enc.: '+current.root.subject,
            content:`\n\n--- Missiva encaminhada ---\nDe: ${current.root.sender_name}\nAssunto: ${current.root.subject}\n\n${current.root.content}`});}}
          onDone={refresh} onError={(m)=>{onError(m);setMessage(m);}}/>
          :<p className="ch-empty">Selecione uma missiva.</p>}
      </div>
    </div>
    {compose!==false&&<div className="ch-modal" role="dialog" aria-modal="true" aria-label="Nova missiva">
      <div className="ch-sheet"><div className="ch-sheet-h"><span>🪶 Nova missiva</span>
        <button type="button" className="ch-btn" onClick={()=>setCompose(false)}>✕ Fechar</button></div>
        <div className="ch-sheet-b"><MailComposer key={compose?compose.subject:'nova'} data={data} me={me} initial={compose}
          onSave={()=>{setCompose(false);refresh();}} onManage={onManage}/></div></div></div>}
  </section>;
}

function Reader({c,data,uid,admin,today,openRound,editHouses,houseName,trashMode,ctx,onBack,onRead,onUnread,onForward,onDone,onError}:{
  c:Conversation;data:Panel;uid:string;admin:boolean;today:string;openRound:number|null;editHouses:Set<string>;
  houseName:(id:string|null|undefined)=>string;trashMode:boolean;ctx:Parameters<typeof conversationUnread>[1];
  onBack:()=>void;onRead:()=>void;onUnread:()=>void;onForward:()=>void;onDone:()=>void;onError:(m:string)=>void;
}){
  const unread=conversationUnread(c,ctx);
  // Rascunho da resposta guardado por conversa nesta aba: trocar de carta,
  // atualizar a lista ou uma falha de envio não apagam o texto.
  const draftKey=`chancelaria:resposta:${uid}:${c.root.id}`;
  const readDraft=()=>{try{return sessionStorage.getItem(draftKey)??'';}catch{return '';}};
  const [reply,setReplyState]=useState(readDraft);const [signed,setSigned]=useState('');
  const setReply=(value:string)=>{setReplyState(value);
    try{if(value)sessionStorage.setItem(draftKey,value);else sessionStorage.removeItem(draftKey);}catch{/* só em memória */}};
  const [busy,setBusy]=useState(false);const [key,setKey]=useState(()=>crypto.randomUUID());
  const [editing,setEditing]=useState<MailRow|null>(null);const [editText,setEditText]=useState('');const [editSubject,setEditSubject]=useState('');
  const [confirmCancel,setConfirmCancel]=useState<string|null>(null);
  useEffect(()=>{setReplyState(readDraft());setEditing(null);setConfirmCancel(null);setKey(crypto.randomUUID());},[c.root.id]);// eslint-disable-line react-hooks/exhaustive-deps
  const consequences=useQuery({queryKey:['letter-consequences',uid,c.root.id],enabled:!trashMode,queryFn:async()=>{
    const r=await supabase.from('campaign_letter_consequences').select('id,letter_id,house_id,changes,active,created_at').eq('letter_id',c.root.id);
    if(r.error)throw r.error;return (r.data??[]) as LetterConsequenceRow[];
  }});
  const target=c.replyTarget(uid,admin,editHouses);
  const own=(m:MailRow)=>m.sender_user_id===uid&&m['source']==='firebase-cloud';
  const pending=(m:MailRow)=>m.publication_state==='draft'||m.publication_state==='scheduled';
  const editable=(m:MailRow)=>own(m)&&!m.deleted_at&&(pending(m)||(openRound!==null&&(m.delivery_week??0)>=openRound));
  const act=async(work:()=>PromiseLike<{error:{message:string}|null}>):Promise<boolean>=>{
    setBusy(true);const r=await work();setBusy(false);
    if(r.error){onError(r.error.message);return false;}
    onDone();return true;
  };
  const sendReply=async(draft:boolean)=>{
    if(!target||!reply.trim())return;
    if(!today){onError('Data oficial da campanha indisponível.');return;}
    const ok=await act(()=>draft
      ?datedMail('save_weekly_reply_draft',{p_id:key,p_letter:target,p_reply:null,p_content:reply,p_signed_by:admin?signed.trim()||null:null},today)
      :datedMail('reply_weekly_message',{p_letter:target,p_reply:null,p_content:reply,p_key:key,p_draft:false,p_signed_by:admin?signed.trim()||null:null},today));
    if(!ok)return;
    setReply('');setKey(crypto.randomUUID());
  };
  const statusBar=(m:MailRow)=>{
    if(trashMode)return m.deleted_at?<div className="ch-status trash"><span>🗑 {m['removal_kind']==='cancelada'?'Envio cancelado':'Excluída'} em {new Date(m.deleted_at).toLocaleString('pt-BR')}.</span>
      {(admin||(own(m)&&m['removal_kind']==='cancelada'))&&<button type="button" className="ch-btn small primary" disabled={busy}
        onClick={()=>void act(()=>loose('restore_campaign_letter',{p_id:m.id}))}>↺ Restaurar</button>}</div>:null;
    const parts=[];
    if(m.publication_state==='scheduled')parts.push(<span key="s">⏳ Programada para a <b>Semana {m.delivery_week}</b>. Só você e o Narrador a veem até a abertura.</span>);
    if(m.publication_state==='draft')parts.push(<span key="d">Rascunho: ninguém recebeu ainda.</span>);
    if(editable(m)){
      parts.push(<button key="e" type="button" className="ch-btn small" onClick={()=>{setEditing(m);setEditText(m.content);setEditSubject(m.subject);}}>✏️ Editar envio</button>);
      if(m.publication_state==='draft')parts.push(<button key="p" type="button" className="ch-btn small primary" disabled={busy}
        onClick={()=>void act(()=>loose('schedule_letter_draft',{p_id:m.id,p_week:m.delivery_week??openRound}))}>✉ Enviar agora</button>);
      parts.push(confirmCancel===m.id?<span key="c" className="ch-row"><b>Cancelar este envio para todos?</b>
        <button type="button" className="ch-btn small wax" disabled={busy} onClick={()=>void act(()=>loose('delete_campaign_letter',{p_id:m.id}))}>Sim, cancelar</button>
        <button type="button" className="ch-btn small" onClick={()=>setConfirmCancel(null)}>Não</button></span>
        :<button key="c" type="button" className="ch-btn small wax" onClick={()=>setConfirmCancel(m.id)}>✕ Cancelar envio</button>);
      parts.push(<span key="m" className="ch-muted">{pending(m)?'Possível até a entrega.':`Possível enquanto a Semana ${openRound} estiver aberta.`}</span>);
    }else if(admin&&!m.deleted_at&&m['source']==='firebase-cloud'&&!own(m)){
      parts.push(confirmCancel===m.id?<span key="x" className="ch-row"><b>Excluir para todos?</b>
        <button type="button" className="ch-btn small wax" disabled={busy} onClick={()=>void act(()=>loose('delete_campaign_letter',{p_id:m.id}))}>Excluir</button>
        <button type="button" className="ch-btn small" onClick={()=>setConfirmCancel(null)}>Não</button></span>
        :<button key="x" type="button" className="ch-btn small" onClick={()=>setConfirmCancel(m.id)}>🗑 Excluir (moderação)</button>);
    }
    if(own(m)&&m.publication_state==='delivered'&&!m.deleted_at)
      parts.push(<span key="r" className={'ch-pill'+(m['recipient_read']?' ok':'')}>{m['recipient_read']?'✓✓ lida pelo destinatário':'✓ entregue'}</span>);
    return parts.length?<div className="ch-status">{parts}</div>:null;
  };
  const editForm=(m:MailRow)=><form className="ch-form" onSubmit={e=>{e.preventDefault();
    void act(()=>datedMail('edit_campaign_letter',{p_id:m.id,p_version:(m['version'] as number)??1,p_subject:editSubject,p_content:editText},(m['campaign_date'] as string|null|undefined)??''))
      .then(ok=>{if(ok)setEditing(null);});}}>
    <b>✏️ Editando o envio</b><span className="ch-muted">Quem já leu verá "Editada"; a versão anterior fica no histórico.</span>
    {!m['conversation_id']||m['conversation_id']===m.id?<label>Assunto<input value={editSubject} onChange={e=>setEditSubject(e.target.value)} required/></label>:null}
    <label>Texto<textarea rows={8} value={editText} onChange={e=>setEditText(e.target.value)} required/></label>
    <div className="ch-row"><button type="button" className="ch-btn" onClick={()=>setEditing(null)}>Descartar</button>
      <button type="submit" className="ch-btn primary" disabled={busy}>Salvar nova versão</button></div>
  </form>;
  return <article className="ch-card" aria-labelledby="ch-reader-title">
    <div className="ch-back"><button type="button" className="ch-btn" onClick={onBack}>← Voltar</button></div>
    <div className="ch-badges"><span className={'ch-kind '+c.kind}>{c.kindLabel}</span>
      <span className="ch-pill">Semana {c.root.delivery_week??'?'}</span>
      {c.root['campaign_date']?<span className="ch-pill">{formatDate(c.root['campaign_date'] as string)}</span>:null}
      {c.root['edited_at']?<span className="ch-pill">Editada</span>:null}
      <span className="ch-spacer"/>
      {!trashMode&&(unread?<button type="button" className="ch-btn small primary" onClick={onRead}>✓ Marcar como lida</button>
        :<button type="button" className="ch-btn small" onClick={onUnread}>📭 Marcar como não lida</button>)}
      {!trashMode&&!admin&&c.root.publication_state==='delivered'&&<button type="button" className="ch-btn small" onClick={onForward}>↪ Encaminhar</button>}
    </div>
    {statusBar(c.root)}
    {editing?.id===c.root.id?editForm(c.root):<>
      <h3 id="ch-reader-title">{c.root.subject}</h3>
      <div className="ch-meta"><span><b>De:</b> {c.root.sender_name} ({houseName(c.root.origin_house_id)})</span>
        <span><b>Para:</b> {houseName(c.root.recipient_house_id)}</span>
        {c.root['historical_source']?<span className="ch-muted">Arquivo histórico</span>:null}</div>
      {c.root.court_member_id||c.root.military_unit_id?<div className="ch-links">
        {c.root.court_member_id&&<span className="ch-pill">👤 Corte vinculada</span>}
        {c.root.military_unit_id&&<span className="ch-pill">⚔️ Unidade vinculada</span>}</div>:null}
      <div className="ch-body"><CampaignContent content={c.root.content}/></div></>}
    <section className="ch-thread" aria-label="Fio de respostas"><h4>Fio de respostas ({c.items.length})</h4>
      {c.items.length===0&&<p className="ch-muted">Nenhuma resposta ainda.</p>}
      {c.items.map(i=><div key={i.id} className={'ch-reply'+(i.mine(uid)?' mine':'')+(i.isNewFor(ctx)?' new':'')}>
        <div className="ch-reply-h"><b>{i.author}</b>{i.isNewFor(ctx)&&<span className="ch-tag new">Nova</span>}
          <span className="ch-spacer"/><span className="ch-muted">{i.at?new Date(i.at).toLocaleString('pt-BR'):''}</span></div>
        {i.letter&&editing?.id===i.letter.id?editForm(i.letter):<div className="ch-body small"><CampaignContent content={i.content}/></div>}
        {i.letter&&!editing&&statusBar(i.letter)}
      </div>)}
    </section>
    {!trashMode&&(target?<form className="ch-form" onSubmit={e=>{e.preventDefault();void sendReply(false);}}>
      <b>{admin?'Responder como Narrador':'Responder'}</b>
      {admin&&<label>Assinado por (NPC ou cargo)<input maxLength={120} value={signed} onChange={e=>setSigned(e.target.value)} placeholder="Ex.: Vetrus, Intendente"/></label>}
      <textarea rows={5} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Escreva sua resposta ou ordem…" aria-label="Texto da resposta"/>
      <div className="ch-row"><button type="button" className="ch-btn" disabled={busy||!reply.trim()} onClick={()=>void sendReply(true)}>Salvar rascunho</button>
        <button type="submit" className="ch-btn primary" disabled={busy||!reply.trim()}>✉ Enviar resposta</button></div>
    </form>:<div className="ch-readonly">{c.root['historical_source']||(openRound!==null&&(c.root.delivery_week??0)<openRound)
      ?'Semana encerrada: o fio fica para consulta.'
      :admin&&c.kind==='entre'?'Carta entre Casas: o Narrador acompanha e registra, mas não entra no fio.'
      :'Nada a responder aqui no momento.'}</div>)}
    {admin&&!trashMode&&<>
      <NarratorMailNotes letterId={c.root.id} userId={uid}/>
      <LetterConsequences letterId={c.root.id} admin houses={data.houses.filter(h=>h.active).map(h=>({id:h.id,name:h.name}))}
        suggestedHouse={c.root.origin_house_id??c.root.recipient_house_id??''} items={consequences.data??[]}
        onSaved={onDone} onError={onError}/>
    </>}
    {!admin&&(consequences.data??[]).filter(x=>x.active).length>0&&<LetterConsequences letterId={c.root.id} admin={false}
      houses={[]} suggestedHouse="" items={consequences.data??[]} onSaved={onDone} onError={onError}/>}
  </article>;
}
