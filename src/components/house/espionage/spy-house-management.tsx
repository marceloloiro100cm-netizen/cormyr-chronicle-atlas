import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Eye,ShieldCheck,Pencil,Check,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,parseDate} from '@/lib/calendar/harptos';
import {advanceHarptosDesdia,listCrossedHarptosPeriods} from '@/lib/calendar/temporal-engine';
import {calculateSpyDefense} from '@/lib/espionage/spy-defense';
import {loadSpyHouseManagement,renameSpyAgent,type SpyManagement} from '@/lib/espionage/spy-management.functions';
import type {HouseState} from '@/lib/house/types';
import {REGIONS} from '@/lib/house/regions';
import {SpyAgentUpgrades} from './spy-agent-upgrades';
import {SpyAgentRecruitment,SpyAgentHistory} from './spy-agent-recruitment-history';
import {SpyNarratorResolutionPanel} from './spy-narrator-resolution';

const missionKinds:Record<string,string>={
 regional_recon:'Reconhecimento regional',house_recon:'Espionar Casa',
 economy:'Informações econômicas',military:'Informações militares',
 family:'Família nobre',law:'Investigar Lei local',
 rumors:'Rumores',dossier_refresh:'Atualizar dossiê',
};
const agentStatuses:Record<string,string>={
 available:'Disponível',assigned:'Designado',traveling:'Em viagem',
 operating:'Investigando',returning:'Retornando',
 missing:'Desaparecido',captured:'Capturado',dead:'Morto em operação',retired:'Retirado',
 lost:'Perdido',pending_review:'Em análise',
};
const missionStatuses:Record<string,string>={
 draft:'Rascunho',planned:'Planejada',traveling:'Em deslocamento',
 operating:'Investigando',pending_narrator_review:'Aguardando Narrador',
 returning:'Retornando',completed:'Concluída',cancelled:'Cancelada',
};
type Mission=SpyManagement['operations'][number];
function pendingMission(operations:Mission[],assetId:string){
 const items=operations.filter(o=>o.assetId===assetId);
 return items.find(o=>!['completed','cancelled'].includes(o.status))??items[0]??null;
}
/** Calendar projections are estimates. No persisted operation end date yet
 * exists; a pending narrator review never counts as a completed operation.
 */
export function spyMissionProgress(operation:Mission|null,officialDate:string|null){
 if(!operation)return {
  mission:'Sem missão registrada',travel:'—',remaining:'—',
 };
 const mission=missionKinds[operation.missionKind]??operation.missionKind;
 const target=operation.targetType==='region'
  ?REGIONS[operation.targetId]?.name??operation.targetId:operation.targetId;
 const title=mission+' · '+target;
 if(operation.status==='completed')return {mission:title,travel:operation.travelDays===null?'—':operation.travelDays+' dias programados',remaining:'Concluída pelo Narrador'};
 if(operation.status==='cancelled')return {mission:title,travel:'Cancelada',remaining:'Cancelada'};
 const travel=operation.travelDays===null?'Viagem sem prazo registrado':operation.travelDays+' dias de viagem previstos';
 if(!operation.arrivalKey||!parseDate(operation.arrivalKey))
  return {mission:title,travel,remaining:'Sem término homologado'};
 const end=dateKey(advanceHarptosDesdia(operation.arrivalKey,1));
 if(!officialDate||!parseDate(officialDate))
  return {mission:title,travel,remaining:'Previsão: '+formatDate(end)+' (sem data oficial)'};
 const travelRemaining=Math.max(0,listCrossedHarptosPeriods(officialDate,operation.arrivalKey).ordinaryDaysElapsed);
 const remaining=Math.max(0,listCrossedHarptosPeriods(officialDate,end).ordinaryDaysElapsed);
 return {mission:title,travel:travel+' · faltam '+travelRemaining+' dias ordinários',
  remaining:remaining?remaining+' dias ordinários (previsão)': 'Prazo previsto atingido · aguarda Narrador',
  end,
 };
}

