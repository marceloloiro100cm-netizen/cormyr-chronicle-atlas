import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {CampaignContent,ImagePicker,uploadImages,type PendingImage} from '@/components/campaign-content';
import {DesdiaDateBar} from '@/components/calendar/desdia-date-bar';
import {MailComposer,replaceMailDraft} from '@/components/players/mail-compose';
import {ChancelariaReplyComposer,type ReplySubmitPayload} from './ChancelariaReplyComposer';
import {copyTextToClipboard,formatConversationForAI} from './copy-thread';
import {loadRecentSignatures,rememberSignature,resolveLinkNames,useMailLinkCatalog} from '@/lib/mail/link-labels';
import {NarratorMailNotes} from '@/components/players/narrator-mail-notes';
import {LetterConsequences,type LetterConsequenceRow} from '@/components/players/letter-consequences';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,formatCampaignPeriod} from '@/lib/calendar/harptos';
import {datedMail} from '@/lib/calendar/mail';
import {mailWeekTimeline,replyDeliveryWeek} from '@/lib/weekly-delivery';
import type {Panel} from '@/components/players/panel-data';
import {isPlainLeftClick,readUrlParam,setUrlParams,urlLinkProps,useUrlParam,useUrlSearch} from '@/lib/navigation/url-state';
import {HouseMark,Icon,NARRATOR_DRAWER_CONTEXT,NARRATOR_NARROW,narrationGroupOf,useMedia} from '@/components/players/narrator/narrator-ui';
import {
  buildConversations,conversationUnread,lastAuthor,queueMembers,
  type MailRow,type ReplyRow,type Conversation,type QueueId,type QueueContext,
} from './chancelaria-model';
import './chancelaria-narrador.css';

/**
 * Chancelaria de Missivas na visão do Narrador (layout v5): pastas à esquerda,
 * lista e leitura lado a lado e escrita no lugar do leitor (sem Hub Temporal
 * em miniatura nem painel de contexto, decisão de 20/11/2026). Usa as mesmas RPCs e o mesmo modelo de filas da Chancelaria v4;
 * toda permissão continua no servidor.
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
export const NARRATOR_QUEUES:QueueId[]=['attention','yourturn','waiting','mediation','scheduled','drafts','trash','all'];
const QUEUE_TEXT:Record<QueueId,[string,string,string]>={
  attention:['Precisa de atenção','Cartas ou respostas novas para você','alert'],
  yourturn:['Sua vez','A última palavra não é sua','reply'],
  waiting:['Aguardando outros','Você escreveu por último','wait'],
  mediation:['Mediação','Cartas entre Casas (acompanhamento)','scale'],
  scheduled:['Programadas','Saem quando a semana delas abrir','hour'],
  drafts:['Rascunhos','Ainda não enviadas','file'],
  trash:['Lixeira','Canceladas ou excluídas, com restauração','trash'],
  all:['Todas','Tudo o que você pode ler','inbox'],
};
/** Texto corrido para a prévia da lista (sem marcação de imagem ou link). */
const plain=(text:string)=>text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#*_>`]/g,'').replace(/\s+/g,' ').trim();
const str=(value:unknown)=>typeof value==='string'&&value?value:null;
type Compose={subject:string;content:string}|null|false;

