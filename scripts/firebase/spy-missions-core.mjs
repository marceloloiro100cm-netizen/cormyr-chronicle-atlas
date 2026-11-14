/**
 * Pure rules of espionage missions (port of SQL 0088, 0091, 0093, 0101, 0102,
 * 0111 and 0112): regional route, immediate start with travel and timeline,
 * cancellation, hub-clock progress, player preview, narrator resolution,
 * counterintelligence and the narrator dashboards. No I/O.
 * Final SQL versions win: 0102 starts the mission at once (0101 only planned it)
 * and 0093 corrects the difficulty formula.
 * Deliberate differences: event dates are ordered chronologically
 * (calendarOrdinal) instead of by text collation, and house names come from
 * house_catalog only (campaign_houses names are not staged in this domain).
 */
import {RULES_VERSION,FREE_STATUSES,SpyError,rankOf,rankIndex,cunningOf,spyScope,requireRead,requireWrite,
  calendarStamp,historyEntry} from './spy-agents-core.mjs';
import {advanceDesdia,calendarOrdinal} from './harptos-core.mjs';

export {SpyError,spyScope,requireRead,requireWrite};
const fail=(code,m)=>{throw new SpyError(code,m);};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyOk=k=>typeof k==='string'&&UUID.test(k);
const intAt=(v,min)=>Number.isInteger(v)&&v>=min;
const TARGET_CLASSES=new Set(['noble','major','royal']);
const OBJECTIVES=new Set(['house_resources','army','possessions']);
const RANK_NAMES=['Verde','Treinada','Veterana','Elite'];

/* --------------------------------- regions -------------------------------- */

export const REGION_LAW={crownlands:20,veilstone:5,shieldmark:10,helmlands:10,horselands:5,dragoncoast:0,
  swordmark:10,ferlin:10,stonelands:0,elfhold:15,volkumburgh:5};
export const LINKS=[
  ['veilstone','ferlin','land_neighbor'],['veilstone','helmlands','land_neighbor'],
  ['veilstone','stonelands','land_neighbor'],['veilstone','swordmark','land_neighbor'],
  ['ferlin','swordmark','land_neighbor'],['ferlin','horselands','land_neighbor'],
  ['swordmark','helmlands','land_neighbor'],['swordmark','crownlands','land_neighbor'],
  ['swordmark','horselands','land_neighbor'],['helmlands','stonelands','land_neighbor'],
  ['helmlands','elfhold','land_neighbor'],['helmlands','crownlands','land_neighbor'],
  ['stonelands','elfhold','land_neighbor'],['stonelands','volkumburgh','land_neighbor'],
  ['elfhold','volkumburgh','land_neighbor'],['elfhold','shieldmark','land_neighbor'],
  ['crownlands','shieldmark','land_neighbor'],['shieldmark','volkumburgh','land_neighbor'],
  ['horselands','dragoncoast','land_neighbor'],['dragoncoast','crownlands','sea_passage'],
  ['dragoncoast','shieldmark','sea_passage'],['crownlands','shieldmark','sea_passage']];

export function normalizeRegion(v){
  const s=String(v??'').replace(/\s+/g,'').toLowerCase();
  return s==='swordmarch'?'swordmark':s==='crownland'?'crownlands':s;
}
const regionApproved=(locations,slug)=>locations.some(l=>l.kind==='region'&&l.refId===slug&&l.approved===true);

