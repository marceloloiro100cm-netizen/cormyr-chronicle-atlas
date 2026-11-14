/**
 * Pure rules of the spy-agent roster of a house (port of SQL 0089, 0090, 0092,
 * 0094 to 0096, 0100 and 0103): recruitment into Spy Network cells, creation
 * with portrait and upgrades, upgrade purchases, voluntary removal with refund,
 * the globally unique portrait and the house management view. Missions,
 * travel and intelligence belong to later slices. No I/O.
 */
import {createHash} from 'node:crypto';
import {isCampaignDate} from './schedule-core.mjs';
import {scopeOf,canEditHouse,canReadHouse} from './noble-house-core.mjs';
import {wealthAvailable,setPermanentWealth,wealthInt} from './house-wealth-core.mjs';

export const RULES_VERSION='cormyr-agent-tiers-v1';
export const UPGRADES={forged_documents:'Documentos falsificados',ace_in_the_hole:'Uma carta na manga'};
export const FREE_STATUSES=new Set(['captured','dead','lost','retired']);
export const NETWORK_ITEMS=new Set(['pros-spy-network','pros-spy-network--expanded-network']);
const RANKS=['Verde','Treinada','Veterana','Elite'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u001f\u007f-\u009f]/;

export class SpyError extends Error {
  constructor(code,message){super(message);this.name='SpyError';this.code=code;}
}
const fail=(code,m)=>{throw new SpyError(code,m);};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/* ----------------------------- rank and access ---------------------------- */

export const rankIndex=s=>Math.min(3,Math.floor(s/3));
export const rankOf=s=>RANKS[rankIndex(s)];
export const cunningOf=s=>3+rankIndex(s);
export const toNextRank=s=>s>=9?0:3-s%3;

/** Same actor resolution as the other services; failures become SpyError. */
export function spyScope(uid,raw){
  try{return scopeOf(uid,raw);}catch{fail('denied','Acesso negado');}
}
export const requireRead=(actor,houseId)=>{if(!canReadHouse(actor,houseId))fail('denied','Acesso negado');};
export const requireWrite=(actor,houseId)=>{if(!canEditHouse(actor,houseId))fail('denied','Acesso negado');};
const keyOk=k=>typeof k==='string'&&UUID.test(k);
const intOk=(v,min=-Infinity)=>Number.isInteger(v)&&v>=min;

/** Official campaign date key + calendar version, as every SQL function computes it. */
export function calendarStamp(calendar){
  if(!calendar||!Number.isInteger(calendar.year))fail('invalid','Hub Temporal indisponível');
  const y=String(calendar.year).padStart(4,'0');
  const key=calendar.festival?y+'-F-'+calendar.festival
    :y+'-'+String(calendar.month+1).padStart(2,'0')+'-'+String(calendar.day).padStart(2,'0');
  if(!isCampaignDate(key))fail('invalid','Data de campanha inválida');
  return {dateKey:key,version:calendar.version};
}

/* ------------------------------- documents -------------------------------- */

export function historyEntry(o){
  return {id:o.id,ownerHouseId:o.ownerHouseId,agentId:o.agentId,operationId:o.operationId??null,
    eventType:o.eventType,eventDateKey:o.eventDateKey,calendarVersion:o.calendarVersion,
    targetHouseId:o.targetHouseId??null,targetName:o.targetName??null,targetRegion:o.targetRegion??null,
    agentRank:o.agentRank,cunning:o.cunning,totalSuccesses:o.totalSuccesses,rollTotal:o.rollTotal??null,
    modifier:o.modifier??null,targetDifficulty:o.targetDifficulty??null,failureDegrees:o.failureDegrees??null,
    lawSnapshot:o.lawSnapshot??null,guardPresent:o.guardPresent??null,prisonPresent:o.prisonPresent??null,
    detail:o.detail,requestKey:o.requestKey,actor:o.actor,createdAt:o.createdAt};
}
const rankFields=a=>({agentRank:rankOf(a.missionSuccesses),cunning:cunningOf(a.missionSuccesses),
  totalSuccesses:a.missionSuccesses});