export function ChancelariaNarrador({data,me,onSave,onError,onManage,onOpenHub,initialHouse}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;onOpenHub?:(()=>void)|undefined;
  initialHouse?:string|undefined;
}){
  const qc=useQueryClient();
  const admin=data.admin,uid=data.user.id;
  const narrow=useMedia(NARRATOR_NARROW);
  const drawerContext=useMedia(NARRATOR_DRAWER_CONTEXT);
  // Pasta e carta abertas ficam no endereço (?pasta=mediation&carta=...):
  // cada pasta e cada carta podem ser abertas em nova guia.
  const defaultQueue:QueueId=initialHouse?'all':'attention';
  const [queueParam]=useUrlParam('pasta',defaultQueue);
  const queue:QueueId=queueParam in QUEUE_TEXT?queueParam as QueueId:defaultQueue;
  const setQueue=(q:QueueId)=>setUrlParams({pasta:q===defaultQueue?null:q,carta:null});
  const [selectedParam]=useUrlParam('carta','');
  const selected=selectedParam||null;
  const setSelected=(id:string|null,replace=false)=>setUrlParams({carta:id},{replace});
  useUrlSearch();
  const [pane,setPane]=useState<'list'|'reader'|'compose'>(()=>readUrlParam('carta')?'reader':'list');
  const [search,setSearch]=useState('');
  const [group,setGroup]=useState<string>(()=>initialHouse?narrationGroupOf(initialHouse)?.id??'':'');
  const [house,setHouse]=useState(initialHouse??'');
  const [week,setWeek]=useState('');
  const [timeline,setTimeline]=useState(false);
  const [compose,setCompose]=useState<Compose>(false);
  const [message,setMessage]=useState('');
  const [contextOpen,setContextOpen]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const {data:clock}=useCampaignTime();
  const today=clock?dateKey(clock):'';
  const openRound=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const mail=useQuery({queryKey:['chancelaria-mail',uid],queryFn:()=>allMail(false),refetchInterval:30000});
  const trash=useQuery({queryKey:['chancelaria-trash',uid],queryFn:()=>allMail(true),enabled:queue==='trash'});
  const editHouses=useMemo(()=>new Set(data.members.filter(m=>m.player_id===me?.id&&
    m.can_edit).map(m=>m.house_id)),[data.members,me?.id]);
  const houseOf=(id:string|null|undefined)=>id?data.houses.find(h=>h.id===id)??null:null;
  const houseName=(id:string|null|undefined)=>id?houseOf(id)?.name??'Casa':'Narrador';
  const conversations=useMemo(()=>buildConversations(mail.data?.letters??[],mail.data?.replies??[]),[mail.data]);
  const trashConversations=useMemo(()=>buildConversations(trash.data?.letters??[],trash.data?.replies??[]),[trash.data]);
  const ctx:QueueContext={uid,admin,receipts:data.receipts,openRound,editHouses};
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
  const members=(q:QueueId)=>q==='trash'?trashConversations.filter(inScope):queueMembers(q,base,ctx);
  const list=members(queue).slice().sort((a,b)=>
    timeline?(b.root.delivery_week??0)-(a.root.delivery_week??0)||b.lastAt.localeCompare(a.lastAt)
      :Number(conversationUnread(b,ctx))-Number(conversationUnread(a,ctx))||b.lastAt.localeCompare(a.lastAt));
  const current=list.find(c=>c.root.id===selected)??null;
  useEffect(()=>{
    if(!current&&list[0]&&!narrow&&compose===false)setSelected(list[0].root.id,true);
  },[queue,list.length,narrow]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),4500);return()=>clearTimeout(t);},[message]);
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
  const toggleRead=(c:Conversation)=>void(conversationUnread(c,ctx)?markRead(c):markUnread(c));
  const openCompose=(initial:{subject:string;content:string}|null=null)=>{
    if(!replaceMailDraft(uid))return;
    setCompose(initial);setPane('compose');setContextOpen(false);setFiltersOpen(false);
  };
  const closeCompose=()=>{setCompose(false);setPane(narrow?'list':'reader');};
  const select=(id:string)=>{
    setCompose(false);setPane('reader');
    if(!list.some(c=>c.root.id===id)){
      setUrlParams({pasta:defaultQueue==='all'?null:'all',carta:id});
      setGroup('');setHouse('');setWeek('');setSearch('');
    }else setSelected(id);
  };
  const pickQueue=(q:QueueId)=>{setQueue(q);setPane('list');setSelected(null);setCompose(false);};
  const resetFilters=()=>{setGroup('');setHouse('');setWeek('');setSearch('');};
  const weeks=[...new Set(conversations.map(c=>c.root.delivery_week).filter((n):n is number=>typeof n==='number'))].sort((a,b)=>a-b);
  const activeFilters=[group,house,week,search.trim()].filter(Boolean).length;
  const allLetters=mail.data?.letters??[],allReplies=mail.data?.replies??[];
  const nextWeek=(openRound??Math.max(0,...data.rounds.map(r=>r.number)))+1;
  const scheduledNext=allLetters.filter(m=>!m.deleted_at&&m.publication_state==='scheduled'&&m.delivery_week===nextWeek).length+
    allReplies.filter(r=>!r.deleted_at&&r.publication_state==='scheduled'&&r.delivery_week===nextWeek).length;

  // Atalhos de teclado (fora de campos de texto): j/k navegar, e lida, r responder, n nova, / buscar, Esc fechar.
  const keys=useRef({list,current,narrow,pane,compose,contextOpen,filtersOpen});
  keys.current={list,current,narrow,pane,compose,contextOpen,filtersOpen};
  const actions=useRef({select,toggleRead,openCompose,closeCompose});
  actions.current={select,toggleRead,openCompose,closeCompose};
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const k=keys.current,a=actions.current;
      if(document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]'))return;
      if(e.key==='Escape'){
        if(k.filtersOpen){setFiltersOpen(false);return;}
        if(k.contextOpen){setContextOpen(false);return;}
        if(k.compose!==false){a.closeCompose();return;}
        if(k.narrow&&k.pane!=='list'){setPane('list');return;}
        return;
      }
      const el=document.activeElement as HTMLElement|null;
      if(el&&(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable))return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      const i=k.list.findIndex(c=>c.root.id===k.current?.root.id);
      if(e.key==='j'||e.key==='k'){
        const next=k.list[Math.max(0,Math.min(k.list.length-1,i+(e.key==='j'?1:-1)))];
        if(next){e.preventDefault();a.select(next.root.id);}
      }else if(e.key==='e'&&k.current){e.preventDefault();a.toggleRead(k.current);}
      else if(e.key==='r'){const t=document.getElementById('chn-reply');if(t){e.preventDefault();t.focus();}}
      else if(e.key==='n'){e.preventDefault();a.openCompose();}
      else if(e.key==='/'){const s=document.getElementById('chn-search');if(s){e.preventDefault();setFiltersOpen(true);s.focus();}}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{if(current)document.querySelector('.chn-it[aria-current="true"]')?.scrollIntoView?.({block:'nearest'});},[current?.root.id]);// eslint-disable-line react-hooks/exhaustive-deps

  if(mail.isPending)return <section className="chn chn--status"><p role="status">Carregando a Chancelaria…</p></section>;
  if(mail.error)return <section className="chn chn--status"><p role="alert">Não foi possível carregar as missivas. {mail.error.message}</p>
    <button type="button" className="chn-btn" onClick={()=>void mail.refetch()}>Tentar novamente</button></section>;

  const queueCount=(q:QueueId)=>q==='trash'&&!trash.data?'…':String(members(q).length);
  const conversationHouses=(c:Conversation)=>[c.root.origin_house_id,c.root.recipient_house_id].filter((v,i,a):v is string=>Boolean(v)&&a.indexOf(v)===i);
  let lastSeparator:number|null|undefined;
  const items=list.map(c=>{
    const unread=conversationUnread(c,ctx);
    const mainHouse=houseOf(c.root.origin_house_id??c.root.recipient_house_id);
    const last=c.items.at(-1);
    const preview=plain(last?last.content:c.root.content);
    const lastUid=lastAuthor(c);
    const lastWho=c.items.length>0&&lastUid?(lastUid===uid?'você':last?.author??''):'';
    let separator:ReactNode=null;
    if(timeline&&c.root.delivery_week!==lastSeparator){lastSeparator=c.root.delivery_week;
      separator=<p className="chn-wsep">{c.root.delivery_week?`Semana ${c.root.delivery_week}`:'Sem semana'}</p>;}
    return <div key={c.root.id} role="listitem">{separator}
      <div className={'chn-it'+(unread?' chn-it--unread':'')} aria-current={c.root.id===current?.root.id?'true':undefined}>
        <a className="chn-it-open" href={urlLinkProps({carta:c.root.id}).href}
          onClick={e=>{if(!isPlainLeftClick(e))return;e.preventDefault();select(c.root.id);}}>
          <HouseMark house={c.kind==='geral'?null:mainHouse}/>
          <span className="chn-tags">
            {unread&&<span className="chn-udot" title="Não lida"/>}
            <span className={'chn-kind chn-kind--'+c.kind}>{c.kindLabel}</span>
            {c.root.publication_state==='scheduled'&&<span className="chn-chip chn-chip--sched">Programada · Sem. {c.root.delivery_week??'?'}</span>}
            {c.root.publication_state==='draft'&&<span className="chn-chip chn-chip--draft">Rascunho</span>}
            {c.root.deleted_at&&<span className="chn-chip chn-chip--cancel">{c.root['removal_kind']==='cancelada'?'Cancelada':'Excluída'}</span>}
            <span>Sem. {c.root.delivery_week??'?'}</span>
            <span>· {c.items.length>0?`${c.items.length} resp.`:'sem resposta'}</span>
          </span>
          <span className="chn-it-title">{c.root.subject}</span>
          <span className="chn-it-who">{c.root.sender_name} · {houseName(c.root.origin_house_id)} → {houseName(c.root.recipient_house_id)}{lastWho?` · última: ${lastWho}`:''}</span>
          <span className="chn-it-pv">{preview}</span>
        </a>
        {queue!=='trash'&&<button type="button" className="chn-it-read" aria-label={unread?'Marcar como lida':'Marcar como não lida'}
          title={unread?'Marcar como lida':'Marcar como não lida'} onClick={()=>toggleRead(c)}><Icon name={unread?'missivas':'mailopen'} size={16}/></button>}
      </div></div>;
  });
  return <section className="chn" data-pane={pane} aria-label="Chancelaria de Missivas">
    <aside className="chn-queues" aria-label="Pastas da Chancelaria">
      <section className="chn-panel">
        <div className="chn-ph"><span className="chn-ph-t">Pastas</span></div>
        <nav className="chn-qlist" aria-label="Pastas">
          {NARRATOR_QUEUES.map(q=>{const n=queueCount(q);return <a key={q} className="chn-q"
            aria-current={queue===q?'true':undefined} title={QUEUE_TEXT[q][1]}
            {...urlLinkProps({pasta:q===defaultQueue?null:q,carta:null},{onNavigate:()=>{setPane('list');setCompose(false);}})}>
            <Icon name={QUEUE_TEXT[q][2]}/><span className="chn-q-label">{QUEUE_TEXT[q][0]}<small>{QUEUE_TEXT[q][1]}</small></span>
            <span className={'chn-cnt'+(q==='attention'&&n!=='0'?' chn-cnt--hot':'')}>{n}</span></a>;})}
        </nav>
      </section>
    </aside>
    <section className="chn-panel chn-toolbar" aria-label="Ferramentas da Chancelaria">
      <div className="chn-tbrow">
        <div className="chn-titles"><p className="chn-eyebrow">{openRound?`Semana ${openRound} aberta`:'Sem semana aberta'}{clock?' · '+formatCampaignPeriod(clock):''}</p>
          <h2>Chancelaria de Missivas</h2></div>
        <span className="chn-spacer"/>
        <div className="chn-seg chn-viewseg" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={!timeline} onClick={()=>setTimeline(false)}>Caixa</button>
          <button type="button" aria-pressed={timeline} onClick={()=>setTimeline(true)}>Linha do tempo</button>
        </div>
        <button type="button" className="chn-btn chn-filters-btn" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(v=>!v)}>
          <Icon name="filter" size={16}/>{activeFilters?`Filtros (${activeFilters})`:'Filtros'}</button>
        <button type="button" className="chn-btn chn-btn--primary chn-new" onClick={()=>openCompose()}><Icon name="feather" size={16}/>Nova missiva</button>
      </div>
      <div className={'chn-filters'+(filtersOpen?' chn-filters--open':'')} role="group" aria-label="Filtros">
        <div className="chn-sheet-h"><span>Filtros</span>
          <button type="button" className="chn-btn chn-btn--ghost" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)}><Icon name="close" size={16}/></button></div>
        <div className="chn-seg" role="group" aria-label="Grupo de narração">
          {GROUP_OPTIONS.map(([id,label])=><button type="button" key={id} aria-pressed={group===id}
            onClick={()=>{setGroup(id);setHouse('');}}>{label}</button>)}
        </div>
        <label className="chn-inline">Casa<select value={house} onChange={e=>setHouse(e.target.value)}>
          <option value="">Todas</option>
          {data.houses.filter(h=>h.active&&(!groupHouses||groupHouses.has(h.id))).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
        </select></label>
        <label className="chn-inline">Semana<select value={week} onChange={e=>setWeek(e.target.value)}>
          <option value="">Todas</option>{weeks.map(w=><option key={w} value={String(w)}>Semana {w}</option>)}</select></label>
        <div className="chn-search"><Icon name="search" size={15}/>
          <input id="chn-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar em cartas e respostas" aria-label="Buscar"/></div>
        {activeFilters>0&&<span className="chn-factive">{activeFilters} filtro(s) ativo(s) · <button type="button" className="chn-link" onClick={resetFilters}>Limpar</button></span>}
      </div>
    </section>
    <section className="chn-panel chn-list" aria-label="Conversas">
      <div className="chn-ph"><span className="chn-ph-t chn-qname">{QUEUE_TEXT[queue][0]}</span>
        <select className="chn-qsel" aria-label="Pasta" value={queue} onChange={e=>pickQueue(e.target.value as QueueId)}>
          {NARRATOR_QUEUES.map(q=><option key={q} value={q}>{QUEUE_TEXT[q][0]} ({queueCount(q)})</option>)}</select>
        <span className="chn-spacer"/><span>{list.length} conversa{list.length===1?'':'s'}</span></div>
      <div className="chn-items" role="list">
        {list.length===0?<div className="chn-empty"><Icon name="inbox" size={28}/>
          <p>Nada nesta pasta{activeFilters?' com os filtros atuais':''}.</p>
          {activeFilters>0&&<button type="button" className="chn-btn" onClick={resetFilters}>Limpar filtros</button>}</div>:items}
      </div>
      <div className="chn-lfoot"><span>A leitura só conta quando você marca.</span>
        <span className="chn-keys"><kbd>j</kbd>/<kbd>k</kbd> navegar · <kbd>e</kbd> lida · <kbd>r</kbd> responder · <kbd>n</kbd> nova</span></div>
    </section>
    <section className="chn-panel chn-reader" aria-label="Leitura">
      {compose!==false?<>
        <div className="chn-rh"><button type="button" className="chn-btn chn-btn--sm chn-back" onClick={closeCompose}><Icon name="back" size={15}/>Voltar</button>
          <b className="chn-rh-title"><Icon name="feather" size={16}/>Nova missiva</b><span className="chn-spacer"/>
          <button type="button" className="chn-btn chn-btn--sm" onClick={closeCompose}><Icon name="close" size={15}/>Fechar</button></div>
        <div className="chn-rbody"><div className="chn-sheet chn-compose">
          <MailComposer key={compose?compose.subject:'nova'} data={data} me={me} initial={compose}
            onSave={()=>{setCompose(false);setPane(narrow?'list':'reader');setMessage('Missiva registrada.');refresh();}} onManage={onManage}/>
        </div></div></>
      :current?<NarratorReader key={current.root.id} c={current} data={data} uid={uid} admin={admin} today={today} openRound={openRound}
          editHouses={editHouses} houseName={houseName} houseOf={houseOf} trashMode={queue==='trash'} ctx={ctx}
          onBack={()=>setPane('list')} onRead={()=>void markRead(current)} onUnread={()=>void markUnread(current)}
          onDone={refresh} onError={(m)=>{onError(m);setMessage(m);}}/>
      :<div className="chn-rbody"><div className="chn-empty"><Icon name="missivas" size={28}/><p>Selecione uma missiva para ler.</p></div></div>}
    </section>
    {((contextOpen&&drawerContext)||filtersOpen)&&<div className={'chn-scrim'+(filtersOpen&&!contextOpen?' chn-scrim--filters':'')} aria-hidden="true"
      onClick={()=>{setContextOpen(false);setFiltersOpen(false);}}/>}
    {pane==='list'&&compose===false&&<button type="button" className="chn-fab" aria-label="Escrever nova missiva" onClick={()=>openCompose()}><Icon name="feather" size={22}/></button>}
    {message&&<div className="chn-toast" role="status" aria-live="polite">{message}</div>}
  </section>;
}