/** Breadth-first route over the active links, neighbours in alphabetical order. */
export function missionRoute(from,to,locations){
  const start=normalizeRegion(from),end=normalizeRegion(to);
  if(!regionApproved(locations,start)||!regionApproved(locations,end))fail('invalid','Região do trajeto não cadastrada');
  if(start===end)return {rounds:0,legs:[]};
  const neighbors=c=>[...new Set(LINKS.filter(l=>l[0]===c||l[1]===c).map(l=>l[0]===c?l[1]:l[0]))].sort();
  const queue=[start],seen=new Set([start]),parent=new Map();
  for(let i=0;i<queue.length&&!seen.has(end);i++){
    for(const n of neighbors(queue[i]))if(!seen.has(n)){seen.add(n);queue.push(n);parent.set(n,queue[i]);}
  }
  if(!seen.has(end))fail('invalid','Não há uma ligação regional conhecida para a missão');
  const legs=[];
  for(let cur=end;cur!==start;){
    const prev=parent.get(cur);
    if(prev==null)fail('invalid','Trajeto regional incompleto');
    const passages=LINKS.filter(l=>(l[0]===prev&&l[1]===cur)||(l[1]===prev&&l[0]===cur)).map(l=>l[2]);
    legs.unshift({fromRegion:prev,toRegion:cur,passage:passages.includes('sea_passage')?'sea_passage':passages[0]});
    if(legs.length>25)fail('invalid','Trajeto regional excede 25 etapas');
    cur=prev;
  }
  return {rounds:legs.length,legs};
}

/* ------------------------------ operation docs ----------------------------- */

const eventDoc=(o)=>({id:o.id,operationId:o.operationId,requestKey:o.requestKey,actor:o.actor??null,eventType:o.eventType,
  oldState:o.oldState??null,newState:o.newState??null,reason:o.reason,calendarVersion:o.calendarVersion??null,
  occurredAt:o.occurredAt});
const dateKeyOf=c=>calendarStamp(c).dateKey;

/* --------------------------------- start ---------------------------------- */

/**
 * spy_submit_house_mission (0102). `existingOp`/`existingTimeline` are the
 * rows already using the key in this house; `keyEvent` is any event using it.
 */
export function startMission({actor,houseId,agent,target,destination,expectedAgentVersion,expectedCalendarVersion,key,
  existingOp,existingTimeline,keyEvent,agentLocation,locations,hasOpenOperation,calendar,newId,now}){
  requireWrite(actor,houseId);
  if(typeof houseId!=='string'||!houseId||!agent||typeof target?.id!=='string'||typeof destination!=='string'||
     !destination.trim()||!intAt(expectedAgentVersion,1)||!intAt(expectedCalendarVersion,1)||!keyOk(key))
    fail('invalid','Dados da missão incompletos');
  if(agent.ownerHouseId!==houseId)fail('invalid','Espião não pertence à Casa');
  const targetId=target.id;
  if(existingOp){
    if(existingOp.assetId!==agent.id||existingOp.targetId!==targetId||existingOp.targetType!=='house')
      fail('conflict','Chave da missão já utilizada');
    if(existingOp.status==='cancelled'||existingOp.status==='completed')fail('conflict','Esta missão já foi encerrada');
    const t=existingTimeline;
    return {alreadyApplied:true,result:{operationId:existingOp.id,agentId:agent.id,targetHouseId:targetId,
      status:existingOp.status,alreadyApplied:true,calendarVersion:existingOp.sourceCalendarVersion,
      departureKey:t?.departureKey??null,arrivalKey:t?.arrivalKey??null,investigationEndsKey:t?.investigationEndKey??null,
      travelDays:t?.travelDays??null}};
  }
  if(keyEvent)fail('conflict','Chave de operação já utilizada');
  if(agent.status!=='available'||agent.version!==expectedAgentVersion)fail('conflict','Espião indisponível ou desatualizado');
  if(!agentLocation||!agentLocation.regionId||agentLocation.approved!==true)
    fail('invalid','Localização real do espião não homologada');
  if(hasOpenOperation)fail('conflict','Espião já está executando uma missão');
  if(target.publicReviewed!==true||!TARGET_CLASSES.has(target.classification)||target.id===houseId)
    fail('invalid','Casa-alvo inválida');
  const origin=normalizeRegion(agentLocation.regionId),dest=normalizeRegion(target.region);
  if(dest!==normalizeRegion(destination))fail('invalid','A Casa não pertence à região indicada');
  const path=missionRoute(origin,dest,locations);
  if(!calendar||calendar.version!==expectedCalendarVersion)fail('conflict','O Hub Temporal mudou. Atualize a previsão');
  const stamp=calendarStamp(calendar);
  const departure=stamp.dateKey,arrival=advanceDesdia(departure,path.rounds),end=advanceDesdia(arrival,1);
  const destLoc=locations.filter(l=>l.kind==='region'&&l.refId===dest&&l.approved===true)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0];
  if(!destLoc)fail('invalid','Região de destino sem localização válida');
  const status=path.rounds===0?'operating':'traveling';
  const at=now||new Date().toISOString();
  const operation={id:newId(),assetId:agent.id,ownerHouseId:houseId,missionKind:'house_recon',targetType:'house',targetId,
    status,operationKey:key,requestedFields:['house_overview'],rulesVersion:RULES_VERSION,
    sourceCalendarVersion:stamp.version,version:1,createdBy:actor.uid,createdAt:at};
  const timeline={operationId:operation.id,ownerHouseId:houseId,agentId:agent.id,departureKey:departure,arrivalKey:arrival,
    investigationEndKey:end,originRegion:origin,destinationRegion:dest,travelRounds:path.rounds,travelDays:path.rounds*10,
    route:path.legs,sourceLocationId:agent.currentLocationId,destinationLocationId:destLoc.id,
    sourceCalendarVersion:stamp.version,createdAt:at};
  const newAgent={...agent,status,version:agent.version+1,
    currentLocationId:path.rounds===0?destLoc.id:agent.currentLocationId};
  const event=eventDoc({id:newId(),operationId:operation.id,requestKey:key,actor:actor.uid,eventType:'mission_started',
    oldState:'available',newState:status,calendarVersion:stamp.version,occurredAt:at,
    reason:'Missão de espionagem iniciada imediatamente contra '+target.name+'; origem '+origin+'; destino '+dest+
      '; viagem '+path.rounds+' désdias; chegada '+arrival+'; fim previsto da investigação '+end});
  return {alreadyApplied:false,operation,timeline,agent:newAgent,event,
    result:{operationId:operation.id,agentId:agent.id,targetHouseId:targetId,status,alreadyApplied:false,
      calendarVersion:stamp.version,departureKey:departure,arrivalKey:arrival,investigationEndsKey:end,
      travelDays:path.rounds*10}};
}

