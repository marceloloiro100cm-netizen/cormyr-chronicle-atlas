import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {readSpyNarratorIncidentsBrowser} from '@/lib/espionage/spy-operations-browser';

const outcomes={
 escaped:'Fuga após descoberta',
 captured:'Captura confirmada',
 dead:'Morte em operação',
} as const;

/** Admin-only; RPC performs authorization in PostgreSQL before any data arrives. */
export function SpyNarratorIncidentHistory(){
 const [expanded,setExpanded]=useState(false);
 const [queryText,setQueryText]=useState('');
 const [outcome,setOutcome]=useState('all');
 const [limit,setLimit]=useState(15);
 const query=useQuery({
  queryKey:['spy-narrator-incidents'],
  queryFn:readSpyNarratorIncidentsBrowser,enabled:expanded,
  retry:false,staleTime:30_000,
 });
 const search=queryText.trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const normalized=(s:string)=>s.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const visible=(query.data??[]).filter(row=>
  (outcome==='all'||row.outcome===outcome)&&
  (!search||[row.ownerHouseName,row.targetHouseName,row.agentName,row.targetRegion??'']
   .some(value=>normalized(value).includes(search))));
 return <details className="house-ledger spy-narrator-incidents"
  onToggle={e=>setExpanded(e.currentTarget.open)}>
  <summary><ShieldAlert size={18} aria-hidden="true"/>
   {' '}Incidentes de contraespionagem do reino</summary>
  <p className="house-caption">Arquivo confidencial de capturas, fugas e mortes
   já resolvidas. Apenas o Narrador conhece os agentes e suas Casas.</p>
  <div className="spy-narrator-incidents-toolbar">
   <label>Casa ou agente
    <input value={queryText} onChange={e=>{setQueryText(e.target.value);setLimit(15);}}
     placeholder="Pesquisar ocorrência"/>
   </label>
   <label>Resultado
    <select value={outcome} onChange={e=>{setOutcome(e.target.value);setLimit(15);}}>
     <option value="all">Todos</option>
     <option value="escaped">Fugas</option>
     <option value="captured">Capturas</option>
     <option value="dead">Mortes</option>
    </select>
   </label>
   <Button type="button" variant="outline" disabled={!expanded||query.isFetching}
    onClick={()=>void query.refetch()}>Atualizar</Button>
  </div>
  {query.isPending&&<p role="status">Consultando incidentes…</p>}
  {query.isError&&<p role="alert">O histórico de incidentes está indisponível
   para esta sessão.</p>}
  {query.data&&<>
   <p role="status" className="house-caption">{visible.length} ocorrência(s) no filtro.</p>
   {visible.length?<ol className="spy-narrator-incident-list">
    {visible.slice(0,limit).map(row=><li key={row.id}>
     <strong>{outcomes[row.outcome]}</strong>
     <span>{row.ownerHouseName} → {row.targetHouseName}</span>
     <small>{row.agentName} · {parseDate(row.dateKey)?formatDate(row.dateKey):'Data pendente'}
      {row.targetRegion?' · '+row.targetRegion:''}</small>
     {row.detail&&<small>{row.detail}</small>}
    </li>)}
   </ol>:<p className="house-caption">Nenhum incidente neste filtro.</p>}
   {visible.length>limit&&<Button type="button" variant="outline"
    onClick={()=>setLimit(v=>v+15)}>Ver mais incidentes</Button>}
  </>}
 </details>;
}
