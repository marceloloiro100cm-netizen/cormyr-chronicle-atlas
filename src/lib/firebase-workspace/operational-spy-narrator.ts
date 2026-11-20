import {assertTransactionActor} from './transaction-actor';
/* eslint-disable @typescript-eslint/no-explicit-any -- Firestore Admin e motor puro legado. */
/** Item 7c. Decisões e inteligência com o Narrador autenticado. */
import {randomUUID} from 'node:crypto';
import type {Scope} from './service';
import {constructionStateHash} from '../house/firebase-construction-transaction';
import {balances} from '../house/engine';
import {resolveMission,advanceMissions,LINKS,normalizeRegion}
 from '../../../scripts/firebase/spy-missions-core.mjs';
import {awardOnDecision,finalize,adminAction,knownCount,sourceItems}
 from '../../../scripts/firebase/spy-intel-core.mjs';
import {readSpyTx,spyActor,spyDigest,spyUuid,spySafe,spyFail,asSpyError,
 setSpyPayload,spyRequestRef} from './operational-spy-context';
import type {HouseState} from '../house/types';

const METHODS=new Set(['spy_resolve_agent_mission','spy_advance_active_missions',
 'spy_intelligence_finalize','spy_intelligence_admin_action','spy_review_region_link']);
export const spyNarratorMethod=(name:string)=>METHODS.has(name);
type Inputs={db:any;snapshotId:string;scope:Scope;name:string;args:Record<string,any>;
 source:any;calendar:any;archivedSheets:Record<string,any>[]};
function requireNarrator(scope:Scope){
 if(scope.profile!=='narrador')spyFail('access_denied',403);
}
async function authoritativeSheet(tx:any,root:any,houseId:string,
 snapshotId:string,archived:Record<string,any>[]){
 const entries=archived.filter(r=>r['house_id']===houseId);
 if(entries.length>1)spyFail('spy_target_source_ambiguous',503);
 const doc=await tx.get(root.collection('houseEconomies')
  .doc(spyDigest('house:'+houseId)));
 if(doc.exists){
  const v=doc.data();
  if(!v||v.status!=='active'||v.seedVerified!==true||
     v.houseId!==houseId||v.sourceSnapshotId!==snapshotId||
     !Number.isSafeInteger(v.version)||v.version<1||!v.state||
     typeof v.state!=='object'||v.stateHash!==constructionStateHash(v.state))
    spyFail('spy_target_source_invalid',503);
  return {state:v.state,version:v.version};
 }
 if(!entries.length)return null;
 const row=entries[0]!;
 if(!row['state']||typeof row['state']!=='object'||
    !Number.isSafeInteger(row['version']))
  spyFail('spy_target_source_invalid',503);
 return {state:row['state'],version:row['version']};
}
function checkedResources(sheet:any){
 if(!sheet?.state)return null;
 let total:any;
 try{total=balances(sheet.state as HouseState).total;}
 catch{spyFail('spy_target_balances_invalid',503);}
 if(!total||Object.values(total).some(v=>!Number.isSafeInteger(v)))
  spyFail('spy_target_balances_invalid',503);
 return total;
}
const write=(tx:any,root:any,snapshot:string,coll:string,type:string,
 row:any,key:string)=>setSpyPayload(tx,root,coll,type,key,row,snapshot);