/* -------------------------------- cancel ---------------------------------- */

const CANCELLABLE=new Set(['planned','traveling','operating','pending_narrator_review']);
const AGENT_BUSY=new Set(['assigned','traveling','operating','pending_review']);

export function cancelMission({actor,houseId,operation,agent,previousEvent,expectedVersion,key,calendar,newId,now}){
  requireWrite(actor,houseId);
  if(!operation||!keyOk(key)||!intAt(expectedVersion,1))fail('invalid','Dados inválidos para cancelar missão');
  if(operation.ownerHouseId!==houseId)fail('invalid','Missão não pertence à Casa');
  if(!agent||agent.id!==operation.assetId||agent.ownerHouseId!==houseId)fail('invalid','Agente não pertence à missão');
  if(previousEvent){
    if(previousEvent.operationId!==operation.id||previousEvent.eventType!=='mission_cancelled')
      fail('conflict','Chave de operação já usada em outra ação');
    return {alreadyApplied:true,result:{operationId:operation.id,agentId:operation.assetId,status:'cancelled',
      alreadyApplied:true}};
  }
  if(operation.status==='cancelled')fail('conflict','Missão já cancelada');
  if(!CANCELLABLE.has(operation.status))fail('invalid','Esta missão não pode ser cancelada');
  if(operation.version!==expectedVersion)fail('conflict','Missão atualizada. Recarregue antes de cancelar');
  if(!AGENT_BUSY.has(agent.status))fail('invalid','Situação do agente incompatível com o cancelamento');
  const at=now||new Date().toISOString();
  const newOp={...operation,status:'cancelled',version:operation.version+1};
  const newAgent={...agent,status:'available',version:agent.version+1};
  const event=eventDoc({id:newId(),operationId:operation.id,requestKey:key,actor:actor.uid,eventType:'mission_cancelled',
    oldState:operation.status,newState:'cancelled',calendarVersion:calendar?.version,occurredAt:at,
    reason:'Missão cancelada pela Casa. Agente liberado na localização registrada.'});
  return {alreadyApplied:false,operation:newOp,agent:newAgent,event,
    result:{operationId:operation.id,agentId:operation.assetId,status:'cancelled',alreadyApplied:false}};
}

