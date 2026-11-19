import {useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPortal} from 'react-dom';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {NARRATION_GROUPS} from '@/lib/mail-groups';
import {
  EMPTY_ORIGINAL_MAIL_FILTERS,toFirebaseOriginalMailFilters,
  type OriginalMailFilters,type OriginalMailOptions,
} from '@/lib/mail/firebase-original-filter-bridge';

type Role='narrador'|'jogador';
type ArchivedLetter={
  id:string;subject:string;content:string;sender_name:string|null;
  sender_user_id:string;recipient_house_id:string|null;
  recipient_player_id:string|null;origin_house_id:string|null;
  letter_kind:string|null;letter_number:number|null;
  created_at:string;delivered_at:string|null;delivery_week:number|null;
  publication_state:string;deleted_at:string|null;recipient_read:boolean;
};
type ArchivedReply={
  id:string;letter_id:string;content:string;author_name:string|null;
  author_user_id:string;publication_state:string;created_at:string;
  delivered_at:string|null;deleted_at:string|null;
};
type ArchivePage={
  total:number;kpis?:{
    delivered:number;awaiting_house:number;awaiting_narrator:number;
    drafts:number;scheduled_replies_next:number;
  };letters:ArchivedLetter[];replies:ArchivedReply[];
};

async function requestArchive<T>(action:'listOriginalMail'|'listOriginalMailOptions',
  fields:Record<string,unknown>={}):Promise<T>{
  const auth=firebasePilotAuth();
  const startingUid=auth?.current()?.uid;
  if(!auth||!startingUid)throw Error('Sessão Firebase indisponível.');
  const token=await auth.getToken();
  if(!token||auth.current()?.uid!==startingUid)
    throw Error('Sua sessão mudou. Entre novamente.');
  const response=await fetch('/api/firebase-cloud-read',{
    method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({action,...fields}),
  });
  if(!response.ok)throw Error(response.status===403||response.status===401
    ?'Sua conta não tem mais acesso às missivas.'
    :'As missivas históricas ainda não estão disponíveis no Firebase.');
  const json:unknown=await response.json();
  if(!json||typeof json!=='object'||!('result' in json)||
     auth.current()?.uid!==startingUid)
    throw Error('Resposta da sessão inválida.');
  return (json as {result:T}).result;
}
const boxes=(admin:boolean):[string,string][]=>[
  ['','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas'],
  ...(admin?[['copias','Cópias para mediação'] as [string,string]]:[]),
  ['programadas','Programadas'],['rascunhos','Rascunhos'],
  ['historico','Histórico por semana'],['lixeira','Lixeira'],
];
const answered=(admin:boolean):[string,string][]=>
  admin?[['','Todas'],['no-delivered','Sem resposta entregue'],
    ['awaiting-house','Aguardando resposta da Casa'],
    ['awaiting-narrator','Aguardando resposta do Narrador'],
    ['pending-outgoing','Com resposta programada/rascunho']]
    :[['','Todas'],['yes','Respondidas'],['no','Não respondidas']];
const mailKind:[string,string][]=[
  ['','Todos os tipos'],['geral','Geral'],['reservada','Reservada'],
];
const readOptions:[string,string][]=[['','Todas'],['no','Não lidas'],['yes','Lidas']];
const dateText=(value:string|null|undefined)=>{
  if(!value)return 'Sem data';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?value:d.toLocaleDateString('pt-BR');
};

/**
 * The ORIGINAL Council mail destination now reads imported Firebase data.
 * All original filter names and the historic visual class names are retained.
 * No demo letters, no fallback to Supabase, no write RPCs.
 */