/* ---------------------------- Spy Network cells --------------------------- */

const holdingActive=(h,holdings)=>isObj(h)&&h.status==='active'&&NETWORK_ITEMS.has(h.itemId)&&
  (h.parentId==null||h.parentId===''||holdings.some(p=>isObj(p)&&p.id===h.parentId&&p.status==='active'));
const holdingsOf=state=>Array.isArray(state&&state.holdings)?state.holdings:[];
const occupying=(assets,houseId,holdingId)=>assets.filter(a=>a.ownerHouseId===houseId&&
  a.sourceHoldingId===holdingId&&!FREE_STATUSES.has(a.status)).length;
const capacityOf=(item,explicit)=>item==='pros-spy-network'?3:(explicit&&item!=='pros-spy-network--expanded-network'?0:2);

/** Free cells per active Spy Network holding (management and recruitment lists). */
export function networkSlots({state,assets,houseId,requireActive=false}){
  if(!isObj(state)||(requireActive&&state.phase!=='active'))return [];
  const hs=holdingsOf(state);
  return hs.filter(h=>holdingActive(h,hs)).map(h=>{
    const capacity=capacityOf(h.itemId,requireActive),occupied=occupying(assets,houseId,h.id);
    return {sourceHoldingId:h.id,name:h.name,capacity,occupied,vacancies:Math.max(0,capacity-occupied)};
  }).sort((a,b)=>String(a.name).localeCompare(String(b.name))||String(a.sourceHoldingId).localeCompare(String(b.sourceHoldingId)));
}

/* ------------------------------- recruitment ------------------------------ */

const cleanName=codename=>{
  const n=typeof codename==='string'?codename.trim():'';
  if(n.length<2||n.length>80||CONTROL.test(n))fail('invalid','Nome ou solicitação inválida');
  return n;
};

/**
 * spy_recruit_agent. `existingByKey` is the history row already using the key;
 * `existingAgent` its agent. Returns {agent,history,result}|{result:alreadyApplied}.
 */
export function recruitAgent({actor,houseId,sourceHolding,codename,key,sheet,assets,existingByKey,existingAgent,
  locations,calendar,newId,now}){
  requireWrite(actor,houseId);
  if(!keyOk(key))fail('invalid','Nome ou solicitação inválida');
  const name=cleanName(codename);
  if(!sheet)fail('invalid','Ficha operacional da Casa necessária para recrutar');
  if(existingByKey){
    if(existingByKey.ownerHouseId!==houseId)fail('conflict','Chave já utilizada por outra Casa');
    const a=existingAgent;
    return {alreadyApplied:true,result:{id:a.id,codename:a.codename,status:a.status,rank:'Verde',cunning:3,
      missionSuccesses:0}};
  }
  const hs=holdingsOf(sheet.state);
  const h=hs.find(x=>holdingActive(x,hs)&&x.id===sourceHolding);
  if(!h)fail('invalid','Fonte ativa da Rede de Espiões não encontrada');
  const capacity=h.itemId==='pros-spy-network'?3:2;
  if(occupying(assets,houseId,sourceHolding)>=capacity)fail('invalid','Rede sem vaga livre para recrutamento');
  const loc=locations.filter(l=>l.kind==='domain'&&l.refId===h.domainId)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0];
  if(!loc)fail('invalid','Domínio de recrutamento sem localização homologada');
  const stamp=calendarStamp(calendar);
  const at=now||new Date().toISOString();
  const agent={id:newId(),ownerHouseId:houseId,kind:'network_cell',codename:name,sourceHoldingId:sourceHolding,
    sourceRef:'replacement:'+sourceHolding+':'+key,currentLocationId:loc.id,status:'available',
    rulesVersion:RULES_VERSION,missionSuccesses:0,portraitId:null,version:1,createdAt:at};
  const history=historyEntry({id:newId(),ownerHouseId:houseId,agentId:agent.id,eventType:'recruited',
    eventDateKey:stamp.dateKey,calendarVersion:stamp.version,targetName:name,targetRegion:loc.regionId??null,
    ...rankFields(agent),detail:'Novo agente Verde recrutado em vaga livre da Rede de Espiões.',
    requestKey:key,actor:actor.uid,createdAt:at});
  return {alreadyApplied:false,agent,history,result:{id:agent.id,codename:name,status:'available',rank:'Verde',
    cunning:3,missionSuccesses:0}};
}