/* ------------------------------- hub clock -------------------------------- */

/**
 * Trigger spy_advance_active_missions, idempotent over the current official
 * date: moves traveling/operating missions to operating or review.
 * `items` = [{timeline,operation,agent}] ordered by timeline.createdAt.
 */
export function advanceMissions({actor,items,calendar,newId,now}){
  if(actor.role!=='narrador')fail('denied','Acesso negado');
  const stamp=calendarStamp(calendar),at=now||new Date().toISOString();
  const nowOrd=calendarOrdinal(stamp.dateKey);
  const out=[];
  for(const {timeline:t,operation:o,agent:a} of [...items].sort((x,y)=>
      String(x.timeline.createdAt).localeCompare(String(y.timeline.createdAt))||
      String(x.timeline.operationId).localeCompare(String(y.timeline.operationId)))){
    if(o.status!=='traveling'&&o.status!=='operating')continue;
    let stage,agentStage;
    if(nowOrd>=calendarOrdinal(t.investigationEndKey)){stage='pending_narrator_review';agentStage='pending_review';}
    else if(nowOrd>=calendarOrdinal(t.arrivalKey)){stage='operating';agentStage='operating';}
    else continue;
    if(stage===o.status)continue;
    const newOp={...o,status:stage,version:o.version+1};
    const newAgent=a&&a.ownerHouseId===t.ownerHouseId&&(a.status==='traveling'||a.status==='operating')
      ?{...a,status:agentStage,version:a.version+1,currentLocationId:t.destinationLocationId}:null;
    out.push({operation:newOp,agent:newAgent,event:eventDoc({id:newId(),operationId:o.id,requestKey:newId(),actor:actor.uid,
      eventType:'mission_clock_progressed',oldState:o.status,newState:stage,calendarVersion:stamp.version,occurredAt:at,
      reason:'Missão avançada automaticamente pelo Hub Temporal em '+stamp.dateKey})});
  }
  return out;
}

/* ------------------------------- house views ------------------------------ */

export function houseTimeline({actor,houseId,timelines,operations,catalog}){
  requireRead(actor,houseId);
  const ops=new Map(operations.map(o=>[o.id,o])),cat=new Map(catalog.map(c=>[c.id,c]));
  return timelines.filter(t=>t.ownerHouseId===houseId)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(t=>{const o=ops.get(t.operationId);return {operationId:t.operationId,agentId:t.agentId,
      operationVersion:o?o.version:null,departureKey:t.departureKey,arrivalKey:t.arrivalKey,
      investigationEndKey:t.investigationEndKey,originRegion:t.originRegion,destinationRegion:t.destinationRegion,
      travelDays:t.travelDays,targetHouseName:o?(cat.get(o.targetId)?.name??null):null};});
}

/* ------------------------- law, defense and preview ----------------------- */

const holdingOk=(h,hs)=>isObj(h)&&h.status==='active'&&(h.parentId==null||h.parentId===''||
  hs.some(p=>isObj(p)&&p.id===h.parentId&&p.status==='active'));
const int0=v=>{const n=Number(v);return Number.isFinite(n)?Math.trunc(n):0;};

/**
 * Target law and defense modifiers from the operational sheet (0093). Throws
 * when the sheet has no consistent law, as SQL does.
 */