function ComposeHelp({openRound}:{openRound:number|null}){
  return <><div className="chn-box"><h5>Regras de entrega</h5>
    <p>Cartas do Narrador saem na semana escolhida; a sugestão é a próxima abertura{openRound!==null?` (Semana ${openRound+1})`:''}.</p>
    <p>Cada Casa recebe sua própria cópia; um grupo não lê o outro.</p>
    <p>Enquanto a semana do envio estiver aberta, dá para editar ou cancelar.</p></div>
    <div className="chn-box"><h5>Atalhos</h5><p><kbd>Tab</kbd> recuo no texto · <kbd>Esc</kbd> fecha a escrita</p></div></>;
}

type HouseRow=Panel['houses'][number];
function ConversationContext({c,data,uid,houses,related,isUnread,trashMode,onSelect,onManage,onDone,onError}:{
  c:Conversation;data:Panel;uid:string;houses:HouseRow[];related:(houseId:string)=>Conversation[];isUnread:(c:Conversation)=>boolean;
  trashMode:boolean;onSelect:(id:string)=>void;onManage?:((house:string)=>void)|undefined;onDone:()=>void;onError:(m:string)=>void;
}){
  const consequences=useQuery({queryKey:['letter-consequences',uid,c.root.id],enabled:!trashMode,queryFn:async()=>{
    const r=await supabase.from('campaign_letter_consequences').select('id,letter_id,house_id,changes,active,created_at').eq('letter_id',c.root.id);
    if(r.error)throw r.error;return (r.data??[]) as LetterConsequenceRow[];
  }});
  const lastUid=lastAuthor(c);
  const lastName=lastUid===uid?'você':lastUid===c.root.sender_user_id?c.root.sender_name:c.items.filter(i=>i.authorUid===lastUid).at(-1)?.author;
  const weeks=[...new Set([c.root.delivery_week,...c.letters.map(l=>l.delivery_week)].filter((n):n is number=>typeof n==='number'))].sort((a,b)=>a-b);
  return <>
    {c.kind==='geral'&&<div className="chn-box"><h5>Carta geral</h5><p>Enviada a várias Casas. Cada uma recebe a sua cópia e as respostas não se misturam.</p></div>}
    {houses.map(h=>{
      const group=narrationGroupOf(h.id);
      const players=data.players.filter(p=>p.active&&p.roster_house_id===h.id).map(p=>p.name).join(', ');
      const others=related(h.id);
      return <div key={h.id} className="chn-hcard">
        <div className="chn-hcard-head"><HouseMark house={h} size="lg"/>
          <div><h3>Casa {h.name}</h3><p>{group?group.label:h.region??'Casa da temporada'}</p></div></div>
        <dl className="chn-facts">
          {h.lord_name&&<><dt>Lorde</dt><dd>{h.lord_name}</dd></>}
          {h.castle&&<><dt>Sede</dt><dd>{h.castle}</dd></>}
          {h.region&&<><dt>Região</dt><dd>{h.region}</dd></>}
          {players&&<><dt>Jogador</dt><dd>{players}</dd></>}
        </dl>
        {onManage&&<button type="button" className="chn-btn chn-btn--sm" onClick={()=>onManage(h.id)}><Icon name="file" size={15}/>Abrir ficha da Casa</button>}
        {others.length>0&&<div className="chn-box"><h5>Outras conversas com a Casa</h5>
          {others.map(o=><button key={o.root.id} type="button" className="chn-mini" onClick={()=>onSelect(o.root.id)}>
            {isUnread(o)?<span className="chn-udot"/>:<Icon name="missivas" size={14}/>}{o.root.subject}</button>)}</div>}
      </div>;})}
    <div className="chn-box"><h5>Nesta conversa</h5>
      <p>{c.items.length+1} mensage{c.items.length===0?'m':'ns'}{weeks.length?` · semana${weeks.length>1?'s':''} ${weeks.join(', ')}`:''}</p>
      {lastName&&<p>Última palavra: <b>{lastName}</b></p>}</div>
    {!trashMode&&<div className="chn-box chn-tools">
      <NarratorMailNotes letterId={c.root.id} userId={uid}/>
      <LetterConsequences letterId={c.root.id} admin houses={data.houses.filter(h=>h.active).map(h=>({id:h.id,name:h.name}))}
        suggestedHouse={c.root.origin_house_id??c.root.recipient_house_id??''} items={consequences.data??[]}
        onSaved={onDone} onError={onError}/>
    </div>}
  </>;
}