/* -------------------------------- upgrades -------------------------------- */

/**
 * spy_buy_agent_upgrade. Inputs mirror the locked rows of the SQL function;
 * `keyUpgrade` is the upgrade row using the key (any agent), `agentUpgrades`
 * those of the agent.
 */
export function buyUpgrade({actor,houseId,agent,code,expectedAgentVersion,expectedHouseVersion,key,sheet,keyUpgrade,
  agentUpgrades,ledgerKeyTaken,historyKeyTaken,hasActiveOperation,calendar,newId,now}){
  requireWrite(actor,houseId);
  if(!(code in UPGRADES)||!agent||!keyOk(key)||!intOk(expectedAgentVersion)||!intOk(expectedHouseVersion))
    fail('invalid','Compra inválida');
  if(!sheet||!isObj(sheet.state)||sheet.state.phase!=='active')fail('invalid','A Casa precisa de ficha ativa');
  if(agent.ownerHouseId!==houseId)fail('invalid','Agente não pertence à Casa');
  if(keyUpgrade&&keyUpgrade.agentId===agent.id&&keyUpgrade.ownerHouseId===houseId&&keyUpgrade.upgradeCode===code)
    return {alreadyApplied:true,result:{agentId:agent.id,upgrade:code,alreadyApplied:true,agentVersion:agent.version,
      houseVersion:sheet.version}};
  if(keyUpgrade||ledgerKeyTaken||historyKeyTaken)fail('conflict','Chave já utilizada em outra compra');
  if(agent.status!=='available'||hasActiveOperation)
    fail('invalid','Equipe o agente somente antes de uma missão, quando disponível');
  if(agent.version!==expectedAgentVersion||sheet.version!==expectedHouseVersion)
    fail('conflict','Ficha alterada. Recarregue antes de comprar');
  if(agentUpgrades.some(u=>u.upgradeCode===code))fail('invalid','Este espião já possui essa compra');
  const {available,oldPerm}=wealthAvailable(sheet.state);
  if(available<1)fail('invalid','Sem recursos: exige 1 ponto de Riqueza disponível');
  const next=setPermanentWealth(sheet.state,oldPerm-1);
  const at=now||new Date().toISOString();
  const stamp=calendarStamp(calendar);
  const label=UPGRADES[code];
  const version=sheet.version+1;
  const nextAgent={...agent,version:agent.version+1};
  return {alreadyApplied:false,agent:nextAgent,
    sheet:{...sheet,state:next,version,updatedBy:actor.uid,updatedAt:at},
    ledger:{houseId,operationKey:key,actor:actor.uid,action:'spy_agent_upgrade',
      explanation:'Compra para '+agent.codename+': '+label+' (−1 Riqueza).',
      rule:'Cormyr: equipamento especial de espionagem · custo permanente 1 Riqueza',
      campaignMonth:wealthInt(next.month),beforeState:sheet.state,afterState:next,version,createdAt:at},
    upgrade:{agentId:agent.id,ownerHouseId:houseId,upgradeCode:code,costWealth:1,purchasedAt:at,requestKey:key,
      purchasedBy:actor.uid},
    history:historyEntry({id:newId(),ownerHouseId:houseId,agentId:agent.id,eventType:'upgrade_purchased',
      eventDateKey:stamp.dateKey,calendarVersion:stamp.version,...rankFields(agent),
      detail:label+' adquirida (1 Riqueza permanente).',requestKey:key,actor:actor.uid,createdAt:at}),
    result:{agentId:agent.id,upgrade:code,alreadyApplied:false,agentVersion:nextAgent.version,houseVersion:version,
      remainingWealthEstimate:available-1}};
}

/* --------------------------------- portrait -------------------------------- */