function sheetLaw(state,regionLaw,{strictShape}){
  if(!isObj(state))fail('invalid','Ficha operacional sem Lei consistente');
  if(strictShape&&(!isObj(state.base)||!isObj(state.permanent)))fail('invalid','Ficha operacional sem Lei consistente');
  if(!isObj(state.base)||!isObj(state.permanent)||!('law' in state.base)||!('law' in state.permanent))
    fail('invalid',strictShape?'Ficha operacional sem Lei consistente':'Ficha do alvo está incompleta: requer revisão');
  let law=int0(state.base.law)+int0(state.permanent.law);
  if(state.regionalApplied===true&&state.method!=null&&state.method!=='import')law+=regionLaw;
  const mails=Array.isArray(state.mailConsequences)?state.mailConsequences:[];
  for(const m of mails)if(isObj(m)&&m.active===true)law+=Math.max(0,int0(m.changes&&m.changes.law));
  const hs=Array.isArray(state.holdings)?state.holdings:[];
  const has=id=>hs.some(h=>holdingOk(h,hs)&&h.itemId===id);
  const hasRoot=id=>hs.some(h=>isObj(h)&&h.status==='active'&&h.itemId===id);
  const bonus=(hasRoot('pros-secret-police')?6:0)+(has('pros-dog-kennels--guard-dogs')?3:0)+
    (has('pros-black-market--ear-in-the-underworld')?3:0);
  const guardHolding=hs.some(h=>isObj(h)&&h.status==='active'&&
    ['pros-bailiffs','pros-secret-police','pros-bailiffs--military-training'].includes(h.itemId));
  const prison=hs.some(h=>isObj(h)&&h.status==='active'&&h.itemId==='pros-gaol');
  const units=Array.isArray(state.units)?state.units:[];
  const guardUnit=units.some(u=>isObj(u)&&String(u.destroyed??'false')==='false'&&
    (/(guarda|garrison|guarnição)/.test(String(u.name??'').toLowerCase())||/(guard|garrison)/.test(String(u.type??'').toLowerCase())));
  return {law,bonus,guard:guardHolding||guardUnit,prison,globalBonus:has('pros-black-market--ear-in-the-underworld')?3:0};
}
const difficultyOf=(law,bonus)=>6+3*Math.floor(Math.max(0,law-30)/5)+bonus;
const regionOfTarget=(stats,target)=>{
  const r=String(stats?.regionId??target.region??'').replace(/ /g,'').toLowerCase();
  const region=r==='crownland'?'crownlands':r==='swordmarch'?'swordmark':r;
  const regionLaw=REGION_LAW[region];
  return {region,regionLaw};
};

/** spy_player_mission_preview (0091 corrected by 0093). */
export function previewMission({actor,houseId,agent,target,sheet,stats}){
  requireRead(actor,houseId);
  if(!houseId||!target||houseId===target.id)fail('invalid','Casa-alvo inválida');
  if(!agent||agent.ownerHouseId!==houseId)fail('invalid','Agente não pertence a esta Casa');
  if(agent.status!=='available')fail('invalid','Agente indisponível para iniciar missão');
  if(target.publicReviewed!==true||!TARGET_CLASSES.has(target.classification))fail('invalid','Casa-alvo não homologada');
  const regionInfo=regionOfTarget(stats,target);
  const regionLaw=regionInfo.regionLaw;
  if(regionLaw===undefined)fail('invalid','Região oficial desconhecida');
  let law,source,globalBonus=0;
  if(sheet&&sheet.state){
    const s=sheetLaw(sheet.state,regionLaw,{strictShape:true});
    law=s.law;globalBonus=s.bonus;source='operational_sheet';
  }else if(stats&&Number.isInteger(stats.law)){law=stats.law;source='official_spreadsheet';}
  else{law=regionLaw+10;source='regional_fallback';}
  if(!Number.isFinite(law)||law<0||law>100000)fail('invalid','Lei da Casa sem valor homologado');
  return {houseId,agentId:agent.id,targetHouseId:target.id,houseName:target.name,targetRegionId:regionInfo.region,
    houseDefense:difficultyOf(law,globalBonus),source,agentRank:rankOf(agent.missionSuccesses),
    agentCunning:cunningOf(agent.missionSuccesses),provisional:true};
}

/* ------------------------------- resolution ------------------------------- */

/**
 * spy_resolve_agent_mission (0093). Narrator only. Inputs mirror the locked
 * rows; `previousHistory` is the history row already using the key.
 */
