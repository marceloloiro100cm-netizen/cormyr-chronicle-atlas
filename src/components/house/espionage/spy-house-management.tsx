import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Eye,ShieldCheck,Pencil,Check,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate,parseDate} from '@/lib/calendar/harptos';
import {advanceHarptosDesdia,listCrossedHarptosPeriods} from '@/lib/calendar/temporal-engine';
import {calculateSpyDefense} from '@/lib/espionage/spy-defense';
import {renameSpyAgent,type SpyManagement} from '@/lib/espionage/spy-management.functions';
import {readSpyHouseManagementBrowser} from '@/lib/espionage/spy-browser-client';
import type {HouseState} from '@/lib/house/types';
import {REGIONS} from '@/lib/house/regions';
import {SpyAgentUpgrades} from './spy-agent-upgrades';
import {SpyAgentHistory} from './spy-agent-recruitment-history';
import {SpyCreateAgentDialog} from './spy-create-agent-dialog';
import {SpyAgentPortraitControl} from './spy-agent-portrait-control';
import {SpyRemoveAgentButton} from './spy-remove-agent-button';
import {SpyCancelMissionButton} from './spy-cancel-mission-button';
import './spy-agent-cards.css';
import {SpyNarratorResolutionPanel} from './spy-narrator-resolution';
import {SpyHouseCounterintelligence} from './spy-house-counterintelligence';

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
 returning:'Retornando',completed:'Concluída',
};
type Mission=SpyManagement['operations'][number];
/** Only active operations belong on the spy card. Cancelled/completed
 * missions remain accessible in history, but are not a "current mission".
 */
export function pendingMission(operations:Mission[],assetId:string):Mission|null{
 return operations.find(o=>o.assetId===assetId&&
  !['completed','cancelled'].includes(o.status))??null;
}
/** The operation timeline is saved by the secured RPC in the Hub's
 * official Harptos dates; the countdown follows the campaign date, never the
 * player's real clock. The Narrator still resolves success or failure.
 */
type SpyMissionProgress={
 mission:string;travel:string;remaining:string;
 arrival?:string;departure?:string;end?:string;
};
export function spyMissionProgress(
 operation:Mission|null,officialDate:string|null
):SpyMissionProgress{
 if(!operation||operation.status==='cancelled')return {
  mission:'Sem missão registrada',travel:'—',remaining:'—'};
 const mission=missionKinds[operation.missionKind]??operation.missionKind;
 const target=operation.targetHouseName??(
  operation.targetType==='region'
   ?REGIONS[operation.targetId]?.name??operation.targetId:operation.targetId);
 const title=mission+' · '+target;
 if(operation.status==='completed')return {
  mission:title,travel:'Viagem concluída',remaining:'Missão concluída'};
 if(operation.status==='planned')return {
  mission:title,travel:'Sem cronograma de viagem',remaining:'Aguardando atualização da missão'};
 const travelDays=operation.travelDays;
 const arrival=operation.arrivalKey;
 const end=operation.investigationEndKey??
  (arrival&&parseDate(arrival)?dateKey(advanceHarptosDesdia(arrival,1)):null);
 if(!arrival||!parseDate(arrival)||!end||!parseDate(end))return {
  mission:title,travel:'Dados de viagem indisponíveis',remaining:'Atualize a ficha'};
 const daysUntil=(key:string)=>officialDate&&parseDate(officialDate)
  ?Math.max(0,listCrossedHarptosPeriods(officialDate,key).ordinaryDaysElapsed)
  :null;
 const travelLeft=daysUntil(arrival),missionLeft=daysUntil(end);
 const travel=operation.status==='traveling'
  ?'Em viagem · '+(travelLeft===null?'prazo não carregado':
    travelLeft+' dias ordinários restantes')+
    (travelDays!==null?' de '+travelDays+' previstos':'')
  :travelDays===0?'Investigação na região de origem':
   'Viagem concluída · chegada '+formatDate(arrival);
 const remaining=operation.status==='pending_narrator_review'
  ?'Investigação concluída · aguardando resultado do Narrador'
  :missionLeft===null?'Conclusão prevista: '+formatDate(end)
  :missionLeft>0?missionLeft+' dias ordinários restantes':
   'Prazo de investigação atingido';
 return {mission:title,travel,remaining,end,arrival,...(operation.departureKey?{departure:operation.departureKey}:{})};
}