/** spy_assign_agent_portrait (0100): not for retired agents; one holder per campaign. */
export function assignPortrait({actor,houseId,agent,portraitId,expectedVersion,catalogItem,heldByOther}){
  requireWrite(actor,houseId);
  if(typeof portraitId!=='string'||!intOk(expectedVersion))fail('invalid','Seleção de retrato incompleta');
  if(!catalogItem||catalogItem.active!==true)fail('invalid','Retrato não faz parte da galeria disponível');
  if(!agent||agent.ownerHouseId!==houseId)fail('invalid','Agente não pertence à Casa');
  if(agent.status==='retired')fail('invalid','Agente excluído não pode reservar retrato');
  if(agent.version!==expectedVersion)fail('conflict','Ficha alterada; recarregue antes de escolher retrato');
  if(agent.portraitId===portraitId)return {changed:false,agent,result:{agentId:agent.id,portraitId,version:agent.version}};
  if(heldByOther)fail('conflict','Retrato já utilizado por outro espião da campanha');
  const next={...agent,portraitId,version:agent.version+1};
  return {changed:true,agent:next,result:{agentId:agent.id,portraitId,version:next.version}};
}

/* ---------------------------------- creation ------------------------------- */

const derivedKey=(key,code)=>{
  const h=createHash('md5').update(key+':'+code).digest('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
};
export const upgradeKeyFor=derivedKey;

/**
 * spy_create_agent = recruit + portrait + purchases in one unit. `ctx` carries
 * the reads (see the service); everything is applied in memory in the SQL order.
 */
export function createAgent({actor,houseId,sourceHolding,codename,portraitId,upgrades,key,ctx,newId,now}){
  requireWrite(actor,houseId);
  const codes=upgrades==null?[]:upgrades;
  if(!keyOk(key)||typeof sourceHolding!=='string'||!sourceHolding||typeof codename!=='string'||
     codename.trim().length<2||codename.trim().length>80||CONTROL.test(codename))
    fail('invalid','Nome ou solicitação inválida');
  if(!Array.isArray(codes)||codes.length>2||new Set(codes).size!==codes.length||
     codes.some(c=>typeof c!=='string'||!(c in UPGRADES)))fail('invalid','Melhorias inválidas ou repetidas');
  const name=codename.trim();
  if(ctx.existingByKey&&ctx.existingByKey.eventType==='recruited'){
    const a=ctx.existingAgent;
    const have=[...ctx.existingAgentUpgrades.map(u=>u.upgradeCode)].sort().join(',');
    if(ctx.existingByKey.ownerHouseId!==houseId||a.sourceHoldingId!==sourceHolding||a.codename!==name||
       (a.portraitId??null)!==(portraitId??null)||have!==[...codes].sort().join(','))
      fail('conflict','Chave de criação já usada com outros dados');
    return {alreadyApplied:true,result:agentResult(a,codes,true)};
  }
  if(ctx.existingByKey)fail('conflict','Chave de solicitação já utilizada');
  if(portraitId!=null){
    if(!ctx.portrait||ctx.portrait.active!==true)fail('invalid','Retrato indisponível');
    if(ctx.portraitHeldByOther)fail('conflict','Retrato já utilizado por outro espião da campanha');
  }else if(ctx.catalogHasActive)fail('invalid','Selecione um retrato antes de criar o espião');
  const rec=recruitAgent({actor,houseId,sourceHolding,codename:name,key,sheet:ctx.sheet,assets:ctx.assets,
    existingByKey:null,existingAgent:null,locations:ctx.locations,calendar:ctx.calendar,newId,now});
  let agent=rec.agent,sheet=ctx.sheet;
  if(portraitId!=null)agent={...agent,portraitId};
  const out={histories:[rec.history],ledgers:[],upgrades:[]};
  for(const code of codes){
    const dk=derivedKey(key,code);
    const r=buyUpgrade({actor,houseId,agent,code,expectedAgentVersion:agent.version,expectedHouseVersion:sheet.version,
      key:dk,sheet,keyUpgrade:null,agentUpgrades:out.upgrades,ledgerKeyTaken:ctx.ledgerKeysTaken.has(dk),
      historyKeyTaken:ctx.historyKeysTaken.has(dk),hasActiveOperation:false,calendar:ctx.calendar,newId,now});
    agent=r.agent;sheet=r.sheet;out.ledgers.push(r.ledger);out.upgrades.push(r.upgrade);out.histories.push(r.history);
  }
  return {alreadyApplied:false,agent,sheet,...out,result:agentResult(agent,codes,false)};
}
const agentResult=(a,codes,repeat)=>({id:a.id,codename:a.codename,rank:'Verde',cunning:3,status:'available',
  missionSuccesses:0,portraitId:a.portraitId??null,version:a.version,upgrades:[...codes],alreadyApplied:repeat});

/* ---------------------------------- removal -------------------------------- */

/** spy_remove_agent: retire the agent, refund paid upgrades, free cell and portrait. */
export function removeAgent({actor,houseId,agent,expectedAgentVersion,expectedHouseVersion,key,sheet,previousRemoval,
  keyRemoval,ledgerKeyTaken,agentUpgrades,hasActiveOperation,calendar,newId,now}){
  requireWrite(actor,houseId);
  if(typeof houseId!=='string'||!houseId||!agent||!keyOk(key)||!intOk(expectedAgentVersion,1)||
     !intOk(expectedHouseVersion,0))fail('invalid','Parâmetros de baixa inválidos');
  if(!sheet||!isObj(sheet.state)||sheet.state.phase!=='active')fail('invalid','Ficha ativa da Casa necessária');
  if(agent.ownerHouseId!==houseId)fail('invalid','Espião não pertence à Casa');
  if(previousRemoval){
    if(previousRemoval.requestKey!==key)fail('conflict','Espião já excluído, sem novo reembolso');
    return {alreadyApplied:true,result:{agentId:agent.id,refundedWealth:previousRemoval.refundedWealth,freedSlot:true,
      portraitReleased:previousRemoval.portraitId!=null,alreadyApplied:true,houseVersion:sheet.version}};
  }
  if(keyRemoval||ledgerKeyTaken)fail('conflict','Chave já utilizada em outra operação');
  if(agent.status!=='available')fail('invalid','Exclua somente espiões disponíveis, fora de missão');
  if(hasActiveOperation)fail('invalid','Finalize ou cancele a missão antes de excluir o espião');
  if(agent.version!==expectedAgentVersion||sheet.version!==expectedHouseVersion)
    fail('conflict','Ficha desatualizada. Atualize antes da exclusão');
  const refund=agentUpgrades.reduce((s,u)=>s+u.costWealth,0);
  if(refund<0||refund>2)fail('invalid','Custos de espião inconsistentes: revisão necessária');
  if(!isObj(sheet.state.permanent)||!('wealth' in sheet.state.permanent))
    fail('invalid','Ficha sem saldo permanente de Riqueza validado');
  const next=setPermanentWealth(sheet.state,(wealthInt(sheet.state.permanent.wealth)??0)+refund);
  const stamp=calendarStamp(calendar);
  const at=now||new Date().toISOString();
  const version=sheet.version+1;
  return {alreadyApplied:false,
    agent:{...agent,status:'retired',portraitId:null,version:agent.version+1},
    sheet:{...sheet,state:next,version,updatedBy:actor.uid,updatedAt:at},
    removal:{agentId:agent.id,ownerHouseId:houseId,requestKey:key,refundedWealth:refund,portraitId:agent.portraitId??null,
      codename:agent.codename,removedBy:actor.uid,removedAt:at},
    ledger:{houseId,operationKey:key,actor:actor.uid,action:'spy_agent_removed',
      explanation:'Baixa do espião '+agent.codename+': +'+refund+' Riqueza devolvida; vaga e retrato liberados.',
      rule:'Devolver somente custo de melhorias efetivamente pagas, sem apagar missões.',
      campaignMonth:wealthInt(next.month),beforeState:sheet.state,afterState:next,version,createdAt:at},
    history:historyEntry({id:newId(),ownerHouseId:houseId,agentId:agent.id,eventType:'retired',
      eventDateKey:stamp.dateKey,calendarVersion:stamp.version,targetName:agent.codename,...rankFields(agent),
      detail:'Agente excluído do elenco ativo. Reembolso de '+refund+' Riqueza; vaga e retrato liberados.',
      requestKey:key,actor:actor.uid,createdAt:at}),
    result:{agentId:agent.id,refundedWealth:refund,freedSlot:true,portraitReleased:agent.portraitId!=null,
      alreadyApplied:false,houseVersion:version}};
}

/* ------------------------------ read-only views ---------------------------- */

const byCreated=(a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id));
const portraitView=(catalog,houseAssets,allAssets)=>catalog.filter(c=>c.active===true)
  .sort((a,b)=>(a.sortOrder-b.sortOrder)||String(a.id).localeCompare(String(b.id)))
  .map(c=>({id:c.id,label:c.label,imageUrl:c.imageUrl,
    assignedAgentId:(houseAssets.find(a=>a.portraitId===c.id)||{}).id??null,
    occupied:allAssets.some(a=>a.portraitId===c.id)}));

