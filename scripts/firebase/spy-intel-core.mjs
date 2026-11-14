/**
 * Pure rules of espionage intelligence (port of SQL 0104 to 0108 and 0110):
 * automatic award when the narrator resolves a successful mission, the
 * narrator's catalog confirmation (finalize), the dossier read model with the
 * revoked-history privacy rule, administrative reveal/revalidate/revoke with
 * audit, options, pending list and operation status. No I/O.
 * 0110 wins over 0106 and 0105: findings carry the official date observed
 * when they are confirmed. Deliberate difference: md5 ordering is kept
 * (node:crypto) so item choice matches the SQL for the same operation id.
 */
import {createHash} from 'node:crypto';
import {SpyError,calendarStamp,requireRead} from './spy-agents-core.mjs';
import {calendarOrdinal} from './harptos-core.mjs';
import {findingDocId} from './stage-spy-emulator.mjs';

export {SpyError,findingDocId};
const fail=(code,m)=>{throw new SpyError(code,m);};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const OBJECTIVES=['house_resources','army','possessions'];
export const RESOURCES=['defense','influence','lands','law','power','population','wealth'];
const md5=s=>createHash('md5').update(s).digest('hex');
const byMd5=(opId,keyOf)=>(a,b)=>{const x=md5(opId+':'+keyOf(a)),y=md5(opId+':'+keyOf(b));return x<y?-1:x>y?1:0;};
const requireNarrator=(actor,msg)=>{if(actor.role!=='narrador')fail('denied',msg);};

export const capacityOf=margin=>3+Math.min(4,Math.max(0,Math.floor(margin/5)));

/* ------------------------------ automatic award ---------------------------- */

/**
 * Trigger spy_intelligence_on_decision. `dossier` is the existing pair doc or
 * null, `findings` those of that dossier, `awardExists` whether an award for
 * the operation exists, `stats` the imported official row (or null) and
 * `sheet` the target operational sheet (or null). Returns null when nothing
 * is awarded.
 */
export function awardOnDecision({decision,operation,dossier,findings,awardExists,stats,sheet,calendar,newId,now}){
  if(!decision||decision.resolution!=='success')return null;
  if(!operation||operation.targetType!=='house'||operation.status!=='completed')return null;
  let objective=(operation.requestedFields||[])[0]??'house_overview';
  if(objective==='house_overview')objective='house_resources';
  if(!OBJECTIVES.includes(objective))return null;
  const mods=decision.modifiers;
  if(!isObj(mods)||!('roll' in mods)||!('modifier' in mods))fail('invalid','Resultado da missão sem dados de rolagem');
  const margin=Number(mods.roll)+Number(mods.modifier)-decision.difficulty;
  if(margin<0)return null;
  const capacity=capacityOf(margin),degrees=capacity-3;
  const stamp=calendarStamp(calendar),day=stamp.dateKey,at=now||new Date().toISOString();
  const out={dossier:dossier?{...dossier,updatedAt:at}:{id:newId(),ownerHouseId:operation.ownerHouseId,
    targetHouseId:operation.targetId,createdAt:at,updatedAt:at},findings:[],events:[],award:null};
  if(awardExists)return {...out,award:null,skipped:true};
  const did=out.dossier.id;
  const award=(state,rev,ref)=>({operationId:operation.id,dossierId:did,objective,successDegrees:degrees,revealCapacity:capacity,
    revealedCount:rev,refreshedCount:ref,processingState:state,campaignDateKey:day,createdAt:at});
  const usable=objective==='house_resources'&&!(sheet&&sheet.state)&&stats?stats:null;
  if(!usable){out.award=award('waiting_catalog',0,0);return out;}
  const known=new Map(findings.filter(f=>f.objective===objective).map(f=>[f.subjectKey,f]));
  const snap=a=>({value:Number.isInteger(usable[a])?usable[a]:null,source:'official_noble_stats'});
  const fresh=RESOURCES.filter(a=>a in usable&&!known.has(a)).sort(byMd5(operation.id,a=>a)).slice(0,capacity);
  for(const a of fresh){
    const v=snap(a);
    out.findings.push({id:newId(),dossierId:did,objective,subjectKey:a,valueSnapshot:v,discoveredOperationId:operation.id,
      verifiedOperationId:operation.id,discoveredDateKey:day,verifiedDateKey:day,discoveredAt:at,verifiedAt:at});
    out.events.push({id:newId(),dossierId:did,operationId:operation.id,objective,subjectKey:a,eventType:'revealed',
      previousSnapshot:null,newSnapshot:v,campaignDateKey:day,calendarVersion:stamp.version,createdAt:at});
  }
  let refreshed=0;
  if(fresh.length<capacity){
    const old=[...known.values()].filter(f=>f.discoveredOperationId!=null&&f.discoveredOperationId!==operation.id)
      .sort(byMd5(operation.id,f=>f.subjectKey)).slice(0,capacity-fresh.length);
    for(const f of old){
      const v=snap(f.subjectKey);
      out.findings.push({...f,valueSnapshot:v,verifiedOperationId:operation.id,verifiedDateKey:day,verifiedAt:at});
      out.events.push({id:newId(),dossierId:did,operationId:operation.id,objective,subjectKey:f.subjectKey,eventType:'refreshed',
        previousSnapshot:f.valueSnapshot,newSnapshot:v,campaignDateKey:day,calendarVersion:stamp.version,createdAt:at});
      refreshed++;
    }
  }
  out.award=award('complete',fresh.length,refreshed);
  return out;
}