export function SpyDefensePanel({state,houseId}:{state:HouseState;houseId:string}){
 const defense=calculateSpyDefense(state);
 const general=defense.baseDifficulty+defense.globalBonuses;
 return <section className="house-panel" aria-label="Defesa de Espionagem">
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">CONTRAESPIONAGEM</p>
   <h3><ShieldCheck size={20} style={{display:'inline-block',verticalAlign:'middle'}}/> Defesa de Espionagem</h3>
  </div></div>
  <p className="house-caption">A Lei determina a dificuldade-base;
   construções defensivas adicionam bônus. Esta é a proteção da sua própria Casa.</p>
  <div className="spy-defense-overview" aria-label="Composição da defesa">
   <div className="house-ledger"><small>Lei efetiva</small><strong>{defense.law}</strong></div>
   <div className="house-ledger"><small>Base do teste</small><strong>{defense.baseDifficulty}</strong></div>
   <div className="house-ledger"><small>Bônus ativos</small><strong>+{defense.globalBonuses}</strong></div>
   <div className="house-ledger"><small>Defesa total</small><strong>{general}</strong></div>
  </div>
  <details className="house-ledger spy-defense-details">
   <summary>Ver origem dos bônus e proteções</summary>
   {defense.globalSources.length>0?<ul>
    {defense.globalSources.map(v=><li key={v.holdingId}>{v.name}: +{v.bonus} — {v.description}</li>)}
   </ul>:<p className="house-caption">Sem bônus global de construção ativo.</p>}
   {defense.otherEffects.length>0&&<ul>
    {defense.otherEffects.map((e,i)=><li key={i}>{e.name}: {e.description}</li>)}
   </ul>}
   <p className="house-caption">A dificuldade do teste não é igual ao valor bruto da Lei.
    Algumas proteções locais variam conforme o domínio.</p>
  </details>
  <SpyHouseCounterintelligence houseId={houseId}/>
 </section>;
}