function NarratorReader({c,data,uid,admin,today,openRound,editHouses,houseName,houseOf,trashMode,ctx,onBack,onRead,onUnread,onContext,onDone,onError}:{
  c:Conversation;data:Panel;uid:string;admin:boolean;today:string;openRound:number|null;editHouses:Set<string>;
  houseName:(id:string|null|undefined)=>string;houseOf:(id:string|null|undefined)=>HouseRow|null;trashMode:boolean;ctx:QueueContext;
  onBack:()=>void;onRead:()=>void;onUnread:()=>void;onContext?:(()=>void)|undefined;onDone:()=>void;onError:(m:string)=>void;
}){
  const unread=conversationUnread(c,ctx);
  // Rascunho da resposta guardado por conversa no navegador: trocar de carta,
  // fechar a aba ou uma falha de envio não apagam o texto.
  const draftKey=`chancelaria:resposta:${uid}:${c.root.id}`;
  const [recentSigs,setRecentSigs]=useState<string[]>(()=>loadRecentSignatures());
  const linkCatalog=useMailLinkCatalog(Boolean(c.root.court_member_id||c.root.military_unit_id));
  const {courtLabel,unitLabel}=resolveLinkNames(linkCatalog.data?.houses,c.root.court_member_id,c.root.military_unit_id);
  const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);
  const [key,setKey]=useState(()=>crypto.randomUUID());
  const [editing,setEditing]=useState<MailRow|null>(null);const [editText,setEditText]=useState('');const [editSubject,setEditSubject]=useState('');
  const [editDate,setEditDate]=useState('');const [editImages,setEditImages]=useState<PendingImage[]>([]);
  const [confirmCancel,setConfirmCancel]=useState<string|null>(null);
  const target=c.replyTarget(uid,admin,editHouses);
  // Historical replies have their own immutable ID. Supplying that ID lets
  // Firebase derive the responding House from the authenticated source, even
  // after the original delivery week has ended.
  const historicReplyId=c.replyToHistoricalId(uid,admin,editHouses);
  const own=(m:MailRow)=>m.sender_user_id===uid&&m['source']==='firebase-cloud';
  const pending=(m:MailRow)=>m.publication_state==='draft'||m.publication_state==='scheduled';
  const editable=(m:MailRow)=>own(m)&&!m.deleted_at&&(pending(m)||(openRound!==null&&(m.delivery_week??0)>=openRound));
  const act=async(work:()=>PromiseLike<{error:{message:string}|null}>):Promise<boolean>=>{
    setBusy(true);const r=await work();setBusy(false);
    if(r.error){onError(r.error.message);return false;}
    onDone();return true;
  };
  const sendReply=async(payload:ReplySubmitPayload):Promise<boolean>=>{
    if(!target||!payload.text.trim())return false;
    const chosenDate=payload.campaignDate||today;
    if(!chosenDate){onError('Data oficial da campanha indisponível.');return false;}
    setBusy(true);
    let richContent=payload.text;
    if(payload.images.length>0){
      setUploading(true);
      try{richContent=await uploadImages(payload.text,payload.images,key);}
      catch(err){setUploading(false);setBusy(false);onError(err instanceof Error?err.message:'Não foi possível enviar a imagem.');return false;}
      setUploading(false);
    }
    const cleanSigned=admin?payload.signedBy:null;
    const weekArg=admin&&payload.deliveryWeek!==null?{p_week:payload.deliveryWeek}:{};
    const r=await (payload.draft
      ?datedMail('save_weekly_reply_draft',{p_id:key,p_letter:target,p_reply:historicReplyId,p_content:richContent,p_signed_by:cleanSigned,...weekArg},chosenDate)
      :datedMail('reply_weekly_message',{p_letter:target,p_reply:historicReplyId,p_content:richContent,p_key:key,p_draft:false,p_signed_by:cleanSigned,...weekArg},chosenDate));
    setBusy(false);
    if(r.error){onError(r.error.message);return false;}
    if(cleanSigned){rememberSignature(cleanSigned);setRecentSigs(loadRecentSignatures());}
    setKey(crypto.randomUUID());
    onDone();
    return true;
  };
  const statusBar=(m:MailRow)=>{
    if(trashMode)return m.deleted_at?<div className="chn-status chn-status--trash"><Icon name="trash" size={15}/>
      <span>{m['removal_kind']==='cancelada'?'Envio cancelado':'Excluída'} em {new Date(m.deleted_at).toLocaleString('pt-BR')}.</span>
      {(admin||(own(m)&&m['removal_kind']==='cancelada'))&&<button type="button" className="chn-btn chn-btn--sm chn-btn--primary" disabled={busy}
        onClick={()=>void act(()=>loose('restore_campaign_letter',{p_id:m.id}))}><Icon name="undo" size={14}/>Restaurar</button>}</div>:null;
    const parts:ReactNode[]=[];
    if(m.publication_state==='scheduled')parts.push(<span key="s"><Icon name="hour" size={14}/> Programada para a <b>Semana {m.delivery_week}</b>. Só o autor e o Narrador a veem até a abertura.</span>);
    if(m.publication_state==='draft')parts.push(<span key="d"><Icon name="file" size={14}/> Rascunho: ninguém recebeu ainda.</span>);
    if(editable(m)){
      parts.push(<button key="e" type="button" className="chn-btn chn-btn--sm" onClick={()=>{setEditing(m);setEditText(m.content);setEditSubject(m.subject);setEditDate((m['campaign_date'] as string|null|undefined)??today);setEditImages([]);}}><Icon name="edit" size={14}/>Editar envio</button>);
      if(m.publication_state==='draft')parts.push(<button key="p" type="button" className="chn-btn chn-btn--sm chn-btn--primary" disabled={busy}
        onClick={()=>void act(()=>loose('schedule_letter_draft',{p_id:m.id,p_week:m.delivery_week??openRound}))}><Icon name="send" size={14}/>Enviar agora</button>);
      parts.push(confirmCancel===m.id?<span key="c" className="chn-confirm"><b>Cancelar este envio para todos?</b>
        <button type="button" className="chn-btn chn-btn--sm chn-btn--wax" disabled={busy} onClick={()=>void act(()=>loose('delete_campaign_letter',{p_id:m.id}))}>Sim, cancelar</button>
        <button type="button" className="chn-btn chn-btn--sm" onClick={()=>setConfirmCancel(null)}>Não</button></span>
        :<button key="c" type="button" className="chn-btn chn-btn--sm chn-btn--wax" onClick={()=>setConfirmCancel(m.id)}><Icon name="close" size={14}/>Cancelar envio</button>);
      parts.push(<span key="m" className="chn-muted">{pending(m)?'Possível até a entrega.':`Possível enquanto a Semana ${openRound} estiver aberta.`}</span>);
    }else if(admin&&!m.deleted_at&&m['source']==='firebase-cloud'&&!own(m)){
      parts.push(confirmCancel===m.id?<span key="x" className="chn-confirm"><b>Excluir para todos?</b>
        <button type="button" className="chn-btn chn-btn--sm chn-btn--wax" disabled={busy} onClick={()=>void act(()=>loose('delete_campaign_letter',{p_id:m.id}))}>Excluir</button>
        <button type="button" className="chn-btn chn-btn--sm" onClick={()=>setConfirmCancel(null)}>Não</button></span>
        :<button key="x" type="button" className="chn-btn chn-btn--sm" onClick={()=>setConfirmCancel(m.id)}><Icon name="trash" size={14}/>Excluir (moderação)</button>);
    }
    if(own(m)&&m.publication_state==='delivered'&&!m.deleted_at)
      parts.push(<span key="r" className={'chn-pill'+(m['recipient_read']?' chn-pill--ok':'')}>{m['recipient_read']?'✓✓ lida pelo destinatário':'✓ entregue'}</span>);
    return parts.length?<div className="chn-status">{parts}</div>:null;
  };
  const editForm=(m:MailRow)=><form className="chn-form" onSubmit={async e=>{e.preventDefault();
    if(busy)return;
    setBusy(true);
    let richContent=editText;
    if(editImages.length>0){
      try{richContent=await uploadImages(editText,editImages,crypto.randomUUID());}
      catch(err){setBusy(false);onError(err instanceof Error?err.message:'Não foi possível enviar a imagem.');return;}
    }
    const r=await datedMail('edit_campaign_letter',{p_id:m.id,p_version:(m['version'] as number)??1,p_subject:editSubject,p_content:richContent},editDate||((m['campaign_date'] as string|null|undefined)??''));
    setBusy(false);
    if(r.error){onError(r.error.message);return;}
    setEditing(null);setEditImages([]);onDone();}}>
    <b>Editando o envio</b><span className="chn-muted">Quem já leu verá "Editada"; a versão anterior fica no histórico.</span>
    <DesdiaDateBar value={editDate} officialDate={today||undefined} allowFullCalendar={admin} disabled={busy} label="Data do envio editado" onChange={setEditDate}/>
    {!m['conversation_id']||m['conversation_id']===m.id?<label>Assunto<input value={editSubject} onChange={e=>setEditSubject(e.target.value)} required/></label>:null}
    <label>Texto<textarea rows={8} value={editText} onChange={e=>setEditText(e.target.value)} required/></label>
    <ImagePicker images={editImages} onChange={setEditImages} disabled={busy}/>
    <div className="chn-row"><button type="button" className="chn-btn" onClick={()=>{setEditing(null);setEditImages([]);}}>Descartar</button>
      <button type="submit" className="chn-btn chn-btn--primary" disabled={busy}>Salvar nova versão</button></div>
  </form>;
  const rootDate=str(c.root['campaign_date']);
  const group=narrationGroupOf(c.root.origin_house_id??c.root.recipient_house_id);
  const deliveryWeek=openRound!==null?replyDeliveryWeek(openRound,'narrator-to-player'):null;
  const copyWholeThread=async():Promise<boolean>=>{
    const text=formatConversationForAI({
      conversation:c,houseName,groupLabel:group?.label??null,courtLabel,unitLabel,
    });
    const ok=await copyTextToClipboard(text);
    if(!ok)onError('Não foi possível copiar o fio para a área de transferência.');
    return ok;
  };
  const itemHouse=(i:Conversation['items'][number])=>{
    if(i.mine(uid))return null;
    const id=i.letter?.origin_house_id??str((i.reply as unknown as Record<string,unknown>|null)?.['house_id']);
    return houseOf(id);
  };
  const itemDate=(i:Conversation['items'][number])=>{
    const d=str(i.letter?.['campaign_date'])??str((i.reply as unknown as Record<string,unknown>|null)?.['campaign_date']);
    return d?formatDate(d):i.at?new Date(i.at).toLocaleString('pt-BR'):'';
  };
  return <>
    <div className="chn-rh">
      <button type="button" className="chn-btn chn-btn--sm chn-back" onClick={onBack}><Icon name="back" size={15}/>Voltar</button>
      <span className={'chn-kind chn-kind--'+c.kind}>{c.kindLabel}</span>
      <span className="chn-rh-tl">{mailWeekTimeline(c.root.creation_week,c.root.delivery_week,c.root.publication_state)}{group?' · '+group.label:''}</span>
      {!trashMode&&(unread?<button type="button" className="chn-btn chn-btn--sm chn-btn--primary" aria-label="Marcar como lida" onClick={onRead}><Icon name="check" size={15}/><span className="chn-bl">Marcar como lida</span></button>
        :<button type="button" className="chn-btn chn-btn--sm" aria-label="Marcar como não lida" onClick={onUnread}><Icon name="mailopen" size={15}/><span className="chn-bl">Marcar como não lida</span></button>)}
      {onContext&&<button type="button" className="chn-btn chn-btn--sm" aria-label="Contexto da conversa" onClick={onContext}><Icon name="castle" size={15}/><span className="chn-bl">Contexto</span></button>}
    </div>
    <div className="chn-rbody">
      <article className="chn-sheet" aria-labelledby="chn-reader-title">
        <img className="chn-wm" src="/cormyr/brand/cormyr-brasao.svg" alt=""/>
        {editing?.id===c.root.id?editForm(c.root):<>
          <div className="chn-lh">
            <p className="chn-lh-eyebrow">Chancelaria Real de Cormyr{rootDate?' · '+formatDate(rootDate):''}{c.root['edited_at']?' · Editada':''}</p>
            <h3 id="chn-reader-title">{c.root.subject}</h3>
            <div className="chn-who">
              <span><b>De:</b> <HouseMark house={houseOf(c.root.origin_house_id)} size="xs"/>{c.root.sender_name}{c.root.origin_house_id?` (${houseName(c.root.origin_house_id)})`:''}</span>
              <span><b>Para:</b> <HouseMark house={houseOf(c.root.recipient_house_id)} size="xs"/>{houseName(c.root.recipient_house_id)}</span>
              {unread&&<span className="chn-chip chn-chip--new">Nova</span>}
              {c.root['historical_source']?<span className="chn-muted">Arquivo histórico</span>:null}
            </div>
            {c.root.court_member_id||c.root.military_unit_id?<div className="chn-links">
              {c.root.court_member_id&&<span className="chn-pill">👤 {courtLabel??'Corte vinculada'}</span>}
              {c.root.military_unit_id&&<span className="chn-pill">⚔️ {unitLabel??'Unidade vinculada'}</span>}</div>:null}
          </div>
          <div className="chn-body"><CampaignContent content={c.root.content}/></div></>}
        {statusBar(c.root)}
      </article>
      <section className="chn-thread" aria-label="Fio de respostas">
        <h4>Fio de respostas ({c.items.length})</h4>
        {c.items.length===0&&<p className="chn-muted">Nenhuma resposta ainda.</p>}
        {c.items.map(i=>{const isNew=i.isNewFor(ctx);return <article key={i.id} className={'chn-msg'+(i.mine(uid)?' chn-msg--mine':'')+(isNew?' chn-msg--new':'')+(i.letter?.deleted_at?' chn-msg--cancelled':'')}>
          <div className="chn-mh"><HouseMark house={itemHouse(i)} size="xs"/><b>{i.author}</b>{isNew&&<span className="chn-chip chn-chip--new">Nova</span>}
            {i.letter?.publication_state==='scheduled'&&<span className="chn-chip chn-chip--sched">Programada</span>}
            <span className="chn-spacer"/><span className="chn-muted">{itemDate(i)}</span></div>
          {i.letter&&editing?.id===i.letter.id?editForm(i.letter):<div className="chn-body chn-body--small"><CampaignContent content={i.content}/></div>}
          {i.letter&&!editing&&statusBar(i.letter)}
        </article>;})}
      </section>
    </div>
    {trashMode?<div className="chn-readonly"><Icon name="trash" size={15}/>Conversa na Lixeira. Restaure para continuar o fio.</div>
    :target?<ChancelariaReplyComposer
      textareaId="chn-reply"
      placeholder={`Responder como Narrador para ${houseName(c.root.origin_house_id??c.root.recipient_house_id)}… (Ctrl+Enter envia)`}
      draftKey={draftKey}
      today={today}
      admin={admin}
      busy={busy}
      uploading={uploading}
      defaultDeliveryWeek={deliveryWeek}
      recentSigs={recentSigs}
      note={<><Icon name="hour" size={14}/> {deliveryWeek!==null?<>Chega à Casa na <b>Semana {deliveryWeek}</b> (próxima abertura). </>:null}
        Dá para editar ou cancelar até a entrega · <kbd>Ctrl+Enter</kbd> envia.</>}
      onCopyThread={copyWholeThread}
      onSubmit={sendReply}/>
    :<div className="chn-readonly"><Icon name="lock" size={15}/><span>{c.root['historical_source']||(openRound!==null&&(c.root.delivery_week??0)<openRound)
      ?'Semana encerrada: o fio fica para consulta.'
      :c.kind==='entre'?'Carta entre Casas: o Narrador acompanha e registra, mas não entra no fio.'
      :'Nada a responder aqui no momento. Você pode escrever uma nova missiva a qualquer momento.'}</span>
      <span className="chn-spacer"/>
      <button type="button" className="chn-tool-chip" onClick={()=>{void copyWholeThread();}}>Copiar Fio</button>
    </div>}
  </>;
}