/** spy_house_management */
export function houseManagement({actor,houseId,assets,allAssets,operations,segments,history,upgrades,locations,sheet,catalog}){
  requireRead(actor,houseId);
  const locOf=id=>locations.find(l=>l.id===id)||null;
  const agents=assets.filter(a=>a.ownerHouseId===houseId).sort(byCreated).map(a=>{
    const l=locOf(a.currentLocationId);
    return {id:a.id,codename:a.codename,status:a.status,version:a.version,
      currentRegion:l?(l.kind==='region'?l.refId:l.regionId??null):null,
      missionSuccesses:a.missionSuccesses,rank:rankOf(a.missionSuccesses),cunning:cunningOf(a.missionSuccesses),
      toNextRank:toNextRank(a.missionSuccesses),sourceHoldingId:a.sourceHoldingId??null,portraitId:a.portraitId??null,
      forgedDocuments:upgrades.some(u=>u.agentId===a.id&&u.upgradeCode==='forged_documents'),
      aceInTheHole:upgrades.some(u=>u.agentId===a.id&&u.upgradeCode==='ace_in_the_hole')};
  });
  const ops=operations.filter(o=>o.ownerHouseId===houseId)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(a.id).localeCompare(String(b.id)))
    .map(o=>{
      const segs=segments.filter(s=>s.operationId===o.id&&s.status!=='cancelled').sort((a,b)=>a.ordinal-b.ordinal);
      return {id:o.id,assetId:o.assetId,missionKind:o.missionKind,targetType:o.targetType,targetId:o.targetId,
        status:o.status,travelDays:segs.length?segs.reduce((s,x)=>s+x.durationDays,0):null,
        arrivalKey:segs.length?segs[segs.length-1].arrivalKey:null,createdAt:o.createdAt};
    });
  const hist=history.filter(h=>h.ownerHouseId===houseId)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(b.id).localeCompare(String(a.id)))
    .map(h=>({id:h.id,agentId:h.agentId,eventType:h.eventType,dateKey:h.eventDateKey,targetName:h.targetName,
      targetRegion:h.targetRegion,detail:h.detail,rank:h.agentRank,cunning:h.cunning,totalSuccesses:h.totalSuccesses,
      failureDegrees:h.failureDegrees,operationId:h.operationId}));
  return {houseId,agents,operations:ops,history:hist,
    recruitment:networkSlots({state:sheet&&sheet.state,assets,houseId}),
    portraits:portraitView(catalog,assets.filter(a=>a.ownerHouseId===houseId),allAssets),
    houseVersion:sheet?sheet.version:null};
}

/** spy_recruitment_options: light query, only for the house itself. */
export function recruitmentOptions({actor,houseId,assets,allAssets,sheet,catalog}){
  requireRead(actor,houseId);
  return {houseId,
    recruitment:networkSlots({state:sheet&&sheet.state,assets,houseId,requireActive:true}),
    portraits:portraitView(catalog,assets.filter(a=>a.ownerHouseId===houseId),allAssets)};
}
