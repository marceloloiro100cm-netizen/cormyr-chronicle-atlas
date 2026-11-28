import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {CampaignContent,ImagePicker,uploadImages,type PendingImage} from '@/components/campaign-content';
import {DesdiaDateBar} from '@/components/calendar/desdia-date-bar';
import {MailComposer,replaceMailDraft} from '@/components/players/mail-compose';
import {ChancelariaReplyComposer,type ReplySubmitPayload} from './ChancelariaReplyComposer';
import {copyTextToClipboard,formatConversationForAI} from './copy-thread';
import {resolveLinkNames,useMailLinkCatalog,type MailLinkOptionHouse} from '@/lib/mail/link-labels';
import {NarratorMailNotes} from '@/components/players/narrator-mail-notes';
import {LetterConsequences,type LetterConsequenceRow} from '@/components/players/letter-consequences';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,formatCampaignPeriod} from '@/lib/calendar/harptos';
import {datedMail} from '@/lib/calendar/mail';
import {mailWeekTimeline} from '@/lib/weekly-delivery';
import type {Panel} from '@/components/players/panel-data';
import {readUrlParam,setUrlParams,urlLinkProps,useUrlParam,useUrlSearch} from '@/lib/navigation/url-state';
import {HouseMark,Icon,NARRATOR_NARROW,useMedia} from '@/components/players/narrator/narrator-ui';
import {HouseQuickDrawer} from './HouseQuickDrawer';
import {
  buildConversations,conversationNoAction,conversationUnread,isActionableTurn,lastAuthor,queueMembers,
  type MailRow,type ReplyRow,type Conversation,type QueueId,type QueueContext,
} from './chancelaria-model';
import './chancelaria-narrador.css';

/**
 * Chancelaria de Missivas do Jogador (layout v5): pastas à esquerda com
 * seletor compacto no celular, lista com brasões e prévia, leitura em
 * pergaminho, escrita ampla no lugar do leitor, atalhos de teclado e gaveta
 * rápida "Minha Casa" (saldos, Corte, Exército e projetos).
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

const PLAYER_QUEUES:QueueId[]=['attention','yourturn','waiting','scheduled','drafts','trash','all'];
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
const plain=(text:string)=>text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#*_>`]/g,'').replace(/\s+/g,' ').trim();
const str=(value:unknown)=>typeof value==='string'&&value?value:null;
type Compose={subject:string;content:string}|null|false;

function readLocalReplyDraft(key:string):string{
  try{return localStorage.getItem(key)??sessionStorage.getItem(key)??'';}catch{return '';}
}
function writeLocalReplyDraft(key:string,value:string){
  try{
    if(value)localStorage.setItem(key,value);
    else{localStorage.removeItem(key);sessionStorage.removeItem(key);}
  }catch{/* armazenamento indisponível */}
}

