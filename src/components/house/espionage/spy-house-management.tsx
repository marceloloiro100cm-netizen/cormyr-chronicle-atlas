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
import './spy-agent-cards.css';
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
   <div className="house-ledger"><strong>Lei efetiva da Casa</strong><h3>{defense.law}</h3></div>
   <div className="house-ledger"><strong>Defesa geral de Espionagem</strong><h3>{general}</h3></div>
  </div>
  {defense.globalSources.length>0&&<ul>
   {defense.globalSources.map(v=><li key={v.holdingId}>{v.name}: +{v.bonus} — {v.description}</li>)}
  </ul>}
  {defense.otherEffects.length>0&&<details className="house-ledger"><summary>Proteções e efeitos especiais (sem bônus numérico de dificuldade)</summary>
   <ul>{defense.otherEffects.map((e,i)=><li key={i}>{e.name}: {e.description}</li>)}</ul>
  </details>}
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
   <span className="spy-agent-state">{status}</span>
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
    agent.toNextRank+' sucesso(s) até a próxima promoção'}</small>
   <div role="progressbar" aria-label={'Progresso de '+agent.codename}
    aria-valuenow={agent.toNextRank===0?3:3-agent.toNextRank}
    aria-valuemin={0} aria-valuemax={3}>
    <span style={{width:(agent.toNextRank===0?100:(3-agent.toNextRank)/3*100)+'%'}}/>
   </div>
  </div>
  <section className="spy-agent-mission">
   <h5>Missão atual</h5>
   <strong>{progress.mission}</strong>
   {operation&&<small>{missionStatuses[operation.status]??operation.status}</small>}
   <dl>
    <dt>Tempo de viagem</dt><dd>{progress.travel}</dd>
    <dt>Conclusão prevista</dt>
    <dd>{progress.remaining}{progress.end&&<small>{formatDate(progress.end)}</small>}</dd>
   </dl>
  </section>
  <details className="spy-agent-equipment">
   <summary>Equipamentos e melhorias
    <small>{Number(agent.forgedDocuments)+Number(agent.aceInTheHole)} de 2 adquiridos</small>
   </summary>
   <SpyAgentUpgrades houseId={houseId} agent={agent}
    houseVersion={houseVersion} wealth={availableWealth} canEdit={canEdit}/>
  </details>
  <footer className="spy-agent-card-footer">
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
   <small>Confirme o acesso à Casa ou atualize o cadastro.</small>
  </div>}
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
