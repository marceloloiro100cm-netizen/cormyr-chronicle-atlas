import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {UserPlus,Archive} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {recruitSpyAgent} from '@/lib/espionage/spy-agent-actions.functions';
import {formatDate} from '@/lib/calendar/harptos';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {buildSpyChronicle,filterSpyChronicle} from '@/lib/espionage/spy-agent-chronicle';
import './spy-agent-chronicle.css';

export function SpyAgentRecruitment({houseId,recruitment,canEdit}:{
 houseId:string;recruitment:SpyManagement['recruitment'];canEdit:boolean;
}){
 const [name,setName]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [source,setSource]=useState('');
 const rpc=useServerFn(recruitSpyAgent);
 const qc=useQueryClient();
 const options=recruitment.filter(r=>r.vacancies>0);
 const selected=options.find(r=>r.sourceHoldingId===source)??options[0];
 const recruit=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!selected||name.trim().length<2||busy)return;
  setBusy(true);setError('');setSuccess('');
  try{
   const result=await rpc({data:{
    houseId,sourceHoldingId:selected.sourceHoldingId,codename:name.trim(),
    requestKey:crypto.randomUUID(),
   }});
   setSuccess(result.codename+' foi recrutado como Verde · Astúcia 3D6.');
   setName('');
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
   ]);
  }catch{setError('Não foi possível recrutar. Confira a vaga e o domínio ativo.');}
  finally{setBusy(false);}
 };
 return <div className="house-ledger" style={{marginTop:16,padding:14}}>
  <h4><UserPlus size={17} style={{display:'inline-block',verticalAlign:'middle'}}/> Vagas na Rede de Espiões</h4>
  <p className="house-caption">Prisões e mortes abrem uma vaga na origem do agente.
   A reposição começa como Verde (3D6), com zero sucessos e sem os equipamentos do antecessor.</p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
   {recruitment.map(r=><div key={r.sourceHoldingId} style={{padding:9,borderRadius:10,
    border:'1px solid rgba(140,155,180,.35)',minWidth:170}}>
    <strong>{r.name}</strong>
    <small style={{display:'block'}}>{r.occupied} de {r.capacity} postos · {r.vacancies} vaga(s)</small>
   </div>)}
  </div>
  {canEdit&&selected&&<form onSubmit={e=>void recruit(e)}
    style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',marginTop:10}}>
   <label>Vaga de origem
    <select value={selected.sourceHoldingId} onChange={e=>setSource(e.target.value)}>
     {options.map(r=><option key={r.sourceHoldingId} value={r.sourceHoldingId}>{r.name}</option>)}
    </select>
   </label>
   <label>Nome do novo agente
    <input required minLength={2} maxLength={80} value={name}
     onChange={e=>setName(e.target.value)} placeholder="Codinome do agente"/>
   </label>
   <Button type="submit" disabled={busy||name.trim().length<2}>
    <UserPlus size={16}/>{busy?'Recrutando…':'Recrutar agente Verde'}
   </Button>
  </form>}
  {canEdit&&!selected&&<small>Não há vagas livres no momento.</small>}
  {success&&<p role="status">{success}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}

export function SpyAgentHistory({data}:{data:SpyManagement}){
 const [agentId,setAgentId]=useState('');
 const [kind,setKind]=useState<'all'|'history'|'travel'|'mission'>('all');
 const [search,setSearch]=useState('');
 const [limit,setLimit]=useState(20);
 const byId=new Map(data.agents.map(a=>[a.id,a.codename]));
 const chronicle=buildSpyChronicle(data);
 const visible=filterSpyChronicle(chronicle,agentId,kind,search);
 const page=visible.slice(0,limit);
 return <details className="house-ledger spy-agent-chronicle" style={{marginTop:16,padding:14}}>
  <summary><Archive size={16} style={{display:'inline-block',verticalAlign:'middle'}}/>
   {' '}Histórico cronológico ({chronicle.length})</summary>
  <p className="house-caption">Recrutamento, viagem, investigação, resolução, promoções e equipamento.
   Os eventos usam o calendário de Cormyr e nunca desaparecem ao trocar de agente.</p>
  <div className="spy-chronicle-filters">
   <label>Agente
    <select value={agentId} onChange={e=>{setAgentId(e.target.value);setLimit(20);}}>
     <option value="">Todos</option>
     {data.agents.map(a=><option value={a.id} key={a.id}>{a.codename}</option>)}
    </select>
   </label>
   <label>Tipo
    <select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setLimit(20);}}>
     <option value="all">Todos</option>
     <option value="history">Ocorrências</option>
     <option value="travel">Viagens</option>
     <option value="mission">Missões</option>
    </select>
   </label>
   <label>Pesquisar
    <input placeholder="Nome da missão ou ocorrência" value={search}
     onChange={e=>{setSearch(e.target.value);setLimit(20);}}/>
   </label>
  </div>
  <p role="status" className="house-caption">{visible.length} registro(s) neste filtro.</p>
  {visible.length?<ol className="spy-chronicle-list">
   {page.map(v=><li key={v.id}>
    <small>{formatDate(v.dateKey)} · {byId.get(v.agentId)??'Agente histórico'}</small>
    <strong>{v.label}</strong>
    <span>{v.detail}</span>
   </li>)}
  </ol>:<p className="house-caption">Nenhum evento encontrado.</p>}
  {visible.length>limit&&<Button type="button" variant="outline"
   onClick={()=>setLimit(n=>n+20)}>Ver mais registros</Button>}
 </details>;
}