/* ------------------------------ source catalog ----------------------------- */

/**
 * spy_intelligence_source_items. Returns null when the source is not
 * available yet. `resources` only matters for a target with an operational sheet.
 */
export function sourceItems({objective,sheet,stats,resources=null}){
  if(!OBJECTIVES.includes(objective))fail('invalid','Modalidade inválida');
  const state=sheet&&sheet.state?sheet.state:null;
  if(objective==='house_resources'){
    if(state){
      if(!isObj(resources))return null;
      return RESOURCES.map(k=>{
        const v=resources[k];
        if(typeof v!=='number'||!/^-?[0-9]{1,6}$/.test(String(v)))fail('invalid','Valor de atributo inválido ou ausente: '+k);
        return {key:k,snapshot:{value:v,source:'operational_house_balances'}};
      });
    }
    if(!stats)return null;
    return RESOURCES.map(k=>({key:k,snapshot:{value:Number.isInteger(stats[k])?stats[k]:null,source:'official_noble_stats'}}));
  }
  if(!state)return null;
  const items=[];
  const named=(v,d)=>typeof v==='string'&&v!==''?v:d;
  if(objective==='army'){
    for(const u of Array.isArray(state.units)?state.units:[]){
      if(!isObj(u)||typeof u.id!=='string'||u.id===''||String(u.destroyed??'false')==='true')continue;
      items.push({key:u.id,snapshot:{name:named(u.name,'Unidade sem nome'),category:'Unidade militar',
        types:Array.isArray(u.types)?u.types:[],strength:u.strength??null,training:u.training??null,source:'operational_army'}});
    }
  }else{
    for(const d of Array.isArray(state.domains)?state.domains:[]){
      if(!isObj(d)||typeof d.id!=='string'||d.id==='')continue;
      items.push({key:'domain:'+d.id,snapshot:{name:named(d.name,'Domínio'),category:'Domínio',source:'operational_domains'}});
    }
    for(const h of Array.isArray(state.holdings)?state.holdings:[]){
      if(!isObj(h)||typeof h.id!=='string'||h.id===''||h.status!=='active')continue;
      items.push({key:'holding:'+h.id,snapshot:{name:named(h.name,'Posse adquirida'),category:named(h.category,'Posse'),
        source:'operational_holdings'}});
    }
  }
  return items;
}

/* -------------------------------- finalize --------------------------------- */

/**
 * spy_intelligence_finalize (0110). Narrator only. Inputs: the award, the
 * operation and its decision, the dossier and its findings, the catalog
 * items (already computed by sourceItems; null = waiting).
 */
