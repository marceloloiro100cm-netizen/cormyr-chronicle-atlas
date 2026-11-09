import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Gavel} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {resolveSpyAgentMission} from '@/lib/espionage/spy-agent-actions.functions';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SPY_INTELLIGENCE_OBJECTIVES} from '@/lib/espionage/spy-intelligence-rules';
import './spy-narrator-resolution.css';

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
 const [dossierWarning,setDossierWarning]=useState('');
 const [error,setError]=useState('');
 // Reusar a mesma chave após falha de rede evita dupla homologação.
 const requestKey=useRef<string|null>(null);
 const changed=()=>{requestKey.current=null;setError('');};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');setOutcome('');setDossierWarning('');
  const key=requestKey.current??crypto.randomUUID();
  requestKey.current=key;
  try{
   const response=await action({data:{
    operationId:operation.id,roll,modifier,discovered,
    guardOverride:guard==='unknown'?null:guard==='yes',
    prisonOverride:prison==='unknown'?null:prison==='yes',
    expectedAgentVersion:agent.version,
    requestKey:key,reason,
   }});
   requestKey.current=null;
   setOutcome('Resultado: '+(outcomeLabels[response.outcome??response.status]??'Missão resolvida')+
    ' · '+response.rank+' (Astúcia '+response.cunning+'; '+response.cunning+' dados de seis faces)'+
    (response.promoted?' · promovido automaticamente':''));
   const status=response.intelligenceStatus;
   setDossierWarning(status==='waiting_catalog'
    ?'Missão homologada, mas os segredos aguardam fonte oficial. Reprocesse na fila de Dossiês.'
    :status==='retry_required'
    ?'Missão homologada, mas a atualização do dossiê não foi confirmada. Consulte e reprocesse a pendência.'
    :status==='no_success_award'&&response.outcome==='mission_success'
    ?'Missão bem-sucedida sem prêmio registrado. Verifique a integridade da operação.'
    :'');
   // Uma falha de atualização do cache NÃO desfaz o resultado já gravado.
   // Nunca dizer ao Narrador que a missão falhou após a RPC confirmar êxito.
   try{
    await Promise.all([
     queryClient.invalidateQueries({queryKey:['spy-house-management',houseId]}),
     queryClient.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
     queryClient.invalidateQueries({queryKey:['spy-dossiers']}),
    ]);
   }catch{
    setDossierWarning(previous=>previous||
     'Missão salva, mas a tela não atualizou. Use Atualizar dossiês antes de repetir a operação.');
   }
  }catch{setError('Não foi possível confirmar a resolução. Recarregue a missão e tente novamente com a mesma solicitação.');}
  finally{setBusy(false);}
 };
 return <form className="house-ledger spy-narrator-form" onSubmit={e=>void submit(e)}>
  <strong>{agent.codename} · {agent.rank} · Astúcia {agent.cunning}D6</strong>
  <small>Objetivo: {SPY_INTELLIGENCE_OBJECTIVES.find(item=>item.id===operation.objective)?.label
   ??missionLabels[operation.missionKind]??'Missão de espionagem'} · Alvo: {operation.targetId}</small>
  <div className="spy-narrator-main-fields">
   <label>Resultado dos dados (D6)
    <input type="number" inputMode="numeric" min={agent.cunning} max={agent.cunning*6}
     value={roll} onChange={e=>{changed();setRoll(Number(e.target.value));}}/>
   </label>
   <label>Bônus / penalidade
    <input type="number" inputMode="numeric" min={-9} max={9} value={modifier}
     onChange={e=>{changed();setModifier(Number(e.target.value));}}/>
   </label>
  </div>
  <label className="spy-narrator-check">
   <input type="checkbox" checked={discovered}
    onChange={e=>{changed();setDiscovered(e.target.checked);}}/>
   Espião descoberto?
  </label>
  <details className="spy-narrator-advanced">
   <summary>Proteções do alvo e observações (quando necessário)</summary>
   <p className="house-caption">Preencha guardas e cadeia apenas quando a Casa-alvo
    não possuir ficha operacional. Nas demais Casas, o servidor usa as estruturas oficiais.</p>
   <div className="spy-narrator-main-fields">
    <label>Guardas
     <select value={guard} onChange={e=>{changed();setGuard(e.target.value as typeof guard);}}>
      <option value="unknown">A confirmar</option><option value="yes">Sim</option>
      <option value="no">Não</option>
     </select>
    </label>
    <label>Cadeia
     <select value={prison} onChange={e=>{changed();setPrison(e.target.value as typeof prison);}}>
      <option value="unknown">A confirmar</option><option value="yes">Sim</option>
      <option value="no">Não</option>
     </select>
    </label>
   </div>
   <label>Observações opcionais
    <textarea rows={2} maxLength={1200} value={reason}
     onChange={e=>{changed();setReason(e.target.value);}}
     placeholder="Circunstâncias da missão"/>
   </label>
  </details>
  <small className="house-caption">O servidor calcula a dificuldade, a consequência
   e as descobertas. A confirmação altera a campanha.</small>
  <Button type="submit" disabled={busy||Boolean(outcome)||!Number.isInteger(roll)||
   roll<agent.cunning||roll>agent.cunning*6||!Number.isInteger(modifier)||
   modifier< -9||modifier>9}>
   <Gavel size={16}/>{busy?'Resolvendo…':'Resolver missão'}
  </Button>
  {outcome&&<p role="status">{outcome}</p>}
  {dossierWarning&&<p role="alert" className="house-warning">{dossierWarning}</p>}
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