export function ChancelariaMissivas({data,me,onSave,onError,onManage}:{
  data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;
  onManage?:((house:string)=>void)|undefined;onClassic?:(()=>void)|undefined;
}){
  const qc=useQueryClient();
  const admin=data.admin,uid=data.user.id;
  const narrow=useMedia(NARRATOR_NARROW);
  const [queueParam]=useUrlParam('pasta','attention');
  const queue:QueueId=queueParam in QUEUE_TEXT?queueParam as QueueId:'attention';
  const [selectedParam]=useUrlParam('carta','');
  const selected=selectedParam||null;
  const [composeParam]=useUrlParam('compor','');
  const setSelected=(id:string|null,replace=false)=>setUrlParams({carta:id,compor:null},{replace});
  useUrlSearch();
  const [pane,setPane]=useState<'list'|'reader'|'compose'>(()=>readUrlParam('compor')==='1'?'compose':readUrlParam('carta')?'reader':'list');
  const [search,setSearch]=useState('');
  const [week,setWeek]=useState('');
  const [timeline,setTimeline]=useState(false);
  const [compose,setCompose]=useState<Compose>(()=>readUrlParam('compor')==='1'?null:false);
  const [houseDrawerOpen,setHouseDrawerOpen]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [message,setMessage]=useState('');
  const {data:clock}=useCampaignTime();
  const {data:linkCatalog}=useMailLinkCatalog(true);
  const today=clock?dateKey(clock):'';
  const openRound=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const mail=useQuery({queryKey:['chancelaria-mail',uid],queryFn:()=>allMail(false),refetchInterval:30000});
  const trash=useQuery({queryKey:['chancelaria-trash',uid],queryFn:()=>allMail(true),enabled:queue==='trash'});

  const myHouseIds=useMemo(()=>new Set(data.members.filter(m=>m.player_id===me?.id).map(m=>m.house_id)),[data.members,me?.id]);
  const editHouses=useMemo(()=>new Set(data.members.filter(m=>m.player_id===me?.id&&m.can_edit).map(m=>m.house_id)),[data.members,me?.id]);
  const myPrimaryHouse=useMemo(()=>{
    const roster=me?.roster_house_id?data.houses.find(h=>h.id===me.roster_house_id):null;
    if(roster)return roster;
    for(const id of myHouseIds){const found=data.houses.find(h=>h.id===id);if(found)return found;}
    return null;
  },[data.houses,me?.roster_house_id,myHouseIds]);
  const houseOf=(id:string|null|undefined)=>id?data.houses.find(h=>h.id===id)??null:null;
  const houseName=(id:string|null|undefined)=>id?houseOf(id)?.name??'Casa':'Narrador';

  const conversations=useMemo(()=>buildConversations(mail.data?.letters??[],mail.data?.replies??[]),[mail.data]);
  const trashConversations=useMemo(()=>buildConversations(trash.data?.letters??[],trash.data?.replies??[]),[trash.data]);
  const ctx:QueueContext={uid,admin,receipts:data.receipts,openRound,editHouses};

  // Resumo da atividade do jogador na semana aberta.
  const weekStats=useMemo(()=>{
    if(openRound===null)return {sent:0,drafts:0};
    let sent=0,drafts=0;
    for(const l of mail.data?.letters??[]){
      if(l.deleted_at||l.sender_user_id!==uid)continue;
      if(l.publication_state==='draft'&&l.creation_week===openRound)drafts++;
      else if((l.creation_week===openRound||l.delivery_week===openRound)&&l.publication_state!=='draft')sent++;
    }
    return {sent,drafts};
  },[mail.data?.letters,openRound,uid]);

  const inScope=(c:Conversation)=>{
    if(week&&String(c.root.delivery_week??'')!==week)return false;
    if(search.trim()){
      const q=search.trim().toLowerCase();
      const hay=[c.root.subject,c.root.content,c.root.sender_name,houseName(c.root.origin_house_id),houseName(c.root.recipient_house_id),...c.items.map(i=>i.content+' '+(i.author??''))].join(' ').toLowerCase();
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
    if(composeParam==='1'&&compose===false){setCompose(null);setPane('compose');}
  },[composeParam]);// eslint-disable-line react-hooks/exhaustive-deps
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
  const markReadSilent=async(c:Conversation)=>{
    for(const id of c.unreadLetterIds(ctx)){
      const r=await loose('mark_letter_read',{p_id:id});
      if(r.error&&!/23505/.test(r.error.message))return r;
    }
    return {error:null};
  };
  const markRead=(c:Conversation)=>run('Marcada como lida.',()=>markReadSilent(c));
  const markUnread=(c:Conversation)=>run('Marcada como não lida.',()=>loose('mark_letter_unread',{p_id:c.lastIncomingLetterId(uid)??c.root.id}));
  const toggleRead=(c:Conversation)=>void(conversationUnread(c,ctx)?markRead(c):markUnread(c));
  const setNoAction=(c:Conversation,noAction:boolean)=>run(
    noAction?'Marcada como Sem ação (saiu de Sua vez).':'Retornou para Sua vez.',
    async()=>{
      if(noAction){
        for(const id of c.unreadLetterIds(ctx)){
          if(id===c.root.id)continue;
          const r=await loose('mark_letter_read',{p_id:id});
          if(r.error&&!/23505/.test(r.error.message))return r;
        }
      }
      return loose('set_letter_no_action',{p_id:c.root.id,p_no_action:noAction});
    },
  );

  const openCompose=(initial:{subject:string;content:string}|null=null)=>{
    if(!replaceMailDraft(uid))return;
    setCompose(initial);setPane('compose');setFiltersOpen(false);
  };
  const closeCompose=()=>{
    setCompose(false);
    setUrlParams({compor:null},{replace:true});
    setPane(narrow?'list':'reader');
  };
  const pickQueue=(q:QueueId)=>{setUrlParams({pasta:q==='attention'?null:q,carta:null,compor:null});setPane('list');setCompose(false);};
  const activeFilters=Number(Boolean(week))+Number(Boolean(search.trim()));
  const resetFilters=()=>{setWeek('');setSearch('');};

  // Atalhos de teclado (mesmo padrão da Chancelaria v5).
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      const t=e.target as HTMLElement|null;
      const typing=Boolean(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable));
      if(e.key==='Escape'){
        if(houseDrawerOpen){setHouseDrawerOpen(false);return;}
        if(filtersOpen){setFiltersOpen(false);return;}
        if(compose!==false&&!typing){closeCompose();return;}
        return;
      }
      if(typing)return;
      if(e.key==='j'||e.key==='k'){
        if(!list.length)return;
        const i=list.findIndex(c=>c.root.id===selected);
        const next=list[e.key==='j'?Math.min(i+1,list.length-1):Math.max(i-1,0)];
        if(next){e.preventDefault();setCompose(false);setSelected(next.root.id);setPane('reader');}
      }else if(e.key==='e'&&current&&queue!=='trash'){e.preventDefault();toggleRead(current);}
      else if(e.key==='r'&&current&&compose===false){e.preventDefault();document.getElementById('ch-responder-'+current.root.id)?.focus();}
      else if(e.key==='n'){e.preventDefault();openCompose();}
      else if(e.key==='/'){e.preventDefault();document.getElementById('chp-search')?.focus();}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[list,selected,current,queue,compose,houseDrawerOpen,filtersOpen]);// eslint-disable-line react-hooks/exhaustive-deps

  const weeks=[...new Set(conversations.map(c=>c.root.delivery_week).filter((n):n is number=>typeof n==='number'))].sort((a,b)=>b-a);
  const queueCount=(q:QueueId)=>q==='trash'&&trash.isPending?'…':String(members(q).length);

  if(mail.isPending)return <section className="chn chn--status"><p role="status">Carregando a Chancelaria…</p></section>;
  if(mail.error)return <section className="chn chn--status"><p role="alert">Não foi possível carregar as missivas. {mail.error.message}</p>
    <button type="button" className="chn-btn" onClick={()=>void mail.refetch()}>Tentar novamente</button></section>;

  let lastWeek:number|null|undefined;
  const items=list.map(c=>{
    const unread=conversationUnread(c,ctx);
    const otherHouseId=c.root.origin_house_id&&!myHouseIds.has(c.root.origin_house_id)
      ?c.root.origin_house_id
      :c.root.recipient_house_id&&!myHouseIds.has(c.root.recipient_house_id)
        ?c.root.recipient_house_id
        :c.root.origin_house_id??c.root.recipient_house_id;
    const markHouse=houseOf(otherHouseId);
    const lastBody=c.items.at(-1)?.content??c.root.content;
    const preview=plain(lastBody).slice(0,140);
    const lastUid=lastAuthor(c);
    const lastWho=lastUid===uid?'você':c.items.at(-1)?.author??c.root.sender_name;
    const sep=timeline&&c.root.delivery_week!==lastWeek
      ?<div className="chn-wsep">{c.root.delivery_week?`Semana ${c.root.delivery_week}`:'Sem semana definida'}</div>:null;
    lastWeek=c.root.delivery_week;
    return <div key={c.root.id}>{sep}
      <div role="listitem" className={'chn-it'+(unread?' chn-it--unread':'')} aria-current={c.root.id===selected&&compose===false?'true':undefined}>
        <a className="chn-it-open" {...urlLinkProps({carta:c.root.id,compor:null},{onNavigate:()=>{setCompose(false);setPane('reader');}})}>
          <HouseMark house={markHouse} size="sm"/>
          <span className="chn-tags">
            {unread&&<span className="chn-udot" aria-hidden="true"/>}
            <span className={'chn-kind chn-kind--'+c.kind}>{c.kindLabel}</span>
            <span>Sem. {c.root.delivery_week??'?'}</span>
            {c.root.publication_state==='scheduled'&&<span className="chn-chip chn-chip--sched">Programada</span>}
            {c.root.publication_state==='draft'&&<span className="chn-chip chn-chip--draft">Rascunho</span>}
            {unread&&<span className="chn-chip chn-chip--new">Nova</span>}
            {conversationNoAction(c,ctx)&&<span className="chn-chip chn-chip--noaction">Sem ação</span>}
            {c.items.length>0&&<span>{c.items.length} resp.</span>}
          </span>
          <span className="chn-it-title">{c.root.subject}</span>
          <span className="chn-it-who">{houseName(c.root.origin_house_id)} → {houseName(c.root.recipient_house_id)}{lastWho?` · última: ${lastWho}`:''}</span>
          <span className="chn-it-pv">{preview}</span>
        </a>
        {queue!=='trash'&&<button type="button" className="chn-it-read" aria-label={unread?'Marcar como lida':'Marcar como não lida'}
          title={unread?'Marcar como lida':'Marcar como não lida'} onClick={()=>toggleRead(c)}><Icon name={unread?'missivas':'mailopen'} size={16}/></button>}
      </div>
    </div>;
  });

  return <section className={'chn chn--player'+(houseDrawerOpen?' chn--with-drawer':'')} data-pane={pane} aria-label="Chancelaria de Missivas">
    <aside className="chn-queues" aria-label="Pastas da Chancelaria">
      <section className="chn-panel">
        <div className="chn-ph"><span className="chn-ph-t">Pastas</span></div>
        <nav className="chn-qlist" aria-label="Pastas">
          {PLAYER_QUEUES.map(q=>{const n=queueCount(q);return <a key={q} className="chn-q"
            aria-current={queue===q?'true':undefined} title={QUEUE_TEXT[q][1]}
            {...urlLinkProps({pasta:q==='attention'?null:q,carta:null,compor:null},{onNavigate:()=>{setPane('list');setCompose(false);}})}>
            <Icon name={QUEUE_TEXT[q][2]}/><span className="chn-q-label">{QUEUE_TEXT[q][0]}<small>{QUEUE_TEXT[q][1]}</small></span>
            <span className={'chn-cnt'+(q==='attention'&&n!=='0'?' chn-cnt--hot':'')}>{n}</span></a>;})}
        </nav>
      </section>
    </aside>

    <section className="chn-panel chn-toolbar" aria-label="Ferramentas da Chancelaria">
      <div className="chn-tbrow">
        <div className="chn-titles">
          <p className="chn-eyebrow">
            {openRound?`Semana ${openRound} aberta`:'Sem semana aberta'}
            {clock?' · '+formatCampaignPeriod(clock):''}
            {openRound!==null?` · ${weekStats.sent} enviada${weekStats.sent===1?'':'s'} esta semana`:''}
            {weekStats.drafts>0?` · ${weekStats.drafts} rascunho${weekStats.drafts===1?'':'s'}`:''}
          </p>
          <h2>Chancelaria de Missivas</h2>
        </div>
        <span className="chn-spacer"/>
        <div className="chn-seg chn-viewseg" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={!timeline} onClick={()=>setTimeline(false)}>Caixa</button>
          <button type="button" aria-pressed={timeline} onClick={()=>setTimeline(true)}>Linha do tempo</button>
        </div>
        {myPrimaryHouse&&<button type="button" className="chn-btn" aria-pressed={houseDrawerOpen} onClick={()=>setHouseDrawerOpen(v=>!v)}>
          <Icon name="castle" size={16}/>Minha Casa</button>}
        <button type="button" className="chn-btn chn-filters-btn" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(v=>!v)}>
          <Icon name="filter" size={16}/>{activeFilters?`Filtros (${activeFilters})`:'Filtros'}</button>
        <button type="button" className="chn-btn chn-btn--primary chn-new" onClick={()=>openCompose()}>
          <Icon name="feather" size={16}/>Nova missiva</button>
      </div>
      <div className={'chn-filters'+(filtersOpen?' chn-filters--open':'')} role="group" aria-label="Filtros">
        <div className="chn-sheet-h"><span>Filtros</span>
          <button type="button" className="chn-btn chn-btn--ghost" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)}><Icon name="close" size={16}/></button></div>
        <div className="chn-search"><Icon name="search" size={15}/>
          <input id="chp-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar em cartas, casas e respostas" aria-label="Buscar"/></div>
        <label className="chn-inline">Semana<select value={week} onChange={e=>setWeek(e.target.value)}>
          <option value="">Todas</option>{weeks.map(w=><option key={w} value={String(w)}>Semana {w}</option>)}</select></label>
        {activeFilters>0&&<span className="chn-factive">{activeFilters} filtro(s) ativo(s) · <button type="button" className="chn-link" onClick={resetFilters}>Limpar</button></span>}
      </div>
    </section>

    <section className="chn-panel chn-list" aria-label="Conversas">
      <div className="chn-ph"><span className="chn-ph-t chn-qname">{QUEUE_TEXT[queue][0]}</span>
        <select className="chn-qsel" aria-label="Pasta" value={queue} onChange={e=>pickQueue(e.target.value as QueueId)}>
          {PLAYER_QUEUES.map(q=><option key={q} value={q}>{QUEUE_TEXT[q][0]} ({queueCount(q)})</option>)}</select>
        <span className="chn-spacer"/><span>{list.length} conversa{list.length===1?'':'s'}</span></div>
      <div className="chn-items" role="list">
        {list.length===0?<div className="chn-empty"><Icon name="inbox" size={28}/>
          <p>Nada nesta pasta{activeFilters?' com os filtros atuais':''}.</p>
          {activeFilters>0&&<button type="button" className="chn-btn" onClick={resetFilters}>Limpar filtros</button>}</div>:items}
      </div>
      <div className="chn-lfoot"><span>Responder marca como lida automaticamente.</span>
        <span className="chn-keys"><kbd>j</kbd>/<kbd>k</kbd> navegar · <kbd>e</kbd> lida · <kbd>r</kbd> responder · <kbd>n</kbd> nova</span></div>
    </section>

    <section className="chn-panel chn-reader" aria-label="Leitura">
      {compose!==false?<>
        <div className="chn-rh">
          <button type="button" className="chn-btn chn-btn--sm chn-back" onClick={closeCompose}><Icon name="back" size={15}/>Voltar</button>
          <b className="chn-rh-title"><Icon name="feather" size={16}/>Nova missiva</b>
          <span className="chn-spacer"/>
          {myPrimaryHouse&&<button type="button" className="chn-btn chn-btn--sm" onClick={()=>setHouseDrawerOpen(v=>!v)}>
            <Icon name="castle" size={14}/>Minha Casa</button>}
          <button type="button" className="chn-btn chn-btn--sm" onClick={closeCompose}><Icon name="close" size={15}/>Fechar</button>
        </div>
        <div className="chn-rbody"><div className="chn-compose-wrap">
          <MailComposer key={compose?compose.subject:'nova'} data={data} me={me} initial={compose}
            onSave={()=>{closeCompose();setMessage('Missiva registrada.');refresh();}} onManage={onManage}/>
        </div></div></>
      :current?<PlayerReader key={current.root.id} c={current} data={data} uid={uid} admin={admin} today={today} openRound={openRound}
          editHouses={editHouses} houseName={houseName} houseOf={houseOf} trashMode={queue==='trash'} ctx={ctx}
          mailOptions={linkCatalog?.houses}
          onBack={()=>setPane('list')}
          onRead={()=>void markRead(current)}
          onUnread={()=>void markUnread(current)}
          onNoAction={()=>void setNoAction(current,true)}
          onReopenAction={()=>void setNoAction(current,false)}
          onAutoRead={async()=>{if(conversationUnread(current,ctx))await markReadSilent(current);}}
          onForward={()=>{openCompose({subject:'Enc.: '+current.root.subject,
            content:`\n\n--- Missiva encaminhada ---\nDe: ${current.root.sender_name}\nAssunto: ${current.root.subject}\n\n${current.root.content}`});}}
          onDone={refresh}
          onError={(m)=>{onError(m);setMessage(m);}}/>
      :<div className="chn-rbody"><div className="chn-empty"><Icon name="missivas" size={28}/><p>Selecione uma missiva para ler ou clique em Nova missiva.</p></div></div>}
    </section>

    {houseDrawerOpen&&myPrimaryHouse&&<HouseQuickDrawer house={myPrimaryHouse} onClose={()=>setHouseDrawerOpen(false)} onOpenSheet={onManage}/>}
    {(houseDrawerOpen||filtersOpen)&&<div className={'chn-scrim'+(filtersOpen&&!houseDrawerOpen?' chn-scrim--filters':'')} aria-hidden="true"
      onClick={()=>{setHouseDrawerOpen(false);setFiltersOpen(false);}}/>}
    {pane==='list'&&compose===false&&<button type="button" className="chn-fab" aria-label="Escrever nova missiva" onClick={()=>openCompose()}><Icon name="feather" size={22}/></button>}
    {message&&<div className="chn-toast" role="status" aria-live="polite">{message}</div>}
  </section>;
}