export function finalize({actor,award,operation,decision,dossier,findings,items,calendar,newId,now}){
  requireNarrator(actor,'Somente o Narrador confirma descobertas');
  if(!award)return {result:{status:'no_success_award'}};
  if(award.processingState==='complete')
    return {result:{status:'complete',alreadyApplied:true,revealed:award.revealedCount,refreshed:award.refreshedCount}};
  if(!operation||!dossier||operation.targetType!=='house'||operation.ownerHouseId!==dossier.ownerHouseId||
     !decision||decision.resolution!=='success'||operation.status!=='completed')
    fail('invalid','Missão homologada não encontrada');
  if(items===null||items===undefined)return {result:{status:'waiting_catalog'}};
  const stamp=calendarStamp(calendar),observed=stamp.dateKey;
  if(calendarOrdinal(observed)<calendarOrdinal(award.campaignDateKey))
    fail('invalid','HUB Temporal anterior à missão: reprocessamento bloqueado');
  const at=now||new Date().toISOString();
  const objective=award.objective,opId=operation.id;
  const known=new Map(findings.filter(f=>f.objective===objective).map(f=>[f.subjectKey,f]));
  const byKey=new Map();
  for(const it of items)if(typeof it.key==='string'&&it.key!==''&&isObj(it.snapshot)&&!byKey.has(it.key))byKey.set(it.key,it.snapshot);
  const unknown=[...byKey.keys()].filter(k=>!known.has(k)).sort(byMd5(opId,k=>k));
  const writes={findings:[],events:[]};
  let fresh=0;
  for(const k of unknown){
    if(fresh>=award.revealCapacity)break;
    const v=byKey.get(k);
    writes.findings.push({id:newId(),dossierId:dossier.id,objective,subjectKey:k,valueSnapshot:v,discoveredOperationId:opId,
      verifiedOperationId:opId,discoveredDateKey:observed,verifiedDateKey:observed,discoveredAt:at,verifiedAt:at});
    writes.events.push({id:newId(),dossierId:dossier.id,operationId:opId,objective,subjectKey:k,eventType:'revealed',
      previousSnapshot:null,newSnapshot:v,campaignDateKey:observed,calendarVersion:stamp.version,createdAt:at});
    fresh++;
  }
  let refreshed=0;
  const available=award.revealCapacity-fresh;
  if(available>0){
    const prior=[...known.values()].filter(f=>f.discoveredOperationId!==opId&&byKey.has(f.subjectKey))
      .sort(byMd5(opId,f=>f.subjectKey)).slice(0,available);
    for(const f of prior){
      const v=byKey.get(f.subjectKey);
      writes.findings.push({...f,valueSnapshot:v,verifiedOperationId:opId,verifiedDateKey:observed,verifiedAt:at});
      writes.events.push({id:newId(),dossierId:dossier.id,operationId:opId,objective,subjectKey:f.subjectKey,eventType:'refreshed',
        previousSnapshot:f.valueSnapshot,newSnapshot:v,campaignDateKey:observed,calendarVersion:stamp.version,createdAt:at});
      refreshed++;
    }
  }
  return {...writes,award:{...award,revealedCount:fresh,refreshedCount:refreshed,processingState:'complete'},
    dossier:{...dossier,updatedAt:at},result:{status:'complete',revealed:fresh,refreshed,alreadyApplied:false}};
}

/* ------------------------------ administration ----------------------------- */

/** spy_intelligence_admin_action. `items` from sourceItems (reveal/revalidate). */
export function adminAction({actor,dossier,objective,subjectKey,action,reason,existing,items,calendar,newId,now}){
  requireNarrator(actor,'Somente o Narrador pode alterar dossiês');
  const why=typeof reason==='string'?reason.trim():'';
  if(!['reveal','revalidate','revoke'].includes(action)||!OBJECTIVES.includes(objective)||typeof subjectKey!=='string'||
     subjectKey.length<1||subjectKey.length>160||why.length<10||why.length>1200)fail('invalid','Alteração inválida');
  if(!dossier)fail('invalid','Dossiê inexistente');
  const stamp=calendarStamp(calendar),day=stamp.dateKey,at=now||new Date().toISOString();
  let before=existing?existing.valueSnapshot:null,after=null,finding=null,remove=null;
  if(action==='revoke'){
    if(!existing)fail('invalid','Conhecimento já ausente');
    remove=existing;
  }else{
    if(action==='revalidate'&&!existing)fail('invalid','Conhecimento não encontrado para revalidar');
    if(items===null||items===undefined)fail('invalid','Fonte oficial indisponível');
    const it=items.find(i=>i.key===subjectKey);
    if(!it||!isObj(it.snapshot))fail('invalid','Informação não existe no inventário oficial');
    after=it.snapshot;
    finding=existing?{...existing,valueSnapshot:after,verifiedDateKey:day,verifiedAt:at,verifiedOperationId:null}
      :{id:newId(),dossierId:dossier.id,objective,subjectKey,valueSnapshot:after,discoveredOperationId:null,
        verifiedOperationId:null,discoveredDateKey:day,verifiedDateKey:day,discoveredAt:at,verifiedAt:at};
  }
  const audit={id:newId(),dossierId:dossier.id,objective,subjectKey,action,beforeSnapshot:before,afterSnapshot:after,
    campaignDateKey:day,reason:why,actor:actor.uid,createdAt:at};
  return {finding,remove,audit,dossier:{...dossier,updatedAt:at}};
}

/** knownCount after an admin action, for the result. */
export const knownCount=(findings,objective,{finding,remove})=>{
  const keys=new Set(findings.filter(f=>f.objective===objective).map(f=>f.subjectKey));
  if(finding&&finding.objective===objective)keys.add(finding.subjectKey);
  if(remove&&remove.objective===objective)keys.delete(remove.subjectKey);
  return keys.size;
};