export function resolveMission({actor,operation,agent,previousHistory,segments,upgrades,target,sheet,stats,roll,modifier,
  discovered,guardOverride,prisonOverride,expectedVersion,key,reason,calendar,newId,now}){
  if(actor.role!=='narrador')fail('denied','Somente o Narrador pode resolver missões e mortes');
  if(!operation||!keyOk(key)||!Number.isInteger(roll)||!Number.isInteger(modifier)||modifier<-9||modifier>9||
     typeof discovered!=='boolean'||!intAt(expectedVersion,-Infinity)||
     (reason!=null&&(typeof reason!=='string'||reason.length>1200)))fail('invalid','Resolução incompleta ou inválida');
  if(!agent||agent.id!==operation.assetId||agent.ownerHouseId!==operation.ownerHouseId)
    fail('invalid','Agente não pertence à missão');
  if(previousHistory){
    if(previousHistory.agentId!==agent.id||previousHistory.operationId!==operation.id)
      fail('conflict','Chave já utilizada por outro resultado');
    return {alreadyApplied:true,result:{operationId:operation.id,agentId:agent.id,alreadyApplied:true,status:agent.status,
      missionSuccesses:agent.missionSuccesses,rank:rankOf(agent.missionSuccesses),cunning:cunningOf(agent.missionSuccesses)}};
  }
  if(operation.status!=='pending_narrator_review'||operation.targetType!=='house')
    fail('invalid','Apenas missões de Casa aguardando revisão podem ser resolvidas');
  if(segments.some(s=>s.status!=='arrived'))fail('invalid','Viagem ainda não homologada como concluída');
  if(FREE_STATUSES.has(agent.status)||agent.version!==expectedVersion)
    fail('conflict','Agente indisponível ou modificado: atualize a ficha');
  const cunning=cunningOf(agent.missionSuccesses);
  if(roll<cunning||roll>cunning*6)fail('invalid','Rolagem incompatível com a Astúcia do agente');
  if(!target||target.publicReviewed!==true)fail('invalid','Casa-alvo oficial não encontrada');
  const ri=regionOfTarget(stats,target);
  if(ri.regionLaw===undefined)fail('invalid','Região do alvo inválida');
  let law,guard,prison,bonus,source;
  if(sheet&&sheet.state){
    const s=sheetLaw(sheet.state,ri.regionLaw,{strictShape:false});
    law=s.law;guard=s.guard;prison=s.prison;bonus=s.bonus;source='operational_sheet';
  }else{
    law=stats&&Number.isInteger(stats.law)?stats.law:ri.regionLaw+10;
    if(typeof guardOverride!=='boolean'||typeof prisonOverride!=='boolean')
      fail('invalid','Alvo NPC sem inventário: confirme guarda e cadeia');
    guard=guardOverride;prison=prisonOverride;bonus=0;
    source=stats&&Number.isInteger(stats.law)?'official_spreadsheet':'regional_fallback';
  }
  const defense=law+bonus;
  if(!Number.isFinite(law)||law<0||law>100000||defense<0)fail('invalid','Lei/Defesa não homologada');
  const dc=difficultyOf(law,bonus);
  const total=roll+modifier;
  const degrees=Math.ceil(Math.max(0,dc-total)/5);
  const forged=upgrades.some(u=>u.upgradeCode==='forged_documents');
  const ace=upgrades.some(u=>u.upgradeCode==='ace_in_the_hole');
  const effective=Math.max(1,degrees-(forged?1:0));
  let outcome;
  if(total>=dc)outcome='mission_success';
  else if(!discovered)outcome='mission_failure';
  else if(effective<=1)outcome='escaped';
  else if(effective>=3&&law>=30&&guard)outcome=ace?'captured':'dead';
  else if(effective>=2&&law>=15&&guard&&prison)outcome='captured';
  else outcome='escaped';
  const oldRank=rankIndex(agent.missionSuccesses);
  const successes=agent.missionSuccesses+(outcome==='mission_success'?1:0);
  const newRank=rankIndex(successes);
  const status=outcome==='captured'?'captured':outcome==='dead'?'dead':'available';
  const stamp=calendarStamp(calendar);
  const at=now||new Date().toISOString();
  const verbs={mission_success:'Missão bem-sucedida em ',mission_failure:'Missão fracassada sem descoberta em ',
    escaped:'Fugiu após ser descoberto em ',captured:'Preso em operação contra ',dead:'Morto em operação contra '};
  let detail=verbs[outcome]+target.name;
  const why=typeof reason==='string'?reason.trim():'';
  if(why)detail+=' · '+why.slice(0,1200);
  const newAgent={...agent,missionSuccesses:successes,status,version:agent.version+1};
  const newOp={...operation,status:'completed',version:operation.version+1};
  const resolved=historyEntry({id:newId(),ownerHouseId:operation.ownerHouseId,agentId:agent.id,operationId:operation.id,
    eventType:outcome,eventDateKey:stamp.dateKey,calendarVersion:stamp.version,targetHouseId:operation.targetId,
    targetName:target.name,targetRegion:ri.region,agentRank:RANK_NAMES[newRank],cunning:3+newRank,totalSuccesses:successes,
    rollTotal:roll,modifier,targetDifficulty:dc,failureDegrees:degrees,lawSnapshot:law,guardPresent:guard,
    prisonPresent:prison,detail,requestKey:key,actor:actor.uid,createdAt:at});
  const history=[resolved];
  if(newRank>oldRank)history.push(historyEntry({id:newId(),ownerHouseId:operation.ownerHouseId,agentId:agent.id,
    operationId:operation.id,eventType:'promoted',eventDateKey:stamp.dateKey,calendarVersion:stamp.version,
    targetHouseId:operation.targetId,targetName:target.name,targetRegion:ri.region,agentRank:RANK_NAMES[newRank],
    cunning:3+newRank,totalSuccesses:successes,detail:'Promoção automática após 3 sucessos adicionais.',
    requestKey:newId(),actor:actor.uid,createdAt:at}));
  const decision={id:newId(),operationId:operation.id,targetLaw:law,lawSource:source,lawSourceVersion:null,difficulty:dc,
    ruleVersion:RULES_VERSION,modifiers:{roll,cunning,modifier,discovered,degrees,guardPresent:guard,prisonPresent:prison,
      forgedDocuments:forged,aceInTheHole:ace,effectiveFailureDegrees:effective,outcome,provenance:source},
    resolution:outcome==='mission_success'?'success':outcome==='mission_failure'?'failure':outcome,
    reviewer:actor.uid,rationale:detail,createdAt:at};
  const event=eventDoc({id:newId(),operationId:operation.id,requestKey:key,actor:actor.uid,eventType:'agent_mission_resolved',
    oldState:operation.status,newState:'completed',reason:detail,calendarVersion:stamp.version,occurredAt:at});
  return {alreadyApplied:false,agent:newAgent,operation:newOp,history,decision,event,
    result:{operationId:operation.id,agentId:agent.id,alreadyApplied:false,outcome,rank:RANK_NAMES[newRank],
      cunning:3+newRank,missionSuccesses:successes,promoted:newRank>oldRank,status,dateKey:stamp.dateKey,
      targetName:target.name,failureDegrees:degrees,effectiveFailureDegrees:effective,forgedDocuments:forged,
      aceInTheHole:ace,difficulty:dc}};
}