export function SpyDefensePanel({state}:{state:HouseState}){
 const defense=calculateSpyDefense(state);
 const general=defense.baseDifficulty+defense.globalBonuses;
 return <section className="house-panel" aria-label="Defesa de Espionagem">
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">CONTRAESPIONAGEM</p>
   <h3><ShieldCheck size={20} style={{display:'inline-block',verticalAlign:'middle'}}/> Defesa de Espionagem</h3>
  </div></div>
  <p className="house-caption">A Lei da Casa <strong>determina a dificuldade-base do teste</strong>,
   mas não é o número da dificuldade. Pelo livro: Lei até 30 → dificuldade 6;
   a cada 5 pontos completos acima de 30, +3 de dificuldade.
   Acrescente apenas as proteções ativas aplicáveis ao local. Não somamos Lei de outra região.</p>
  <div className="house-input-grid" style={{margin:'12px 0'}}>
   <div className="house-ledger"><strong>Lei efetiva da Casa</strong><h3>{defense.law}</h3>
    <small>Calculada pela ficha, não pela Lei basal da região.</small></div>
   <div className="house-ledger"><strong>Defesa geral de Espionagem</strong><h3>{general}</h3>
    <small>Dificuldade-base {defense.baseDifficulty} (gerada pela Lei {defense.law})
     + proteção geral {defense.globalBonuses}</small></div>
  </div>
  {defense.globalSources.length>0&&<ul>
   {defense.globalSources.map(v=><li key={v.holdingId}>{v.name}: +{v.bonus} — {v.description}</li>)}
  </ul>}
  <div style={{overflowX:'auto'}}>
   <table><thead><tr><th scope="col">Domínio</th><th scope="col">Dificuldade-base</th>
    <th scope="col">Bônus das construções</th><th scope="col">Dificuldade total</th></tr></thead>
    <tbody>{defense.domains.map(row=><tr key={row.domainId}>
     <td>{row.name}{row.sources.length>0&&<ul>{row.sources.map(source=>
      <li key={source.holdingId}>{source.name}: +{source.bonus}</li>)}</ul>}</td>
     <td>{defense.baseDifficulty}</td><td>+{defense.globalBonuses+row.localBonuses}</td>
     <td><strong>{row.difficulty}</strong></td>
    </tr>)}</tbody>
   </table>
  </div>
  {defense.domains.length===0&&<p className="house-caption">Nenhum domínio na ficha. A defesa geral continua visível.</p>}
  {defense.otherEffects.length>0&&<details className="house-ledger"><summary>Proteções e efeitos especiais (sem bônus numérico de dificuldade)</summary>
   <ul>{defense.otherEffects.map((e,i)=><li key={i}>{e.name}: {e.description}</li>)}</ul>
  </details>}
  <details className="house-ledger"><summary>Entenda a conversão da Lei</summary>
   <p>A Lei {defense.law} desta Casa corresponde à dificuldade-base
    <strong> {defense.spyCellDiscoveryDifficulty}</strong>.
    É essa dificuldade, e não o valor bruto de Lei, que recebe os bônus
    específicos de contraespionagem dos domínios.</p>
  </details>
  <small>A dificuldade de espionagem é calculada a partir da Lei mais os bônus
   pertinentes. A probabilidade de sucesso depende da Astúcia do agente,
   das condições da missão e da avaliação final do Narrador.</small>
 </section>;
}

function AgentRow({agent,operation,houseId,canEdit,officialDate,houseVersion,availableWealth}:{agent:SpyManagement['agents'][number];
 operation:Mission|null;houseId:string;canEdit:boolean;officialDate:string|null;
 houseVersion:number;availableWealth:number|null}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(agent.codename);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const rename=useServerFn(renameSpyAgent);
 const qc=useQueryClient();
 const progress=spyMissionProgress(operation,officialDate);
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   await rename({data:{
    houseId,agentId:agent.id,name:name.trim(),expectedVersion:agent.version,
    requestKey:crypto.randomUUID(),
   }});
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
   ]);
   setEditing(false);
  }catch{
   setError('Não foi possível salvar o nome. Recarregue o cadastro e confirme as permissões.');
  }finally{setBusy(false);}
 };
 return <tr>
  <td><strong>{agent.codename}</strong>
   <small style={{display:'block'}}>{agent.currentRegion?
    REGIONS[agent.currentRegion]?.name??agent.currentRegion:'Localização não confirmada'}</small>
   {canEdit&&!editing&&<Button type="button" size="sm" variant="ghost"
    onClick={()=>{setName(agent.codename);setEditing(true);}}><Pencil size={14}/>Dar nome</Button>}
   {canEdit&&editing&&<form onSubmit={e=>void save(e)}>
    <label>Nome do agente<input value={name} onChange={e=>setName(e.target.value)}
     autoFocus required minLength={2} maxLength={80}/></label>
    <Button type="submit" size="sm" disabled={busy||name.trim().length<2||name.trim().length>80}>
     <Check size={14}/>Salvar</Button>
    <Button type="button" size="sm" variant="ghost" disabled={busy}
     onClick={()=>setEditing(false)}><X size={14}/>Cancelar</Button>
   </form>}
   {error&&<small role="alert">{error}</small>}
  </td>
  <td>
   <strong>{agent.rank} · Astúcia {agent.cunning}D6</strong>
   <small style={{display:'block'}}>{agent.missionSuccesses} missões bem-sucedidas ·
    {agent.toNextRank===0?' nível máximo':agent.toNextRank+' para a próxima promoção'}
   </small>
   <div role="progressbar" aria-label={'Progresso de '+agent.codename}
    aria-valuenow={agent.toNextRank===0?3:3-agent.toNextRank}
    aria-valuemin={0} aria-valuemax={3}
    style={{marginTop:5,height:7,borderRadius:99,
     background:'rgba(150,161,181,.25)',overflow:'hidden'}}>
    <div style={{width:(agent.toNextRank===0?100:(3-agent.toNextRank)/3*100)+'%',
     height:'100%',borderRadius:99,background:'#a98b54'}}/>
   </div>
  </td>
  <td>{agentStatuses[agent.status]??agent.status}</td>
  <td>{progress.mission}<small style={{display:'block'}}>{operation?missionStatuses[operation.status]??operation.status:''}</small></td>
  <td>{progress.travel}</td>
  <td>{progress.remaining}{progress.end&&<small style={{display:'block'}}>{formatDate(progress.end)}</small>}</td>
  <td><SpyAgentUpgrades houseId={houseId} agent={agent}
   houseVersion={houseVersion} wealth={availableWealth} canEdit={canEdit}/></td>
 </tr>;
}