/** spy_intelligence_admin_options: every objective, plus findings outside the catalog. */
export function adminOptions({actor,dossier,sheet,findings}){
  requireNarrator(actor,'Consulta administrativa não autorizada');
  if(!dossier)fail('invalid','Dossiê não encontrado');
  let out=[];
  for(const objective of OBJECTIVES){
    const cat=objective==='house_resources'?RESOURCES.map(k=>({key:k,snapshot:{}})):sourceItems({objective,sheet,stats:null});
    if(cat)out=out.concat([...cat].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
      .map(i=>({objective,key:i.key,name:typeof i.snapshot.name==='string'?i.snapshot.name:i.key})));
  }
  const extra=findings.filter(f=>f.dossierId===dossier.id&&!out.some(o=>o.objective===f.objective&&o.key===f.subjectKey))
    .sort((a,b)=>a.objective<b.objective?-1:a.objective>b.objective?1:a.subjectKey<b.subjectKey?-1:a.subjectKey>b.subjectKey?1:0)
    .map(f=>({objective:f.objective,key:f.subjectKey,
      name:isObj(f.valueSnapshot)&&typeof f.valueSnapshot.name==='string'?f.valueSnapshot.name:f.subjectKey}));
  return out.concat(extra);
}

export function adminPending({actor,awards,dossiers}){
  requireNarrator(actor,'Consulta administrativa não autorizada');
  const dos=new Map(dossiers.map(d=>[d.id,d]));
  return awards.filter(a=>a.processingState==='waiting_catalog'&&dos.has(a.dossierId))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(a=>({operationId:a.operationId,objective:a.objective,ownerHouseId:dos.get(a.dossierId).ownerHouseId,
      targetHouseId:dos.get(a.dossierId).targetHouseId,dateKey:a.campaignDateKey,capacity:a.revealCapacity}));
}

/** spy_intelligence_operation_status (0110). */
export function operationStatus({actor,operation,decision,award}){
  requireNarrator(actor,'Consulta de inteligência reservada ao Narrador');
  if(!operation||operation.targetType!=='house')fail('invalid','Operação de espionagem não encontrada');
  if(operation.status!=='completed'||!decision)return {status:'pending_resolution'};
  if(decision.resolution!=='success')return {status:'no_success_award'};
  if(!award)return {status:'missing_award'};
  return {status:award.processingState};
}

/* --------------------------------- reading --------------------------------- */

/**
 * spy_intelligence_read (0107). Narrator sees every dossier (optionally of one
 * house) with full history; a player sees only the dossiers of a house they
 * belong to, and history only for knowledge still held, with snapshots hidden.
 */
export function readDossiers({actor,houseId,dossiers,findings,events,audit,catalog}){
  const admin=actor.role==='narrador';
  if(!admin){
    if(typeof houseId!=='string'||!houseId)fail('denied','Acesso não autorizado ao dossiê desta Casa');
    requireRead(actor,houseId);
  }
  const cat=new Map(catalog.map(c=>[c.id,c]));
  const keyOf=(d,o,k)=>d+'\u0000'+o+'\u0000'+k;
  return dossiers.filter(d=>admin?(houseId==null||d.ownerHouseId===houseId):d.ownerHouseId===houseId)
    .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>{
      const fs=findings.filter(f=>f.dossierId===d.id);
      const held=new Set(fs.map(f=>keyOf(d.id,f.objective,f.subjectKey)));
      const t=cat.get(d.targetHouseId);
      return {id:d.id,ownerHouseId:d.ownerHouseId,targetHouseId:d.targetHouseId,
        ownerHouseName:cat.get(d.ownerHouseId)?.name??d.ownerHouseId,targetHouseName:t?.name??d.targetHouseId,
        targetRegion:t?.region??null,updatedAt:d.updatedAt,
        findings:[...fs].sort((a,b)=>String(b.verifiedAt).localeCompare(String(a.verifiedAt))||
          (a.subjectKey<b.subjectKey?-1:a.subjectKey>b.subjectKey?1:0)).map(f=>({id:f.id,objective:f.objective,key:f.subjectKey,
          snapshot:f.valueSnapshot,discoveredDate:f.discoveredDateKey,verifiedDate:f.verifiedDateKey})),
        history:events.filter(e=>e.dossierId===d.id&&(admin||held.has(keyOf(d.id,e.objective,e.subjectKey))))
          .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(e=>({id:e.id,objective:e.objective,
          key:e.subjectKey,action:e.eventType,dateKey:e.campaignDateKey,oldSnapshot:admin?e.previousSnapshot:null,
          newSnapshot:admin?e.newSnapshot:{}})),
        adminHistory:admin?audit.filter(a=>a.dossierId===d.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
          .map(a=>({id:a.id,objective:a.objective,key:a.subjectKey,action:a.action,dateKey:a.campaignDateKey,reason:a.reason})):[]};
    });
}
