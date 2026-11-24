import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {BookOpenCheck,ChevronDown,Eye,Filter,Flame,Newspaper,Search,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import './editor-intelligence.css';
import {CampaignContent} from '@/components/campaign-content';
import {supabase} from '@/integrations/supabase/client';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {isLetterRead,type ReceiptRef} from '@/lib/letters';

/**
 * Editor-Chefe (decisão do proprietário, 19/11/2026): lê toda missiva e
 * resposta ENTREGUE de todas as Casas para escrever A Folha Sem Selo.
 * Não escreve, não responde, não edita, não cancela e não recebe missivas.
 * O servidor aplica a mesma regra (mail_page do Editor; escrita negada).
 * A leitura só conta quando o Editor marca; a pauta fica neste aparelho.
 */
type Letter={id:string;subject:string;content:string;sender_name:string|null;
  sender_user_id:string;origin_house_id:string|null;recipient_house_id:string|null;
  delivered_at:string|null;created_at:string;delivery_week:number|null;
  letter_number:number|null;letter_kind:string|null;campaign_date?:string|null;
  edited_at?:string|null;conversation_id?:string|null};
type Reply={id:string;letter_id:string;content:string;author_name:string|null;
  author_user_id:string;delivered_at:string|null;created_at:string;deleted_at:string|null;
  publication_state:string};
type Page={total:number;letters:Letter[];replies:Reply[]};
type PautaItem={letterId:string;title:string;source:string;excerpt:string;addedAt:string};

const loose=(name:string,args:Record<string,unknown>)=>
  (supabase.rpc as unknown as (this:unknown,n:string,a:Record<string,unknown>)=>
    PromiseLike<{data:unknown;error:{message:string}|null}>).call(supabase,name,args);
const pautaKey=(uid:string)=>'cormyr-editor-pauta:'+uid;
function readPauta(uid:string):PautaItem[]{
  try{const v=JSON.parse(localStorage.getItem(pautaKey(uid))??'[]');return Array.isArray(v)?v:[];}
  catch{return [];}
}
function savePauta(uid:string,items:PautaItem[]){
  try{localStorage.setItem(pautaKey(uid),JSON.stringify(items.slice(-200)));}catch{/* sem armazenamento */}
}
const when=(v:string|null|undefined)=>{
  if(!v)return 'sem data';
  const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString('pt-BR');
};

export function EditorMailReader({userId}:{userId:string}){
  const qc=useQueryClient();
  const firebase=firebaseWorkspaceClient()!==null;
  const [filters,setFilters]=useState({text:'',number:'',kind:'',read:'',group:'',house:'',origin:''});
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [onlyFuros,setOnlyFuros]=useState(false);
  const [open,setOpen]=useState<Set<string>>(new Set());
  const [pauta,setPauta]=useState<PautaItem[]>(()=>readPauta(userId));
  // As sinalizações são anotações editoriais neste aparelho, não alteram as missivas.
  const [furos,setFuros]=useState<Set<string>>(()=>{
    try{return new Set(JSON.parse(localStorage.getItem('cormyr-editor-furos:'+userId)??'[]') as string[]);}
    catch{return new Set<string>();}
  });
  const toggleFuro=(id:string)=>{
    setFuros(previous=>{
      const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);
      try{localStorage.setItem('cormyr-editor-furos:'+userId,JSON.stringify([...next]));}catch{/* armazenamento opcional */}
      return next;
    });
  };
  const [message,setMessage]=useState('');
  useEffect(()=>{const t=setTimeout(()=>setSearch(filters.text),250);return()=>clearTimeout(t);},[filters.text]);
  useEffect(()=>{setPage(0);},[filters.number,filters.kind,filters.read,filters.group,filters.house,filters.origin,search,onlyFuros]);
  useEffect(()=>{if(onlyFuros)setPage(0);},[furos,onlyFuros]);
  const houses=useQuery({queryKey:['editor-mail-houses'],enabled:firebase,queryFn:async()=>{
    const r=await supabase.from('campaign_houses').select('id,name');
    if(r.error)throw r.error;return (r.data??[]) as unknown as {id:string;name:string}[];
  }});
  const houseName=(id:string|null)=>id?houses.data?.find(h=>h.id===id)?.name??'Casa':'Narrador';
  const requestFilters=useMemo(()=>{
    const f:Record<string,unknown>={text:search,number:filters.number,kind:filters.kind,read:filters.read,house:filters.house,origin:filters.origin};
    if(filters.group)f['group_house_ids']=narrationHouseIds(filters.group,(houses.data??[]).map(h=>h.id));
    if(onlyFuros)f['marked_ids']=[...furos];
    return f;
  },[search,filters,houses.data,onlyFuros,furos]);
  const mailbox=useQuery({queryKey:['editor-mail-page',userId,requestFilters,page],enabled:firebase,
    queryFn:async()=>{
      const r=await loose('mail_page',{p_filters:requestFilters,p_page:page,p_size:20});
      if(r.error)throw r.error;return r.data as Page;
    }});
  const receipts=useQuery({queryKey:['editor-mail-receipts',userId],enabled:firebase,queryFn:async()=>{
    const r=await supabase.from('letter_receipts').select('letter_id,user_id,read_at');
    if(r.error)throw r.error;return (r.data??[]) as unknown as ReceiptRef[];
  }});
  const refresh=()=>{void qc.invalidateQueries({queryKey:['editor-mail-page']});void qc.invalidateQueries({queryKey:['editor-mail-receipts']});};
  const mark=async(id:string,read:boolean)=>{
    const r=await loose(read?'mark_letter_read':'mark_letter_unread',{p_id:id});
    if(r.error)setMessage(r.error.message);else{setMessage(read?'Marcada como lida.':'Marcada como não lida.');refresh();}
  };
  const addPauta=(l:Letter,text:string,source:string)=>{
    const excerpt=text.replace(/\s+/g,' ').trim().slice(0,600);
    if(pauta.some(p=>p.letterId===l.id&&p.excerpt===excerpt)){setMessage('Esse trecho já está na pauta.');return;}
    const next=[...pauta,{letterId:l.id,title:l.subject,source,excerpt,addedAt:new Date().toISOString()}];
    setPauta(next);savePauta(userId,next);setMessage('Trecho separado para a pauta.');
  };
  const pautaText=pauta.map(p=>`## ${p.title}\nFonte: ${p.source}\n${p.excerpt}\n`).join('\n');
  if(!firebase)return <p role="status" className="campaign-status-banner">
    A leitura de missivas do Editor-Chefe está disponível na área Firebase da campanha.
  </p>;
  const letters=mailbox.data?.letters??[];
  const replies=mailbox.data?.replies??[];
  const sel=(label:string,key:keyof typeof filters,opts:[string,string][])=>
    <label>{label}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}>
      {opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
  const unreadOnPage=letters.filter(letter=>{
    const thread=replies.filter(r=>r.letter_id===letter.id&&!r.deleted_at);
    const receipt=receipts.data?.find(r=>r.letter_id===letter.id&&r.user_id===userId);
    return !isLetterRead(letter.id,receipt,thread);
  }).length;
  return <section className="folha-intel" aria-label="Central de Informações da Redação">
    <header className="folha-intel-hero">
      <div className="folha-intel-hero-copy">
        <p className="folha-intel-kicker"><ShieldCheck size={16}/> ACERVO CONFIDENCIAL · ACESSO EDITORIAL</p>
        <h3>Entrelinhas de Cormyr</h3>
        <p>Cartas, rumores e relatos de bastidores. Investigue conexões entre as Casas, encontre pistas e transforme os melhores achados em pautas para A Folha Sem Selo.</p>
      </div>
      <div className="folha-intel-readonly"><Eye size={17}/> Consulta exclusiva: nenhuma correspondência pode ser enviada ou respondida por aqui.</div>
    </header>
    <div className="folha-intel-stats" aria-label="Indicadores da investigação">
      <div><Newspaper size={21}/><strong>{mailbox.data?.total??'—'}</strong><span>Informes encontrados</span></div>
      <div><Search size={21}/><strong>{mailbox.data?unreadOnPage:'—'}</strong><span>Ainda não lidos nesta página</span></div>
      <div><Flame size={21}/><strong>{furos.size}</strong><span>Possíveis furos marcados</span></div>
      <div><BookOpenCheck size={21}/><strong>{pauta.length}</strong><span>Recortes na pauta</span></div>
    </div>
    <div className="folha-intel-layout">
      <aside className="folha-intel-sidebar" aria-label="Ferramentas editoriais">
        <div className="folha-intel-panel">
          <h4><Filter size={18}/> Investigar acervo</h4>
          <div className="folha-intel-filter-fields">
            <label>Palavra ou pista<input type="search" value={filters.text}
              onChange={e=>setFilters({...filters,text:e.target.value})}
              placeholder="Nome, assunto, local, rumor…"/></label>
            {sel('Grupo de narração','group',[['','Todos os territórios'],...NARRATION_GROUPS.map(g=>[g.id,g.label] as [string,string])])}
            {sel('Casa envolvida','house',[['','Todas as Casas'],...(houses.data??[]).map(h=>[h.id,h.name] as [string,string])])}
            {sel('Casa remetente (opcional)','origin',[['','Todas as origens'],['none','Narrador / sem vínculo'],...(houses.data??[]).map(h=>[h.id,h.name] as [string,string])])}
            {sel('Período','number',[['','Todas as semanas'],...[1,2,3,4,5,6,7,8].map(n=>[String(n),'Semana '+n] as [string,string])])}
            {sel('Circulação','kind',[['','Todos os informes'],['geral','Geral'],['reservada','Reservada']])}
            {sel('Estado da leitura','read',[['','Todos'],['no','Não lidos'],['yes','Lidos']])}
            <label>Furos sinalizados
              <select value={onlyFuros?'only':'all'} onChange={e=>setOnlyFuros(e.target.value==='only')}>
                <option value="all">Todas as missivas</option>
                <option value="only">Somente furos marcados ({furos.size})</option>
              </select>
            </label>
            <Button variant="outline" onClick={()=>{setOnlyFuros(false);setFilters({text:'',number:'',kind:'',read:'',group:'',house:'',origin:''});}}>Limpar investigação</Button>
          </div>
        </div>
        <div className="folha-intel-panel folha-intel-notebook" aria-label="Caderno de pautas">
          <h4><BookOpenCheck size={18}/> Caderno de pautas <span>{pauta.length}</span></h4>
          <p>Trechos que você selecionou ficam guardados apenas neste aparelho, sem alterar os arquivos originais.</p>
          {pauta.length===0?<p className="folha-intel-empty-note">Nenhuma pista separada. Abra um informe e use “Adicionar à pauta”.</p>:
            <ol>{pauta.map((p,i)=><li key={p.letterId+i}><strong>{p.title}</strong><small>{p.source}</small>
              <button type="button" onClick={()=>{const next=pauta.filter((_,j)=>j!==i);setPauta(next);savePauta(userId,next);}}>Retirar recorte</button>
            </li>)}</ol>}
          <div className="folha-intel-notebook-actions">
            <Button size="sm" disabled={!pauta.length} onClick={()=>{void navigator.clipboard.writeText(pautaText)
              .then(()=>setMessage('Pauta copiada. Cole na Redação.'),()=>setMessage('Não foi possível copiar aqui.'));}}>Copiar pauta</Button>
            <Button size="sm" variant="outline" disabled={!pauta.length} onClick={()=>{
              if(!confirm('Limpar a pauta deste aparelho?'))return;setPauta([]);savePauta(userId,[]);
            }}>Limpar</Button>
          </div>
        </div>
      </aside>
      <main className="folha-intel-stream" aria-label="Informes coletados">
        <div className="folha-intel-stream-head">
          <div><p>ARQUIVO DE FONTES</p><h4>Relatos e correspondências</h4></div>
          <span>{mailbox.data?.total??0} registro(s) · Somente leitura</span>
        </div>
        {message&&<p className="folha-intel-message" role="status" aria-live="polite">{message}</p>}
        {mailbox.isPending&&<p role="status" className="folha-intel-empty">Consultando o arquivo de Cormyr…</p>}
        {mailbox.error&&<p role="alert" className="folha-intel-empty">O acervo não pôde ser consultado. <Button onClick={()=>void mailbox.refetch()}>Tentar novamente</Button></p>}
        {mailbox.data&&letters.length===0&&<p className="folha-intel-empty">{onlyFuros
          ? 'Nenhum furo marcado corresponde aos filtros. As sinalizações ficam guardadas neste aparelho.'
          : 'Nenhum relato atende aos filtros da investigação.'}</p>}
        <div className="folha-intel-feed">{letters.map(letter=>{
          const thread=replies.filter(r=>r.letter_id===letter.id&&!r.deleted_at);
          const receipt=receipts.data?.find(r=>r.letter_id===letter.id&&r.user_id===userId);
          const read=isLetterRead(letter.id,receipt,thread);
          const isOpen=open.has(letter.id);
          const from=(letter.sender_name??'Remetente')+' · '+houseName(letter.origin_house_id);
          const important=furos.has(letter.id);
          return <article key={letter.id} className={'folha-intel-item'+(isOpen?' folha-intel-item-open':'')+(important?' folha-intel-item-furo':'')}>
            <button type="button" className="folha-intel-item-head" aria-expanded={isOpen}
              onClick={()=>setOpen(s=>{const n=new Set(s);if(n.has(letter.id))n.delete(letter.id);else n.add(letter.id);return n;})}>
              <div className="folha-intel-item-tags">
                <span>{letter.delivery_week?'SEMANA '+letter.delivery_week:'SEM PERÍODO'}</span>
                <span>{letter.letter_kind==='geral'?'CIRCULAÇÃO GERAL':'CIRCULAÇÃO RESERVADA'}</span>
                {!read&&<span className="folha-intel-unread">NÃO LIDO</span>}
                {important&&<span className="folha-intel-hot">FURO EM APURAÇÃO</span>}
              </div>
              <strong>{letter.subject}</strong>
              <small>Origem: {from} · Destino: {houseName(letter.recipient_house_id)} · {when(letter.delivered_at??letter.created_at)}</small>
              {thread.length>0&&<span className="folha-intel-thread-count">{thread.length} resposta(s) no fio</span>}
              <ChevronDown size={19} className="folha-intel-item-chevron"/>
            </button>
            {isOpen&&<div className="folha-intel-item-body">
              <div className="folha-intel-source">
                <p className="folha-intel-source-label">DOCUMENTO ORIGINAL · SEM ALTERAÇÕES</p>
                <CampaignContent content={letter.content}/>
              </div>
              {thread.length>0&&<section className="folha-intel-thread" aria-label={'Respostas de '+letter.subject}>
                <h5>Vozes e desdobramentos ({thread.length})</h5>
                {thread.map(r=><article key={r.id}>
                  <strong>{r.author_name??'Correspondente'}</strong><small>{when(r.delivered_at??r.created_at)}</small>
                  <div><CampaignContent content={r.content}/></div>
                  <Button size="sm" variant="outline" onClick={()=>addPauta(letter,r.content,(r.author_name??'Resposta')+', Semana '+(letter.delivery_week??'?'))}>Adicionar resposta à pauta</Button>
                </article>)}
              </section>}
              <div className="folha-intel-actions">
                <Button variant="outline" aria-pressed={important} onClick={()=>toggleFuro(letter.id)}>
                  <Flame size={15}/>{important?'Retirar sinalização de furo':'Sinalizar possível furo'}</Button>
                <Button variant="outline" onClick={()=>addPauta(letter,letter.content,from+', Semana '+(letter.delivery_week??'?'))}>Adicionar à pauta</Button>
                {read?<Button variant="outline" onClick={()=>void mark(letter.id,false)}>Marcar como não lido</Button>
                  :<Button onClick={()=>void mark(letter.id,true)}>Marcar como lido</Button>}
              </div>
            </div>}
          </article>;
        })}</div>
        <nav className="folha-intel-pagination" aria-label="Páginas do arquivo">
          <Button variant="outline" disabled={page===0||mailbox.isFetching} onClick={()=>setPage(x=>x-1)}>Anterior</Button>
          <span>Página {page+1} · {mailbox.data?.total??0} informes</span>
          <Button variant="outline" disabled={mailbox.isFetching||(page+1)*20>=(mailbox.data?.total??0)} onClick={()=>setPage(x=>x+1)}>Próxima</Button>
        </nav>
      </main>
    </div>
  </section>;
}