function AgentRow({agent,operation,houseId,canEdit,officialDate,houseVersion,availableWealth,portraits}:{agent:SpyManagement['agents'][number];
 operation:Mission|null;houseId:string;canEdit:boolean;officialDate:string|null;
 houseVersion:number;availableWealth:number|null;portraits:SpyManagement['portraits']}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(agent.codename);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const rename=useServerFn(renameSpyAgent);
 const qc=useQueryClient();
 const progress=spyMissionProgress(operation,officialDate);
 const timelineOutOfSync=Boolean(operation&&officialDate&&progress.end&&
  ['traveling','operating'].includes(operation.status)&&
  listCrossedHarptosPeriods(officialDate,progress.end).direction!=='forward');
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
 const status=agentStatuses[agent.status]??agent.status;
 const hasActiveMission=Boolean(operation&&!['completed','cancelled'].includes(operation.status));
 const stage=operation?.status==='traveling'?0:
  operation?.status==='operating'?1:
  operation?.status==='pending_narrator_review'?2:-1;
 const stages=['Viagem','Investigação','Narrador','Concluída'];
 const nextStep=operation?.status==='traveling'
  ?'Próxima etapa: chegada e investigação'
  :operation?.status==='operating'
   ?'Próxima etapa: avaliação pelo Narrador'
   :operation?.status==='pending_narrator_review'
    ?'Próxima etapa: resultado do Narrador'
    :null;
 return <article className="house-card spy-agent-card">
  <header className="spy-agent-card-heading">
   <div className="spy-agent-identity">
    <SpyAgentPortraitControl houseId={houseId} agent={agent}
     portraits={portraits} canEdit={canEdit}/>
    <div className="spy-agent-identity-text">
     <p className="campaign-eyebrow">AGENTE DE ESPIONAGEM</p>
     <h4>{agent.codename}</h4>
     <small>{agent.currentRegion?REGIONS[agent.currentRegion]?.name??agent.currentRegion:
      'Localização não confirmada'}</small>
    </div>
   </div>
   <span className="spy-agent-state" data-status={agent.status}>{status}</span>
  </header>
  {canEdit&&!editing&&<Button type="button" size="sm" variant="outline"
   className="spy-agent-rename" onClick={()=>{setName(agent.codename);setEditing(true);}}>
   <Pencil size={14}/> Alterar nome
  </Button>}
  {canEdit&&editing&&<form className="spy-agent-name-form" onSubmit={e=>void save(e)}>
   <label>Codinome do agente<input value={name} onChange={e=>setName(e.target.value)}
    autoFocus required minLength={2} maxLength={80}/></label>
   <div className="campaign-actions">
    <Button type="submit" size="sm" disabled={busy||name.trim().length<2||name.trim().length>80}>
     <Check size={14}/>Salvar</Button>
    <Button type="button" size="sm" variant="ghost" disabled={busy}
     onClick={()=>setEditing(false)}><X size={14}/>Cancelar</Button>
   </div>
  </form>}
  {error&&<small role="alert" className="house-warning">{error}</small>}
  <div className="spy-agent-stat-grid" aria-label={'Atributos do espião '+agent.codename}>
   <div><small>Graduação</small><strong>{agent.rank}</strong></div>
   <div><small>Astúcia</small><strong>{agent.cunning}D6</strong></div>
   <div><small>Missões bem-sucedidas</small><strong>{agent.missionSuccesses}</strong></div>
  </div>
  <div className="spy-agent-progress">
   <small>{agent.toNextRank===0?'Graduação máxima alcançada':
    (3-agent.toNextRank)+'/3 sucessos na graduação · faltam '+agent.toNextRank}</small>
   <div role="progressbar" aria-label={'Progresso de '+agent.codename}
    aria-valuenow={agent.toNextRank===0?3:3-agent.toNextRank}
    aria-valuemin={0} aria-valuemax={3}>
    <span style={{width:(agent.toNextRank===0?100:(3-agent.toNextRank)/3*100)+'%'}}/>
   </div>
  </div>
  {operation&&<section className="spy-agent-mission">
   <h5>Missão atual</h5>
   <strong>{progress.mission}</strong>
   <small>{missionStatuses[operation.status]??operation.status}</small>
   {stage>=0&&<ol className="spy-mission-stages" aria-label="Etapas da missão">
    {stages.map((item,index)=><li key={item}
     aria-current={index===stage?'step':undefined}
     data-progress={index<stage?'done':index===stage?'current':'upcoming'}>{item}</li>)}
   </ol>}
   {nextStep&&<p className="spy-agent-next-step-label">{nextStep}</p>}
   <p className="spy-agent-next-step" role="status">{progress.remaining}</p>
   {progress.end&&<p className="spy-agent-finish-date">
    Conclusão prevista: <strong>{formatDate(progress.end)}</strong>
   </p>}
   {timelineOutOfSync&&<div className="spy-mission-sync-alert" role="status">
    <span>O prazo chegou. Confirme se o HUB atualizou a etapa da missão.</span>
    <Button type="button" size="sm" variant="outline"
     onClick={()=>void Promise.allSettled([
      qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
      qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
     ])}>Atualizar andamento</Button>
   </div>}
   <details className="spy-agent-timeline-details">
    <summary>Ver datas e percurso</summary>
    <dl>
     <dt>Tempo de viagem</dt><dd>{progress.travel}</dd>
     {progress.departure&&<><dt>Partida</dt>
      <dd>{formatDate(progress.departure)}</dd></>}
     {progress.arrival&&<><dt>Chegada prevista</dt>
      <dd>{formatDate(progress.arrival)}</dd></>}
     <dt>Conclusão prevista</dt>
     <dd>{progress.end?formatDate(progress.end):progress.remaining}</dd>
    </dl>
   </details>
  </section>}
  <details className="spy-agent-equipment">
   <summary>Equipamentos e melhorias
    <small>{Number(agent.forgedDocuments)+Number(agent.aceInTheHole)} de 2 adquiridos</small>
   </summary>
   <SpyAgentUpgrades houseId={houseId} agent={agent}
    houseVersion={houseVersion} wealth={availableWealth} canEdit={canEdit}/>
  </details>
  <footer className="spy-agent-card-footer">
   {operation&&<SpyCancelMissionButton houseId={houseId}
    operation={operation} agentName={agent.codename} canEdit={canEdit}/>}
   <SpyRemoveAgentButton houseId={houseId} agent={agent}
    houseVersion={houseVersion} canEdit={canEdit}
    hasActiveMission={hasActiveMission}/>
  </footer>
 </article>
}