type HouseRow=Panel['houses'][number];

function PlayerReader({c,data,uid,admin,today,openRound,editHouses,houseName,houseOf,trashMode,ctx,mailOptions,onBack,onRead,onUnread,onNoAction,onReopenAction,onAutoRead,onForward,onDone,onError}:{
  c:Conversation;data:Panel;uid:string;admin:boolean;today:string;openRound:number|null;editHouses:Set<string>;
  houseName:(id:string|null|undefined)=>string;houseOf:(id:string|null|undefined)=>HouseRow|null;
  trashMode:boolean;ctx:QueueContext;mailOptions:MailLinkOptionHouse[]|undefined;
  onBack:()=>void;onRead:()=>void;onUnread:()=>void;onNoAction:()=>void;onReopenAction:()=>void;onAutoRead:()=>Promise<void>;onForward:()=>void;onDone:()=>void;onError:(m:string)=>void;
}){
  const unread=conversationUnread(c,ctx);
  const noAction=conversationNoAction(c,ctx);
  const actionable=isActionableTurn(c,ctx);
  const draftKey=`chancelaria:resposta:${uid}:${c.root.id}`;
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [key,setKey]=useState(()=>crypto.randomUUID());
  const [editing,setEditing]=useState<MailRow|null>(null);
  const [editText,setEditText]=useState('');
  const [editSubject,setEditSubject]=useState('');
  const [editDate,setEditDate]=useState('');
  const [editImages,setEditImages]=useState<PendingImage[]>([]);
  const [confirmCancel,setConfirmCancel]=useState<string|null>(null);

  const consequences=useQuery({queryKey:['letter-consequences',uid,c.root.id],enabled:!trashMode,queryFn:async()=>{
    const r=await supabase.from('campaign_letter_consequences').select('id,letter_id,house_id,changes,active,created_at').eq('letter_id',c.root.id);
    if(r.error)throw r.error;return (r.data??[]) as LetterConsequenceRow[];
  }});

  const target=c.replyTarget(uid,admin,editHouses);
  const historicalReplyId=c.replyToHistoricalId(uid,admin,editHouses);
  const canSend=Boolean(target&&!trashMode&&openRound!==null&&today);
  const blockedReason=trashMode?'Restaure a missiva na Lixeira antes de responder.':
    openRound===null?'O Narrador ainda não abriu uma semana para novas respostas.':
    !today?'Data oficial da campanha indisponível.':
    c.root.publication_state!=='delivered'?'A carta ainda não foi entregue.':
    !admin&&editHouses.size===0?'Sua conta não possui permissão para escrever por esta Casa.':
    'Aguarde uma resposta recebida ou confira o vínculo atual da Casa.';
  const own=(m:MailRow)=>m.sender_user_id===uid&&m['source']==='firebase-cloud';
  const pending=(m:MailRow)=>m.publication_state==='draft'||m.publication_state==='scheduled';
  const editable=(m:MailRow)=>own(m)&&!m.deleted_at&&
    openRound!==null&&(pending(m)?m.creation_week===openRound:m.delivery_week===openRound);

  const act=async(work:()=>PromiseLike<{error:{message:string}|null}>):Promise<boolean>=>{
    setBusy(true);const r=await work();setBusy(false);
    if(r.error){onError(r.error.message);return false;}
    onDone();return true;
  };
  const sendReply=async(payload:ReplySubmitPayload):Promise<boolean>=>{
    if(!canSend||!target||!payload.text.trim())return false;
    const chosenDate=payload.campaignDate||today;
    if(!chosenDate){onError('Data oficial da campanha indisponível.');return false;}
    const letterId=historicalReplyId?c.root.id:target;
    setBusy(true);
    let richContent=payload.text;
    if(payload.images.length>0){
      setUploading(true);
      try{richContent=await uploadImages(payload.text,payload.images,key);}
      catch(err){setUploading(false);setBusy(false);onError(err instanceof Error?err.message:'Não foi possível enviar a imagem.');return false;}
      setUploading(false);
    }
    const r=await (payload.draft
      ?datedMail('save_weekly_reply_draft',{p_id:key,p_letter:letterId,p_reply:historicalReplyId,p_content:richContent,p_signed_by:null},chosenDate)
      :datedMail('reply_weekly_message',{p_letter:letterId,p_reply:historicalReplyId,p_content:richContent,p_key:key,p_draft:false,p_signed_by:null},chosenDate));
    if(r.error){setBusy(false);onError(r.error.message);return false;}
    if(!payload.draft){await onAutoRead();}
    setBusy(false);
    setKey(crypto.randomUUID());
    onDone();
    return true;
  };

  const {courtLabel,unitLabel}=resolveLinkNames(mailOptions,c.root.court_member_id,c.root.military_unit_id);

  const statusBar=(m:MailRow)=>{
    if(trashMode)return m.deleted_at?<div className="chn-status chn-status--trash"><Icon name="trash" size={15}/>
      <span>{m['removal_kind']==='cancelada'?'Envio cancelado':'Excluída'} em {new Date(m.deleted_at).toLocaleString('pt-BR')}.</span>
      {own(m)&&m['removal_kind']==='cancelada'&&<button type="button" className="chn-btn chn-btn--sm chn-btn--primary" disabled={busy}
        onClick={()=>void act(()=>loose('restore_campaign_letter',{p_id:m.id}))}><Icon name="undo" size={14}/>Restaurar</button>}</div>:null;
    const parts:ReactNode[]=[];
    if(m.publication_state==='scheduled')parts.push(<span key="s"><Icon name="hour" size={14}/> Programada para a <b>Semana {m.delivery_week}</b>.</span>);
    if(m.publication_state==='draft')parts.push(<span key="d"><Icon name="file" size={14}/> Rascunho: ninguém recebeu ainda.</span>);
    if(editable(m)){
      parts.push(<button key="e" type="button" className="chn-btn chn-btn--sm" onClick={()=>{setEditing(m);setEditText(m.content);setEditSubject(m.subject);setEditDate((m['campaign_date'] as string|null|undefined)??today);setEditImages([]);}}><Icon name="edit" size={14}/>Editar envio</button>);
      if(m.publication_state==='draft')parts.push(<button key="p" type="button" className="chn-btn chn-btn--sm chn-btn--primary" disabled={busy}
        onClick={()=>void act(()=>loose('schedule_letter_draft',{p_id:m.id,p_week:m.delivery_week??openRound}))}><Icon name="send" size={14}/>Enviar agora</button>);
      parts.push(confirmCancel===m.id?<span key="c" className="chn-confirm"><b>Cancelar este envio para todos?</b>
        <button type="button" className="chn-btn chn-btn--sm chn-btn--wax" disabled={busy} onClick={()=>void act(()=>loose('delete_campaign_letter',{p_id:m.id}))}>Sim, cancelar</button>
        <button type="button" className="chn-btn chn-btn--sm" onClick={()=>setConfirmCancel(null)}>Não</button></span>
        :<button key="c" type="button" className="chn-btn chn-btn--sm chn-btn--wax" onClick={()=>setConfirmCancel(m.id)}><Icon name="close" size={14}/>Cancelar envio</button>);
      parts.push(<span key="m" className="chn-muted">{pending(m)?'Editável até a entrega.':`Editável enquanto a Semana ${openRound} estiver aberta.`}</span>);
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
    <b>Editando o envio</b><span className="chn-muted">Quem já leu verá "Editada"; a versão anterior fica preservada.</span>
    <DesdiaDateBar value={editDate} officialDate={today||undefined} allowFullCalendar={admin} disabled={busy} label="Data do envio editado" onChange={setEditDate}/>
    {!m['conversation_id']||m['conversation_id']===m.id?<label>Assunto<input value={editSubject} onChange={e=>setEditSubject(e.target.value)} required/></label>:null}
    <label>Texto<textarea rows={8} value={editText} onChange={e=>setEditText(e.target.value)} required/></label>
    <ImagePicker images={editImages} onChange={setEditImages} disabled={busy}/>
    <div className="chn-row"><button type="button" className="chn-btn" onClick={()=>{setEditing(null);setEditImages([]);}}>Descartar</button>
      <button type="submit" className="chn-btn chn-btn--primary" disabled={busy}>Salvar nova versão</button></div>
  </form>;

  const rootDate=str(c.root['campaign_date']);
  const copyWholeThread=async():Promise<boolean>=>{
    const text=formatConversationForAI({
      conversation:c,houseName,courtLabel,unitLabel,
    });
    const ok=await copyTextToClipboard(text);
    if(!ok)onError('Não foi possível copiar o fio para a área de transferência.');
    return ok;
  };
  const itemHouse=(i:Conversation['items'][number])=>{
    const id=i.letter?.origin_house_id??str((i.reply as unknown as Record<string,unknown>|null)?.['house_id']);
    return houseOf(id);
  };
  const itemDate=(i:Conversation['items'][number])=>{
    const d=str(i.letter?.['campaign_date'])??str((i.reply as unknown as Record<string,unknown>|null)?.['campaign_date']);
    return d?formatDate(d):i.at?new Date(i.at).toLocaleString('pt-BR'):'';
  };
  const activeConsequences=(consequences.data??[]).filter(x=>x.active);

  return <>
    <div className="chn-rh">
      <button type="button" className="chn-btn chn-btn--sm chn-back" onClick={onBack}><Icon name="back" size={15}/>Voltar</button>
      <span className={'chn-kind chn-kind--'+c.kind}>{c.kindLabel}</span>
      <span className="chn-rh-tl">{mailWeekTimeline(c.root.creation_week,c.root.delivery_week,c.root.publication_state)}</span>
      {!trashMode&&(unread?<button type="button" className="chn-btn chn-btn--sm chn-btn--primary" aria-label="Marcar como lida" onClick={onRead}><Icon name="check" size={15}/><span className="chn-bl">Marcar como lida</span></button>
        :<button type="button" className="chn-btn chn-btn--sm" aria-label="Marcar como não lida" onClick={onUnread}><Icon name="mailopen" size={15}/><span className="chn-bl">Não lida</span></button>)}
      {!trashMode&&(actionable||noAction)&&(noAction
        ?<button type="button" className="chn-btn chn-btn--sm chn-btn--noaction-on" aria-pressed="true" aria-label="Reabrir ação" title="Retorna esta conversa para a fila Sua vez" onClick={onReopenAction}><Icon name="reply" size={14}/><span className="chn-bl">Reabrir ação</span></button>
        :<button type="button" className="chn-btn chn-btn--sm" aria-pressed="false" aria-label="Marcar como Sem ação" title="Dispensa resposta: tira de Sua vez e mantém em Todas" onClick={onNoAction}><Icon name="check" size={14}/><span className="chn-bl">Sem ação</span></button>)}
      {!trashMode&&c.root.publication_state==='delivered'&&<button type="button" className="chn-btn chn-btn--sm" onClick={onForward}><span className="chn-bl">↪ Encaminhar</span></button>}
    </div>

    <div className="chn-rbody">
      <article className="chn-sheet" aria-labelledby="ch-reader-title">
        <img className="chn-wm" src="/cormyr/brand/cormyr-brasao.svg" alt=""/>
        {editing?.id===c.root.id?editForm(c.root):<>
          <div className="chn-lh">
            <p className="chn-lh-eyebrow">Chancelaria Real de Cormyr{rootDate?' · '+formatDate(rootDate):''}{c.root['edited_at']?' · Editada':''}</p>
            <h3 id="ch-reader-title">{c.root.subject}</h3>
            <div className="chn-who">
              <span><b>De:</b> <HouseMark house={houseOf(c.root.origin_house_id)} size="xs"/>{c.root.sender_name==='Narrador'&&c.root.origin_house_id===null?'Narrador':`${c.root.sender_name}${c.root.origin_house_id?` (${houseName(c.root.origin_house_id)})`:''}`}</span>
              <span><b>Para:</b> <HouseMark house={houseOf(c.root.recipient_house_id)} size="xs"/>{houseName(c.root.recipient_house_id)}</span>
              {unread&&<span className="chn-chip chn-chip--new">Nova</span>}
              {noAction&&<span className="chn-chip chn-chip--noaction">Sem ação</span>}
              {c.root['historical_source']?<span className="chn-muted">Arquivo histórico</span>:null}
            </div>
            {(c.root.court_member_id||c.root.military_unit_id)&&<div className="chn-links">
              {c.root.court_member_id&&<span className="chn-pill">👤 {courtLabel??'Membro da Corte vinculado'}</span>}
              {c.root.military_unit_id&&<span className="chn-pill">⚔️ {unitLabel??'Unidade militar vinculada'}</span>}
            </div>}
          </div>
          <div className="chn-body"><CampaignContent content={c.root.content}/></div></>}
        {statusBar(c.root)}
      </article>

      {activeConsequences.length>0&&<div className="chn-thread">
        <LetterConsequences letterId={c.root.id} admin={false} houses={[]} suggestedHouse="" items={activeConsequences} onSaved={onDone} onError={onError}/>
      </div>}

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

      {admin&&!trashMode&&<div className="chn-thread"><NarratorMailNotes letterId={c.root.id} userId={uid}/></div>}
    </div>

    {trashMode?<div className="chn-readonly"><Icon name="trash" size={15}/>Conversa na Lixeira. Restaure para continuar o fio.</div>
    :canSend?<ChancelariaReplyComposer
      textareaId={'ch-responder-'+c.root.id}
      placeholder="Escreva sua resposta ou ordem… (Ctrl+Enter envia)"
      draftKey={draftKey}
      today={today}
      admin={false}
      busy={busy}
      uploading={uploading}
      note={<>Rascunho salvo automaticamente neste navegador · <kbd>Ctrl+Enter</kbd> envia</>}
      onCopyThread={copyWholeThread}
      onSubmit={sendReply}/>
    :<div className="chn-readonly"><Icon name="lock" size={15}/><span>{blockedReason}</span>
      <span className="chn-spacer"/>
      <button type="button" className="chn-tool-chip" onClick={()=>{void copyWholeThread();}}>Copiar Fio</button>
    </div>}
  </>;
}