export function SpyAgentManagement({houseId,canEdit,admin=false}:{houseId:string;canEdit:boolean;admin?:boolean}){
 const queryFn=useServerFn(loadSpyHouseManagement);
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['spy-house-management',houseId],
  queryFn:()=>queryFn({data:{houseId}}),retry:false,staleTime:15_000,
 });
 const time=useCampaignTime();
 const officialDate=time.data&&!time.isError?dateKey(time.data):null;
 return <section className="house-panel" aria-label="Gerenciamento de Agentes">
  <div className="house-section-heading"><div><p className="campaign-eyebrow">GERENCIAMENTO DE AGENTES</p>
   <h3><Eye size={20} style={{display:'inline-block',verticalAlign:'middle'}}/> Agentes e Missões</h3></div>
   <Button type="button" variant="outline" onClick={()=>void refetch()}>Atualizar</Button>
  </div>
  <p>Consulte os agentes de sua Casa, a missão registrada, a viagem e o prazo previsto.
   Dar nome ao agente altera seu cadastro, mas não cria nem inicia uma missão.</p>
  {isPending&&<p role="status">Consultando os agentes da Casa…</p>}
  {isError&&<p role="alert">A tabela protegida de agentes ainda não está instalada ou não foi autorizada para esta Casa.</p>}
  {data&&<div style={{overflowX:'auto'}}>
   <table><thead><tr><th scope="col">Agente</th><th scope="col">Nível / Astúcia</th><th scope="col">Situação</th>
    <th scope="col">Missão</th><th scope="col">Tempo de viagem</th><th scope="col">Até terminar a missão</th><th scope="col">Equipamentos de espionagem</th></tr></thead>
    <tbody>{data.agents.map(agent=><AgentRow key={agent.id}
     houseId={houseId} agent={agent} canEdit={canEdit} officialDate={officialDate}
     houseVersion={data.houseVersion} availableWealth={data.availableWealth}
     operation={pendingMission(data.operations,agent.id)}/>)}</tbody>
   </table>
   {!data.agents.length&&<p>Esta Casa ainda não possui agentes conciliados.</p>}
  </div>}
  {data&&<p className="house-caption">Riqueza disponível: <strong>
   {data.availableWealth===null?'não conciliada':data.availableWealth}</strong>.
   Cada melhoria custa 1 ponto de Riqueza, uma única vez por agente.
   As compras continuam vinculadas à ficha da Casa e ao histórico econômico.</p>}
  {data&&<SpyAgentRecruitment houseId={houseId}
   recruitment={data.recruitment} canEdit={canEdit}/>}
  {data&&<SpyAgentHistory data={data}/>}
  {data&&admin&&<SpyNarratorResolutionPanel data={data}/>}
  <p className="house-caption">Prazo restante usa a data oficial do Hub Temporal.
   Quando o banco possuir data de chegada, a tabela prevê mais 1 désdia de investigação.
   O prazo é estimado, não uma conclusão automática: o Narrador precisa registrar a resolução.
   Sem rota ou data homologada, o prazo fica pendente.</p>
 </section>;
}
