import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {UserPlus,Archive} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {recruitSpyAgent} from '@/lib/espionage/spy-agent-actions.functions';
import {formatDate} from '@/lib/calendar/harptos';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';

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
 const byId=new Map(data.agents.map(a=>[a.id,a.codename]));
 const events=data.history;
 return <details className="house-ledger" style={{marginTop:16,padding:14}}>
  <summary><Archive size={16} style={{display:'inline-block',verticalAlign:'middle'}}/> Histórico permanente dos espiões ({events.length})</summary>
  <p className="house-caption">Registros de promoções, compras, sucessos, fugas, prisões e baixas.
   O histórico não é apagado quando uma vaga é ocupada por outro agente.</p>
  {!events.length?<p>Nenhum registro de operação concluída.</p>:
  <div style={{overflowX:'auto'}}>
   <table><thead><tr><th>Data de Cormyr</th><th>Agente</th><th>Ocorrência</th><th>Nível</th><th>Detalhes</th></tr></thead>
    <tbody>{events.map(v=><tr key={v.id}>
     <td>{formatDate(v.dateKey)}</td>
     <td><strong>{byId.get(v.agentId)??'Agente histórico'}</strong></td>
     <td>{({
      recruited:'Recrutamento',mission_success:'Missão bem-sucedida',
      mission_failure:'Missão fracassada',escaped:'Fuga',captured:'Prisão',
      dead:'Morte em operação',promoted:'Promoção',
      upgrade_purchased:'Compra de equipamento',
     } as Record<string,string>)[v.eventType]??v.eventType}</td>
     <td>{v.rank} · {v.cunning}D6</td>
     <td>{v.detail}{v.targetRegion&&<small style={{display:'block'}}>{v.targetRegion}</small>}</td>
    </tr>)}</tbody>
   </table>
  </div>}
 </details>;
}