function persistIntelligence(tx:any,root:any,snapshot:string,r:any){
 if(r.dossier)write(tx,root,snapshot,'spyDossiers','dossier',r.dossier,r.dossier.id);
 if(r.award)write(tx,root,snapshot,'spyAwards','award',r.award,r.award.operationId);
 for(const f of r.findings??[])
  write(tx,root,snapshot,'spyFindings','finding',f,f.id);
 for(const e of r.events??[])
  write(tx,root,snapshot,'spyIntelEvents','intel-event',e,e.id);
}
function validity(op:any,calendar:any){
 if(!op||!spySafe(op.id)||op.targetType!=='house')
  spyFail('spy_operation_not_found',404);
 if(!Number.isSafeInteger(calendar.version))
  spyFail('spy_calendar_invalid',503);
}
export async function commitSpyNarrator({
 db,snapshotId,scope,name,args,source,calendar,archivedSheets,
}:Inputs):Promise<any>{
 requireNarrator(scope);
 if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
  spyFail('spy_write_disabled',501);
 if(!METHODS.has(name)||!args||typeof args!=='object'||Array.isArray(args))
  spyFail('spy_operation_invalid');
 const requestKey=args['p_request_key'];
 if(!spyUuid(requestKey))spyFail('spy_request_invalid');
 if(Buffer.byteLength(JSON.stringify(args),'utf8')>10000)
  spyFail('spy_operation_invalid');
 const fingerprint=spyDigest(JSON.stringify([name,scope.uid,args]));
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const request=spyRequestRef(root,name,scope.uid,requestKey);
 const actor=spyActor(scope);
 return db.runTransaction(async(tx:any)=>{
  const [state,attempt]=await Promise.all([
   readSpyTx({tx,root,snapshotId,source,calendar}),tx.get(request),
  ]);
  await assertTransactionActor({tx,db,snapshotId,scope,runtime:state.meta,
   deny:()=>spyFail('access_denied',403)});
  if(attempt.exists){
   const old=attempt.data();
   if(old?.fingerprint!==fingerprint||old?.actor!==scope.uid||
      !old?.result)spyFail('spy_request_conflict',409);
   return {...old.result,alreadyApplied:true};
  }
  const d=state.data;
  let result:any=null,changes:any[]=[];
  let op:any=null,target:any=null,sheet:any=null,stats:any=null;
  if(name==='spy_resolve_agent_mission'||name==='spy_intelligence_finalize'){
   const operationId=args['p_operation'];
   if(!spyUuid(operationId))spyFail('spy_operation_invalid');
   op=d.operations.find((x:any)=>x.id===operationId);
   validity(op,calendar);
   target=d.catalog.find((x:any)=>x.id===op.targetId&&x.publicReviewed===true);
   if(!target)spyFail('spy_target_not_reviewed',503);
   sheet=await authoritativeSheet(tx,root,op.targetId,snapshotId,archivedSheets);
   stats=d.nobleStats.find((x:any)=>x.houseId===op.targetId)??null;
  }
  try{
   if(name==='spy_advance_active_missions'){
    if(args['p_calendar_version']!==calendar.version)
     spyFail('spy_calendar_conflict',409);
    const moving=d.timeline.flatMap((t:any)=>{
     const operation=d.operations.find((o:any)=>o.id===t.operationId);
     if(!operation)return [];
     const agent=d.assets.find((a:any)=>a.id===t.agentId);
     return [{timeline:t,operation,agent}];
    });
    changes=advanceMissions({actor,items:moving,calendar,newId:randomUUID});
    result={advanced:changes.length,calendarVersion:calendar.version};
   }else if(name==='spy_resolve_agent_mission'){
    const agent=d.assets.find((a:any)=>a.id===op.assetId);
    const prior=d.history.find((h:any)=>h.requestKey===requestKey)??null;
    const r=resolveMission({actor,operation:op,agent,previousHistory:prior,
     segments:d.segments.filter((s:any)=>s.operationId===op.id),
     upgrades:d.upgrades.filter((u:any)=>u.agentId===op.assetId),
     target,sheet,stats,roll:args['p_roll'],modifier:args['p_modifier'],
     discovered:args['p_discovered'],
     guardOverride:args['p_guard_override']??null,
     prisonOverride:args['p_prison_override']??null,
     expectedVersion:args['p_expected_version'],key:requestKey,
     reason:args['p_reason']??'',calendar,newId:randomUUID});
    if(r.alreadyApplied)return r.result;
    changes=[r];result=r.result;
    const existingDossier=d.dossiers.find((v:any)=>
      v.ownerHouseId===op.ownerHouseId&&v.targetHouseId===op.targetId)??null;
    const prize=awardOnDecision({decision:r.decision,operation:r.operation,
     dossier:existingDossier,
     findings:d.findings.filter((f:any)=>f.dossierId===existingDossier?.id),
     awardExists:d.awards.some((a:any)=>a.operationId===op.id),
     stats,sheet,calendar,newId:randomUUID});
    if(prize?.award){
     persistIntelligence(tx,root,snapshotId,prize);
     const items=sourceItems({objective:prize.award.objective,sheet,stats,
      resources:checkedResources(sheet)});
     const done=finalize({actor,award:prize.award,operation:r.operation,
      decision:r.decision,dossier:prize.dossier,
      findings:[...d.findings.filter((f:any)=>f.dossierId===prize.dossier.id),...prize.findings],
      items,calendar,newId:randomUUID});
     if(done?.award)persistIntelligence(tx,root,snapshotId,done);
     result={...result,intelligenceStatus:done.result.status};
    }else{
     result={...result,intelligenceStatus:prize?.award?
      prize.award.processingState:'no_success_award'};
    }
   }else if(name==='spy_intelligence_finalize'){
    const award=d.awards.find((v:any)=>v.operationId===op.id)??null;
    const decision=d.decisions.filter((v:any)=>v.operationId===op.id)
     .sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)))
     .find((v:any)=>v.resolution==='success')??null;
    const dossier=award?d.dossiers.find((v:any)=>v.id===award.dossierId):null;
    const items=award?sourceItems({objective:award.objective,sheet,stats,
     resources:checkedResources(sheet)}):null;
    const r=finalize({actor,award,operation:op,decision,dossier,
     findings:d.findings.filter((f:any)=>f.dossierId===dossier?.id),
     items,calendar,newId:randomUUID});
    persistIntelligence(tx,root,snapshotId,r);
    result=r.result;
   }else if(name==='spy_intelligence_admin_action'){
    const dossierId=args['p_dossier'];
    if(!spyUuid(dossierId))spyFail('spy_operation_invalid');
    const dossier=d.dossiers.find((v:any)=>v.id===dossierId);
    if(!dossier)spyFail('spy_dossier_not_found',404);
    sheet=await authoritativeSheet(tx,root,dossier.targetHouseId,
     snapshotId,archivedSheets);
    stats=d.nobleStats.find((x:any)=>x.houseId===dossier.targetHouseId)??null;
    const objective=args['p_objective'];
    const existing=d.findings.find((f:any)=>f.dossierId===dossierId&&
     f.objective===objective&&f.subjectKey===args['p_subject_key'])??null;
    const needsItems=args['p_action']!=='revoke';
    const items=needsItems?sourceItems({objective,sheet,stats,
     resources:checkedResources(sheet)}):null;
    const r=adminAction({actor,dossier,objective,
     subjectKey:args['p_subject_key'],action:args['p_action'],
     reason:args['p_reason'],existing,items,calendar,newId:randomUUID});
    write(tx,root,snapshotId,'spyDossiers','dossier',r.dossier,r.dossier.id);
    if(r.finding)write(tx,root,snapshotId,'spyFindings','finding',r.finding,r.finding.id);
    if(r.remove)write(tx,root,snapshotId,'spyFindings','finding',{
     ...r.remove,deleted:true},r.remove.id);
    write(tx,root,snapshotId,'spyAdminAudits','admin-audit',r.audit,r.audit.id);
    result={status:'applied',knownCount:knownCount(
     d.findings.filter((f:any)=>f.dossierId===dossierId),objective,r)};
   }else if(name==='spy_review_region_link'){
    const from=normalizeRegion(args['p_from']);
    const to=normalizeRegion(args['p_to']);
    const passage=args['p_passage'];
    if(!spyUuid(args['p_id'])||from===to||!spySafe(from)||!spySafe(to)||
      !['land_neighbor','sea_passage'].includes(passage)||
      args['p_approved']!==true||args['p_blocked']!==false||
      args['p_visibility']!=='public'||args['p_bidirectional']!==true||
      typeof args['p_source']!=='string'||args['p_source'].trim().length<8||
      typeof args['p_reason']!=='string'||args['p_reason'].trim().length<10||
      !LINKS.some((l:any)=>l[2]===passage&&
       (l[0]===from&&l[1]===to||l[0]===to&&l[1]===from)))
     spyFail('spy_route_not_in_official_graph',400);
    const route=root.collection('spyRegionReviews').doc(spyDigest('route:'+args['p_id']));
    const previous=await tx.get(route);
    if(previous.exists&&JSON.stringify(previous.data()?.link)!==
       JSON.stringify({from,to,passage}))
     spyFail('spy_route_identity_conflict',409);
    tx.set(route,{link:{from,to,passage},approved:true,
     approvedBy:scope.uid,at:new Date().toISOString(),
     version:(previous.data()?.version??0)+1,
     source:args['p_source'],reason:args['p_reason'],
     sourceSnapshotId:snapshotId});
    result={approved:true,routeId:args['p_id']};
   }
  }catch(e){return asSpyError(e);}
  for(const change of changes){
   if(change.operation)write(tx,root,snapshotId,'spyOperations',
    'operation',change.operation,change.operation.id);
   if(change.agent)write(tx,root,snapshotId,'spyAgents',
    'agent',change.agent,change.agent.id);
   for(const h of change.history??[])
    write(tx,root,snapshotId,'spyHistories','history',h,h.id);
   if(change.decision)write(tx,root,snapshotId,'spyDecisions',
    'decision',change.decision,change.decision.id);
   if(change.event)write(tx,root,snapshotId,'spyEvents','event',
    change.event,change.event.requestKey);
  }
  if(!result)spyFail('spy_operation_invalid');
  const at=new Date().toISOString();
  tx.set(request,{actor:scope.uid,action:name,requestKey,fingerprint,
   result,at,sourceSnapshotId:snapshotId});
  tx.set(root.collection('spyNarratorAudits').doc(
   spyDigest('narrator:'+scope.uid+':'+requestKey)),
   {actor:scope.uid,action:name,requestKey,fingerprint,
    operationId:op?.id??null,at,sourceSnapshotId:snapshotId});
  return result;
 });
}
