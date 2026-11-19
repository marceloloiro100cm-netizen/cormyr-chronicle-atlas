import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
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
  const [filters,setFilters]=useState({text:'',number:'',kind:'',read:'',group:'',origin:''});
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [open,setOpen]=useState<Set<string>>(new Set());
  const [pauta,setPauta]=useState<PautaItem[]>(()=>readPauta(userId));
  const [message,setMessage]=useState('');
  useEffect(()=>{const t=setTimeout(()=>setSearch(filters.text),250);return()=>clearTimeout(t);},[filters.text]);
  useEffect(()=>{setPage(0);},[filters.number,filters.kind,filters.read,filters.group,filters.origin,search]);
  const houses=useQuery({queryKey:['editor-mail-houses'],enabled:firebase,queryFn:async()=>{
    const r=await supabase.from('campaign_houses').select('id,name');
    if(r.error)throw r.error;return (r.data??[]) as unknown as {id:string;name:string}[];
  }});
  const houseName=(id:string|null)=>id?houses.data?.find(h=>h.id===id)?.name??'Casa':'Narrador';
  const requestFilters=useMemo(()=>{
    const f:Record<string,unknown>={text:search,number:filters.number,kind:filters.kind,read:filters.read,origin:filters.origin};
    if(filters.group)f['group_house_ids']=narrationHouseIds(filters.group,(houses.data??[]).map(h=>h.id));
    return f;
  },[search,filters,houses.data]);
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
  return <section className="campaign-mail-layout" aria-label="Missivas para a Redação">
    <aside className="campaign-mail-side" aria-label="Filtros das missivas do Editor-Chefe">
      <div className="campaign-mail-filter-fields">
        <label>Buscar<input type="search" value={filters.text} onChange={e=>setFilters({...filters,text:e.target.value})}
          placeholder="Assunto, resposta, autor ou Casa…"/></label>
        {sel('Grupo de narração','group',[['','Todos os grupos'],...NARRATION_GROUPS.map(g=>[g.id,g.label] as [string,string])])}
        {sel('Casa remetente','origin',[['','Todas as Casas'],['none','Narrador / sem vínculo'],...(houses.data??[]).map(h=>[h.id,h.name] as [string,string])])}
        {sel('Semana','number',[['','Todas as semanas'],...[1,2,3,4,5,6,7,8].map(n=>[String(n),'Semana '+n] as [string,string])])}
        {sel('Tipo','kind',[['','Todos os tipos'],['geral','Geral'],['reservada','Reservada']])}
        {sel('Minha leitura','read',[['','Todas'],['no','Não lidas'],['yes','Lidas']])}
        <Button variant="outline" onClick={()=>setFilters({text:'',number:'',kind:'',read:'',group:'',origin:''})}>Limpar filtros</Button>
      </div>
      <section aria-label="Pauta da Folha Sem Selo" className="campaign-mail-filter-fields">
        <strong>Pauta ({pauta.length})</strong>
        <p className="text-xs">Trechos separados ficam neste aparelho. Copie para a Redação ao montar a edição.</p>
        {pauta.map((p,i)=><div key={p.letterId+i} className="text-sm"><b>{p.title}</b> · {p.source}
          <Button size="sm" variant="ghost" onClick={()=>{const next=pauta.filter((_,j)=>j!==i);setPauta(next);savePauta(userId,next);}}>Remover</Button></div>)}
        <div className="campaign-actions">
          <Button size="sm" disabled={!pauta.length} onClick={()=>{void navigator.clipboard.writeText(pautaText)
            .then(()=>setMessage('Pauta copiada. Cole na Redação.'),()=>setMessage('Não foi possível copiar aqui.'));}}>Copiar pauta</Button>
          <Button size="sm" variant="outline" disabled={!pauta.length} onClick={()=>{if(!confirm('Limpar a pauta deste aparelho?'))return;setPauta([]);savePauta(userId,[]);}}>Limpar pauta</Button>
        </div>
      </section>
    </aside>
    <div>
      <p className="campaign-status-banner" role="status">
        Editor-Chefe · somente leitura. Você lê as missivas entregues de todas as Casas para escrever o Jornal;
        não escreve, não responde e não recebe missivas. A leitura só conta quando você marca.
      </p>
      <p role="status" aria-live="polite">{message}</p>
      {mailbox.isPending&&<p role="status">Carregando missivas…</p>}
      {mailbox.error&&<p role="alert">Não foi possível carregar as missivas. <Button onClick={()=>void mailbox.refetch()}>Tentar novamente</Button></p>}
      <nav className="campaign-actions" aria-label="Páginas de missivas">
        <Button disabled={page===0||mailbox.isFetching} onClick={()=>setPage(x=>x-1)}>Anterior</Button>
        <span>Página {page+1} · {mailbox.data?.total??0} missivas</span>
        <Button disabled={mailbox.isFetching||(page+1)*20>=(mailbox.data?.total??0)} onClick={()=>setPage(x=>x+1)}>Próxima</Button>
      </nav>
      {mailbox.data&&letters.length===0&&<p className="campaign-empty">Nenhuma missiva encontrada.</p>}
      {letters.map(letter=>{
        const thread=replies.filter(r=>r.letter_id===letter.id&&!r.deleted_at);
        const receipt=receipts.data?.find(r=>r.letter_id===letter.id&&r.user_id===userId);
        const read=isLetterRead(letter.id,receipt,thread);
        const isOpen=open.has(letter.id);
        const from=`${letter.sender_name??'Remetente'} (${houseName(letter.origin_house_id)})`;
        return <article key={letter.id} className={'campaign-letter'+(isOpen?'':' recolhida')}>
          <button type="button" className="campaign-letter-toggle" aria-expanded={isOpen}
            onClick={()=>setOpen(s=>{const n=new Set(s);if(n.has(letter.id))n.delete(letter.id);else n.add(letter.id);return n;})}>
            <ChevronDown size={18} className={isOpen?'rotate-180 transition-transform':'transition-transform'}/>
            <span className="campaign-eyebrow">{letter.delivery_week?'Semana '+letter.delivery_week+' · ':''}
              {letter.letter_kind==='geral'?'Geral':'Reservada'} · {read?'Lida':'Não lida'}
              {thread.length?' · '+thread.length+' resposta(s)':''}{letter.edited_at?' · Editada':''}</span>
            <strong className="campaign-letter-subject">{letter.subject}</strong>
            <span className="text-muted-foreground text-sm">De: {from} · Para: {houseName(letter.recipient_house_id)} · {when(letter.delivered_at??letter.created_at)}</span>
          </button>
          {isOpen&&<div className="campaign-letter-body">
            <section className="campaign-letter-original" aria-label="Texto da missiva"><CampaignContent content={letter.content}/></section>
            {thread.length>0&&<section className="campaign-replies campaign-reply-thread" aria-label={'Respostas de '+letter.subject}>
              <div className="campaign-reply-thread-heading"><h4>Fio de respostas</h4><span>{thread.length} resposta(s)</span></div>
              {thread.map(r=><article key={r.id} className="campaign-reply-card">
                <strong>{r.author_name??'Resposta'}</strong> <small>{when(r.delivered_at??r.created_at)}</small>
                <div className="campaign-reply-text"><CampaignContent content={r.content}/></div>
                <Button size="sm" variant="outline" onClick={()=>addPauta(letter,r.content,`${r.author_name??'Resposta'}, Semana ${letter.delivery_week??'?'}`)}>+ Pauta</Button>
              </article>)}
            </section>}
            <div className="campaign-actions">
              {read?<Button variant="outline" onClick={()=>void mark(letter.id,false)}>Marcar como não lida</Button>
                :<Button onClick={()=>void mark(letter.id,true)}>Marcar como lida</Button>}
              <Button variant="outline" onClick={()=>addPauta(letter,letter.content,`${from}, Semana ${letter.delivery_week??'?'}`)}>+ Pauta</Button>
            </div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