export function SpyAgentManagement({houseId,canEdit,admin=false}:{houseId:string;canEdit:boolean;admin?:boolean}){
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['spy-house-management',houseId],
  queryFn:()=>readSpyHouseManagementBrowser(houseId),retry:false,staleTime:15_000,
  refetchInterval:30_000,refetchIntervalInBackground:false,
  refetchOnWindowFocus:'always',refetchOnReconnect:'always',
 });
 const time=useCampaignTime();
 const officialDate=time.data&&!time.isError?dateKey(time.data):null;
 return <section className="house-panel" aria-label="Gerenciamento de Agentes">
  <div className="house-section-heading"><div><p className="campaign-eyebrow">GERENCIAMENTO DE AGENTES</p>
   <h3><Eye size={20} style={{display:'inline-block',verticalAlign:'middle'}}/> Agentes e Missões</h3></div>
   <div className="campaign-actions" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <SpyCreateAgentDialog houseId={houseId} data={data??null} canEdit={canEdit}/>
    <Button type="button" variant="outline" onClick={()=>void refetch()}>Atualizar</Button>
   </div>
  </div>
  {isPending&&<p role="status">Consultando os agentes da Casa…</p>}
  {isError&&<div role="alert" className="house-ledger" style={{padding:10}}>
   <p style={{margin:0}}>Não foi possível carregar os agentes desta Casa.</p>
   <Button type="button" variant="outline" size="sm"
    onClick={()=>void refetch()}>Tentar novamente</Button>
  </div>}
  {data&&<p className="spy-agent-overview" role="status">
   <strong>{data.agents.filter(a=>a.status==='available').length}</strong> disponíveis
   <span aria-hidden="true"> · </span>
   <strong>{data.agents.filter(a=>['assigned','traveling','operating','returning','pending_review'].includes(a.status)).length}</strong> em missão
   <span aria-hidden="true"> · </span>
   <strong>{data.agents.filter(a=>!['available','assigned','traveling','operating','returning','pending_review','retired'].includes(a.status)).length}</strong> indisponíveis
  </p>}
  {data&&<div className="spy-agent-grid">
   {data.agents.filter(agent=>agent.status!=='retired').map(agent=>
    <AgentRow key={agent.id} houseId={houseId} agent={agent}
     canEdit={canEdit} officialDate={officialDate}
     houseVersion={data.houseVersion} availableWealth={data.availableWealth}
     portraits={data.portraits}
     operation={pendingMission(data.operations,agent.id)}/>)}
  </div>}
  {data&&!data.agents.some(agent=>agent.status!=='retired')&&
   <p className="house-caption">Esta Casa ainda não possui espiões ativos.
    Use <strong>Criar espião</strong> para ocupar vagas disponíveis.</p>}
  {data&&<SpyAgentHistory data={data}/>}
  {data&&admin&&<SpyNarratorResolutionPanel data={data}/>}
 </section>;
}
