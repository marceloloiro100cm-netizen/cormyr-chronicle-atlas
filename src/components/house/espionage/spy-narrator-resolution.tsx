import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Gavel} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {resolveSpyAgentMission} from '@/lib/espionage/spy-agent-actions.functions';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SPY_INTELLIGENCE_OBJECTIVES} from '@/lib/espionage/spy-intelligence-rules';

type Op=SpyManagement['operations'][number];
type Agent=SpyManagement['agents'][number];
const missionLabels:Record<string,string>={
 regional_recon:'Reconhecimento da região',
 house_recon:'Espionar uma Casa nobre',
 economy:'Levantar informações econômicas',
 military:'Levantar informações militares',
 family:'Investigar a família nobre',
 law:'Investigar a Lei local',
 rumors:'Investigar rumores',dossier_refresh:'Atualizar informações antigas',
};
const outcomeLabels:Record<string,string>={
 mission_success:'Missão concluída com sucesso',
 mission_failure:'Missão fracassada sem descoberta',
 escaped:'Espião descoberto e conseguiu fugir',
 captured:'Espião descoberto e preso',
 dead:'Espião morto durante a missão',
 available:'Agente disponível',completed:'Missão concluída',
};
function NarratorDecision({houseId,operation,agent}:{
 houseId:string;operation:Op;agent:Agent;
}){
 const action=useServerFn(resolveSpyAgentMission);
 const queryClient=useQueryClient();
 const [roll,setRoll]=useState(agent.cunning*3);
 const [modifier,setModifier]=useState(0);
 const [discovered,setDiscovered]=useState(false);
 const [guard,setGuard]=useState<'unknown'|'yes'|'no'>('unknown');
 const [prison,setPrison]=useState<'unknown'|'yes'|'no'>('unknown');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [outcome,setOutcome]=useState('');
 const [error,setError]=useState('');
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');setOutcome('');
  try{
   const response=await action({data:{
    operationId:operation.id,roll,modifier,discovered,
    guardOverride:guard==='unknown'?null:guard==='yes',
    prisonOverride:prison==='unknown'?null:prison==='yes',
    expectedAgentVersion:agent.version,
    requestKey:crypto.randomUUID(),reason,
   }});
   setOutcome('Resultado: '+(outcomeLabels[response.outcome??response.status]??'Missão resolvida')+
    ' · '+response.rank+' (Astúcia '+response.cunning+'; '+response.cunning+' dados de seis faces)'+
    (response.promoted?' · promovido automaticamente':''));
   await Promise.all([
    queryClient.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    queryClient.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
   ]);
  }catch{setError('Não foi possível resolver. Exige missão autorizada, viagem concluída e confirmação de guardas/cadeia quando não houver ficha operacional.');}
  finally{setBusy(false);}
 };
 return <form className="house-ledger" onSubmit={e=>void submit(e)}
  style={{padding:12,display:'grid',gap:9}}>
  <strong>{agent.codename} · {agent.rank} · Astúcia {agent.cunning} ({agent.cunning} dados de seis faces)</strong>
  <small>Objetivo: {SPY_INTELLIGENCE_OBJECTIVES.find(item=>item.id===operation.objective)?.label
   ??missionLabels[operation.missionKind]??'Missão de espionagem'} · Alvo: {operation.targetId}</small>
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
   <label>Resultado dos dados
    <input type="number" min={agent.cunning} max={agent.cunning*6}
     value={roll} onChange={e=>setRoll(Number(e.target.value))}/>
   </label>
   <label>Bônus ou penalidade
    <input type="number" min={-9} max={9} value={modifier}
     onChange={e=>setModifier(Number(e.target.value))}/>
   </label>
  </div>
  <label style={{display:'flex',gap:8}}>
   <input type="checkbox" checked={discovered} onChange={e=>setDiscovered(e.target.checked)}/>
   Agente foi descoberto
  </label>
  <p className="house-caption">Para casas sem ficha operacional, confirme a presença de
   guardas e prisão. Esses dados são necessários para definir fuga, prisão ou morte.
   Em casas com ficha, as estruturas oficiais prevalecem.</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <label>Guardas da Casa
    <select value={guard} onChange={e=>setGuard(e.target.value as typeof guard)}>
     <option value="unknown">A confirmar</option><option value="yes">Sim</option>
     <option value="no">Não</option>
    </select>
   </label>
   <label>Cadeia da Casa
    <select value={prison} onChange={e=>setPrison(e.target.value as typeof prison)}>
     <option value="unknown">A confirmar</option><option value="yes">Sim</option>
     <option value="no">Não</option>
    </select>
   </label>
  </div>
  <label>Descrição do resultado e circunstâncias
   <textarea rows={2} maxLength={1200} value={reason}
    onChange={e=>setReason(e.target.value)} placeholder="Detalhes da missão"/>
  </label>
  <Button type="submit" disabled={busy||roll<agent.cunning||roll>agent.cunning*6}>
   <Gavel size={16}/>{busy?'Resolvendo…':'Homologar resultado e atualizar agente'}
  </Button>
  {outcome&&<p role="status">{outcome}</p>}
  {error&&<p role="alert">{error}</p>}
 </form>;
}

/** Only narrator may adjudicate pending registered operations. A simulation
 * never creates a mission or records a success for progression purposes.
 */
export function SpyNarratorResolutionPanel({data}:{data:SpyManagement}){
 const pending=data.operations.filter(o=>
  o.status==='pending_narrator_review'&&o.targetType==='house');
 if(!pending.length)return null;
 return <section className="house-panel" aria-label="Resolução de espionagem pelo Narrador">
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">EXCLUSIVO DO NARRADOR</p>
   <h3><Gavel size={18} style={{display:'inline-block',verticalAlign:'middle'}}/>
    {' '}Homologar missões de espionagem</h3>
  </div></div>
  <div style={{display:'grid',gap:12}}>
   {pending.map(o=>{
    const agent=data.agents.find(a=>a.id===o.assetId);
    return agent?<NarratorDecision key={o.id} houseId={data.houseId}
     operation={o} agent={agent}/>:null;
   })}
  </div>
 </section>;
}