/* ----------------------- counterintelligence and panels -------------------- */

const DETECTION=new Set(['escaped','captured','dead']);
const ord=k=>{try{return calendarOrdinal(k);}catch{return -1;}};
const byDateDesc=(a,b)=>ord(b.eventDateKey)-ord(a.eventDateKey);

/** spy_house_counterintelligence (0111). */
export function counterintelligence({actor,houseId,operations,history}){
  requireRead(actor,houseId);
  if(typeof houseId!=='string'||!houseId)fail('denied','Acesso negado');
  const ops=new Map(operations.filter(o=>o.targetType==='house'&&o.targetId===houseId&&o.ownerHouseId!==houseId&&
    o.status==='completed').map(o=>[o.id,o]));
  const rows=history.filter(h=>{const o=ops.get(h.operationId);
    return o&&h.ownerHouseId===o.ownerHouseId&&h.targetHouseId===houseId&&DETECTION.has(h.eventType);});
  const total=new Set(rows.map(h=>h.operationId)).size;
  const latestOf=new Map();
  for(const h of rows){
    const c=latestOf.get(h.operationId);
    if(!c||String(h.createdAt).localeCompare(String(c.createdAt))>0||
       (h.createdAt===c.createdAt&&String(h.id)>String(c.id)))latestOf.set(h.operationId,h);
  }
  const alerts=[...latestOf.values()].sort((a,b)=>byDateDesc(a,b)||String(b.id).localeCompare(String(a.id))).slice(0,12)
    .map(h=>({dateKey:h.eventDateKey,result:h.eventType}));
  return {totalDetections:total,alerts};
}