export function FirebaseOriginalMissivas({
  profile,filterHost,
}:{
  profile:Role;filterHost?:HTMLElement|null;
}){
  const admin=profile==='narrador';
  const uid=firebasePilotAuth()?.current()?.uid??null;
  const [filters,setFilters]=useState<OriginalMailFilters>(EMPTY_ORIGINAL_MAIL_FILTERS);
  const [text,setText]=useState('');
  const [showFilters,setShowFilters]=useState(true);
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  useEffect(()=>{
    const task=setTimeout(()=>setText(filters.text),250);
    return()=>clearTimeout(task);
  },[filters.text]);
  const optionsQuery=useQuery({
    queryKey:['firebase-original-mail-options',uid],
    queryFn:()=>requestArchive<OriginalMailOptions>('listOriginalMailOptions'),
    enabled:!!uid,retry:false,refetchOnWindowFocus:'always',staleTime:0,
  });
  const filterValues=useMemo(()=>{
    if(!optionsQuery.data)return {};
    return toFirebaseOriginalMailFilters({...filters,text},
      optionsQuery.data,admin);
  },[filters,text,optionsQuery.data,admin]);
  const mailbox=useQuery({
    queryKey:['firebase-original-mail-page',uid,filterValues,page],
    queryFn:()=>requestArchive<ArchivePage>('listOriginalMail',{
      filters:filterValues,page,size:20,
    }),
    enabled:!!uid&&optionsQuery.data?.verifiedViewerScope===true,
    retry:false,refetchOnWindowFocus:'always',staleTime:0,
  });
  const options=optionsQuery.data;
  const houseName=(houseId:string|null)=>{
    if(!houseId)return 'Narrador';
    return options?.houses.find(h=>h.id===houseId)?.label??'Casa histórica';
  };
  const choose=(key:keyof OriginalMailFilters,value:string)=>{
    setFilters(old=>({...old,[key]:value}));
    setPage(0);setExpanded(new Set());
  };
  const select=(name:string,key:keyof OriginalMailFilters,values:[string,string][])=>
    <label>{name}<select value={filters[key]}
      onChange={e=>choose(key,e.target.value)}>
      {values.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>;
  const optionPairs=(arr:OriginalMailOptions['houses']|undefined)=>
    (arr??[]).map(v=>[v.id,v.label] as [string,string]);
  const filterPanel=<aside className="campaign-mail-side" aria-label="Filtros das missivas">
    <button type="button" className="campaign-mail-filter-toggle"
      aria-expanded={showFilters} aria-controls="original-firebase-mail-filters"
      onClick={()=>setShowFilters(x=>!x)}>
      <span>FILTROS</span><span>{showFilters?'Recolher':'Expandir'}</span>
    </button>
    {showFilters&&<div className="campaign-mail-filter-fields" id="original-firebase-mail-filters">
      <label>Buscar<input type="search" value={filters.text}
        onChange={e=>choose('text',e.target.value)}
        placeholder="Assunto, resposta, autor ou casa…"/></label>
      {select('Caixa','box',boxes(admin))}
      {admin&&select('Grupo de narração','group',[
        ['','Todos os grupos'],
        ...NARRATION_GROUPS.map(g=>[g.id,g.label] as [string,string]),
      ])}
      {admin&&select('Casa destinatária / legado','house',[
        ['','Todas as casas'],...optionPairs(options?.houses),
      ])}
      {select('Casa remetente','origin',[
        ['','Todas as casas'],['none','Sem vínculo / legado'],
        ...optionPairs(options?.houses),
      ])}
      {select('Membro da corte','court',[
        ['','Todos'],['none','Sem vínculo'],
        ...optionPairs(options?.courts),
      ])}
      {select('Unidade militar','unit',[
        ['','Todas'],['none','Sem vínculo'],
        ...optionPairs(options?.units),
      ])}
      {select('Semana','number',[
        ['','Todas as semanas'],
        ...(options?.weeks??[]).map(n=>[String(n),'Semana '+n] as [string,string]),
      ])}
      {select('Tipo','kind',mailKind)}
      {select('Resposta','answered',answered(admin))}
      {select('Minha leitura','read',readOptions)}
      <Button variant="outline" onClick={()=>{
        setFilters(EMPTY_ORIGINAL_MAIL_FILTERS);setPage(0);
      }}>Limpar filtros</Button>
      <div className="campaign-actions">
        <Button size="sm" variant="ghost" onClick={()=>
          setExpanded(new Set(mailbox.data?.letters.map(l=>l.id)??[]))}>
          Expandir todas
        </Button>
        <Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set())}>
          Recolher todas
        </Button>
      </div>
    </div>}
  </aside>;
  const letters=mailbox.data?.letters??[];
  const replies=mailbox.data?.replies??[];
  const openRound=options?.rounds.filter(r=>r.status==='open')
    .map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const byWeek=new Map<string,ArchivedLetter[]>();
  for(const letter of letters){
    const key=letter.letter_number===null?'sem-numero':String(letter.letter_number);
    const rows=byWeek.get(key)??[];
    rows.push(letter);byWeek.set(key,rows);
  }
  const groups=[...byWeek].sort((a,b)=>Number(b[0]) - Number(a[0]));
  const view=<div className={'campaign-mail-layout'+(admin?' campaign-mail-layout--narrator':'')}>
    {filterHost?createPortal(filterPanel,filterHost):filterPanel}
    <div>
      <p className="campaign-status-banner" role="status">
        Acervo original do Firebase · Somente consulta.
        O envio, a leitura confirmada, a edição e a troca de semana permanecem
        bloqueados nesta tela até homologação operacional.
      </p>
      {optionsQuery.isPending&&<p role="status">Carregando filtros reais das missivas…</p>}
      {optionsQuery.error&&<p role="alert">
        Não foi possível carregar os filtros das missivas.
        <Button onClick={()=>void optionsQuery.refetch()}>Tentar novamente</Button>
      </p>}
      {mailbox.isPending&&options&&<p role="status">Carregando missivas reais…</p>}
      {mailbox.error&&<p role="alert">
        Não foi possível conferir as missivas importadas.
        <Button onClick={()=>void mailbox.refetch()}>Tentar novamente</Button>
      </p>}
      {admin&&<section className="narrator-mail-hub-overview"
        aria-label="Indicadores originais das missivas filtradas">
        <div><strong>{mailbox.data?.kpis?.delivered??'—'}</strong>
          <span>Entregues</span></div>
        <div><strong>{mailbox.data?.kpis?.awaiting_house??'—'}</strong>
          <span>Aguardando Casa</span></div>
        <div><strong>{mailbox.data?.kpis?.awaiting_narrator??'—'}</strong>
          <span>Aguardando Narrador</span></div>
        <div><strong>{mailbox.data?.kpis?.drafts??'—'}</strong>
          <span>Rascunhos</span></div>
      </section>}
      <nav className="campaign-actions" aria-label="Páginas de missivas">
        <Button disabled={page===0||mailbox.isFetching} onClick={()=>setPage(x=>x-1)}>
          Anterior
        </Button>
        <span>Página {page+1} · {mailbox.data?.total??0} entregas encontradas</span>
        <Button disabled={mailbox.isFetching||(page+1)*20>=(mailbox.data?.total??0)}
          onClick={()=>setPage(x=>x+1)}>Próxima</Button>
      </nav>
      <div className={'campaign-round '+(openRound===null?'fechada':'')} role="status">
        {openRound===null?'Nenhuma semana aberta registrada no acervo histórico.':
          'Missiva '+openRound+' consta como aberta no histórico importado.'}
      </div>
      <div className="campaign-heading">
        <h2>{filters.box==='enviadas'?'Missivas enviadas':
          admin?'Correspondência acompanhada':'Missivas recebidas'}</h2>
        <span>{letters.length} nesta página</span>
      </div>
      {mailbox.data&&letters.length===0&&
        <p className="campaign-empty">Nenhuma missiva encontrada.</p>}
      {groups.map(([key,items])=>
        <section className="campaign-mail-group" key={key}>
          {key!=='sem-numero'&&<h3 className="campaign-letter-number">
            Missiva {key}
          </h3>}
          {items.map(letter=>{
            const opened=expanded.has(letter.id);
            const thread=replies.filter(reply=>reply.letter_id===letter.id&&
              (!reply.deleted_at||filters.box==='lixeira'));
            return <article key={letter.id}
              className={'campaign-letter'+(opened?'':' recolhida')}
              id={'missiva-'+letter.id}>
              <button type="button" className="campaign-letter-toggle"
                aria-expanded={opened}
                onClick={()=>setExpanded(old=>{
                  const next=new Set(old);
                  if(next.has(letter.id))next.delete(letter.id);
                  else next.add(letter.id);
                  return next;
                })}>
                <ChevronDown size={18} className={
                  opened?'rotate-180 transition-transform':'transition-transform'}/>
                <span className="campaign-eyebrow">
                  {letter.letter_number?'Missiva '+letter.letter_number+' · ':''}
                  {letter.letter_kind==='geral'?'Geral':'Reservada'}
                  {' · '+letter.publication_state}
                  {' · '+thread.length+' resposta(s)'}
                </span>
                <strong className="campaign-letter-subject">{letter.subject}</strong>
                <span className="text-muted-foreground text-sm">
                  De: {letter.sender_name??'Remetente histórico'}
                  {' '}({houseName(letter.origin_house_id)})
                  {' · Para: '}
                  {houseName(letter.recipient_house_id)}
                  {' · '+dateText(letter.delivered_at??letter.created_at)}
                </span>
              </button>
              {opened&&<div className="campaign-letter-body">
                <section className="campaign-letter-original"
                  aria-label="Texto original da missiva">
                  <p className="whitespace-pre-wrap break-words">{letter.content}</p>
                </section>
                {thread.length>0&&<section className="campaign-replies campaign-reply-thread"
                  aria-label={'Respostas de '+letter.subject}>
                  <div className="campaign-reply-thread-heading">
                    <h4>Fio de respostas</h4>
                    <span>{thread.length} resposta(s)</span>
                  </div>
                  {thread.map(reply=><article key={reply.id}
                    className="campaign-reply-card">
                    <strong>{reply.author_name??'Resposta histórica'}</strong>
                    <p className="text-xs">{dateText(reply.delivered_at??reply.created_at)}
                      {' · '+reply.publication_state}</p>
                    <p className="whitespace-pre-wrap break-words">{reply.content}</p>
                  </article>)}
                </section>}
                <p className="text-xs opacity-70">
                  Referência histórica original. Nenhuma ação será gravada no Firebase.
                </p>
              </div>}
            </article>;
          })}
        </section>)}
    </div>
  </div>;
  if(admin)return <section className="narrator-mail-hub"
    aria-label="Central de missivas do Narrador">
    <header className="narrator-mail-hub-heading">
      <p className="campaign-eyebrow">NARRADOR · CORRESPONDÊNCIA</p>
      <h2>Central de missivas</h2>
      <p>Filtros, cartas e respostas do acervo original importado, conferidos
        pelo Firebase conforme a sessão do Narrador.</p>
    </header>
    {view}
  </section>;
  return view;
}