/** spy_narrator_operations_dashboard (0111). `awards` is [] until the intelligence slice. */
export function narratorOperations({actor,operations,catalog,assets,timelines,decisions,awards=[]}){
  if(actor.role!=='narrador')fail('denied','Painel de operações exclusivo do Narrador');
  const cat=new Map(catalog.map(c=>[c.id,c])),ag=new Map(assets.map(a=>[a.id,a])),
    tl=new Map(timelines.map(t=>[t.operationId,t])),aw=new Map(awards.map(a=>[a.operationId,a]));
  const lastDecision=new Map();
  for(const d of decisions){
    const c=lastDecision.get(d.operationId);
    if(!c||String(d.createdAt).localeCompare(String(c.createdAt))>0)lastDecision.set(d.operationId,d);
  }
  const prio=s=>s==='pending_narrator_review'?0:['traveling','operating','returning','planned'].includes(s)?1:2;
  return operations.filter(o=>o.targetType==='house').map(o=>({o,p:prio(o.status)}))
    .sort((a,b)=>a.p-b.p||String(b.o.createdAt).localeCompare(String(a.o.createdAt))||String(a.o.id).localeCompare(String(b.o.id)))
    .slice(0,1200).map(({o})=>{
      const t=tl.get(o.id),a=ag.get(o.assetId);
      return {operationId:o.id,ownerHouseId:o.ownerHouseId,ownerHouseName:cat.get(o.ownerHouseId)?.name??o.ownerHouseId,
        targetHouseId:o.targetId,targetHouseName:cat.get(o.targetId)?.name??o.targetId,
        agentName:a?a.codename:'Agente histórico',agentStatus:a?a.status:null,status:o.status,
        objective:OBJECTIVES.has((o.requestedFields||[])[0])?o.requestedFields[0]:'house_resources',
        departureKey:t?.departureKey??null,arrivalKey:t?.arrivalKey??null,investigationEndKey:t?.investigationEndKey??null,
        outcome:lastDecision.get(o.id)?.resolution??null,intelligenceStatus:aw.get(o.id)?.processingState??null,
        createdAt:o.createdAt};});
}

/** spy_narrator_incident_history (0112). */
export function incidentHistory({actor,operations,history,catalog,assets}){
  if(actor.role!=='narrador')fail('denied','Incidentes reservados ao Narrador');
  const ops=new Map(operations.map(o=>[o.id,o])),cat=new Map(catalog.map(c=>[c.id,c])),ag=new Map(assets.map(a=>[a.id,a]));
  return history.filter(h=>{const o=ops.get(h.operationId);
    return o&&DETECTION.has(h.eventType)&&o.status==='completed'&&o.targetType==='house'&&o.ownerHouseId===h.ownerHouseId;})
    .sort((a,b)=>byDateDesc(a,b)||String(b.createdAt).localeCompare(String(a.createdAt))||String(a.id).localeCompare(String(b.id)))
    .slice(0,800).map(h=>({id:h.id,dateKey:h.eventDateKey,outcome:h.eventType,
      ownerHouseName:cat.get(h.ownerHouseId)?.name??h.ownerHouseId,
      targetHouseName:cat.get(h.targetHouseId)?.name??h.targetHouseId??'Casa não identificada',
      agentName:ag.get(h.agentId)?.codename??'Agente histórico',targetRegion:h.targetRegion??null,detail:h.detail??''}));
}
