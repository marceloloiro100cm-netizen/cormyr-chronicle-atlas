/* eslint-disable @typescript-eslint/no-explicit-any -- transações e regras puras no servidor. */
/** Missões do jogador no Firebase, item 7b. */
import {randomUUID} from 'node:crypto';
import type {Scope} from './service';
import {startMission,cancelMission,previewMission}
 from '../../../scripts/firebase/spy-missions-core.mjs';
import {spyMissionOdds} from '../espionage/spy-mission-probability';
import {readSpyTx,spyActor,spyDigest,spySafe,spyUuid,spyFail,
 asSpyError,setSpyPayload,spyRequestRef} from './operational-spy-context';

const allowed=new Set(['spy_submit_house_mission','spy_cancel_house_mission']);
const missionMethods=['spy_submit_house_mission','spy_cancel_house_mission'] as const;
export const spyMissionMethod=(name:string)=>
 missionMethods.includes(name as typeof missionMethods[number]);
const ready=(scope:Scope,houseId:unknown,write:boolean)=>{
 if(!spySafe(houseId)||scope.profile==='editor')spyFail('access_denied',403);
 if(scope.profile!=='narrador'&&
  (!scope.memberHouseIds.includes(houseId)||
   write&&!scope.editHouseIds.includes(houseId)))
  spyFail('access_denied',403);
 return houseId;
};
type Inputs={db:any;snapshotId:string;scope:Scope;name:string;args:Record<string,any>;
 source:any;calendar:any};

/** A prévia só revela a dificuldade agregada, nunca recursos ou fichas do alvo. */
export function previewSpyMission({scope,houseId,agentId,targetHouseId,
 data,targetSheet=null}:{
 scope:Scope;houseId:string;agentId:string;targetHouseId:string;
 data:any;targetSheet?:{state:any;version:number}|null;
}){
 ready(scope,houseId,false);
 if(!spyUuid(agentId)||!spySafe(targetHouseId))spyFail('spy_preview_invalid');
 const agent=data.assets.find((a:any)=>a.id===agentId);
 const target=data.catalog.find((a:any)=>a.id===targetHouseId&&a.publicReviewed===true);
 if(!agent||!target)spyFail('spy_preview_unavailable',404);
 const stats=data.nobleStats.find((s:any)=>s.houseId===targetHouseId)??null;
 let preview:any;
 try{
  preview=previewMission({actor:spyActor(scope),houseId,agent,target,
   sheet:targetSheet,stats});
 }catch(e){return asSpyError(e);}
 const equipment=new Set(data.upgrades.filter((u:any)=>
   u.agentId===agentId&&u.ownerHouseId===houseId).map((u:any)=>u.upgradeCode));
 if([...equipment].some(c=>!['forged_documents','ace_in_the_hole'].includes(c)))
  spyFail('spy_equipment_invalid',503);
 return {houseId:preview.houseId,agentId:preview.agentId,
  targetHouseId:preview.targetHouseId,houseName:preview.houseName,
  targetRegionId:preview.targetRegionId,source:preview.source,
  agentRank:preview.agentRank,
  forgedDocuments:equipment.has('forged_documents'),
  aceInTheHole:equipment.has('ace_in_the_hole'),
  ...spyMissionOdds(preview.houseDefense,preview.agentCunning)};
}
/** Todas as validações, incluindo a Casa-alvo, são refeitas dentro da transação. */
export async function commitSpyMission({
 db,snapshotId,scope,name,args,source,calendar,
}:Inputs):Promise<any>{
 if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
  spyFail('spy_write_disabled',501);
 if(!allowed.has(name)||!args||typeof args!=='object'||Array.isArray(args)||
    !/^[a-f0-9]{64}$/.test(snapshotId))spyFail('spy_operation_invalid');
 const houseId=ready(scope,args['p_house'],true);
 const key=args['p_request_key'];
 if(!spyUuid(key))spyFail('spy_request_invalid');
 const agentId=args['p_agent'];
 const operationId=args['p_operation'];
 if(name==='spy_submit_house_mission'&&!spyUuid(agentId)||
    name==='spy_cancel_house_mission'&&!spyUuid(operationId))
  spyFail('spy_operation_invalid');
 const fingerprint=spyDigest(JSON.stringify([name,scope.uid,args]));
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const request=spyRequestRef(root,name,scope.uid,key);
 const actor=spyActor(scope);
 return db.runTransaction(async(tx:any)=>{
  const [state,attempt]=await Promise.all([
   readSpyTx({tx,root,snapshotId,source,calendar}),tx.get(request),
  ]);
  if(attempt.exists){
   const old=attempt.data();
   if(old.actor!==scope.uid||old.fingerprint!==fingerprint||
      old.houseId!==houseId||!old.result)
    spyFail('spy_request_conflict',409);
   return {...old.result,alreadyApplied:true};
  }
  const d=state.data;
  let r:any;
  if(name==='spy_submit_house_mission'){
   const agent=d.assets.find((a:any)=>a.id===agentId);
   const target=d.catalog.find((t:any)=>
    t.id===args['p_target']&&t.publicReviewed===true);
   if(!target)spyFail('spy_target_not_reviewed',404);
   const previous=d.operations.find((o:any)=>
    o.ownerHouseId===houseId&&o.operationKey===key)??null;
   const loc=agent?(d.locations.find((l:any)=>
    l.id===agent.currentLocationId)??null):null;
   try{
    r=startMission({
     actor,houseId,agent,target,destination:args['p_destination'],
     objective:args['p_objective']??'house_resources',
     expectedAgentVersion:args['p_expected_agent_version'],
     expectedCalendarVersion:args['p_expected_calendar_version'],key,
     existingOp:previous,existingTimeline:previous?
      d.timeline.find((t:any)=>t.operationId===previous.id):null,
     keyEvent:d.events.find((e:any)=>e.requestKey===key)??null,
     agentLocation:loc,locations:d.locations,
     hasOpenOperation:d.operations.some((o:any)=>o.assetId===agentId&&
      !['cancelled','completed'].includes(o.status)),
     calendar,newId:randomUUID,
    });
   }catch(e){return asSpyError(e);}
  }else{
   const operation=d.operations.find((o:any)=>o.id===operationId);
   if(!operation||operation.ownerHouseId!==houseId)
    spyFail('spy_operation_not_found',404);
   const agent=d.assets.find((a:any)=>a.id===operation.assetId);
   try{
    r=cancelMission({
     actor,houseId,operation,agent,
     previousEvent:d.events.find((e:any)=>e.requestKey===key)??null,
     expectedVersion:args['p_expected_version'],key,calendar,newId:randomUUID,
    });
   }catch(e){return asSpyError(e);}
  }
  if(r.alreadyApplied)return r.result;
  // A operação e a trilha de auditoria são atômicas. A origem importada
  // é apenas lida; nunca atualizada ou apagada.
  const now=new Date().toISOString();
  if(r.operation)setSpyPayload(tx,root,'spyOperations','operation',r.operation.id,
   r.operation,snapshotId);
  if(r.timeline)setSpyPayload(tx,root,'spyTimelines','timeline',
   r.timeline.operationId,r.timeline,snapshotId);
  if(r.agent)setSpyPayload(tx,root,'spyAgents','agent',r.agent.id,
   r.agent,snapshotId);
  if(r.event)setSpyPayload(tx,root,'spyEvents','event',
   r.event.requestKey,r.event,snapshotId);
  tx.set(request,{actor:scope.uid,houseId,sourceSnapshotId:snapshotId,
   fingerprint,action:name,requestKey:key,result:r.result,createdAt:now});
  tx.set(root.collection('spyMissionAudits').doc(spyDigest('mission-audit:'+key)),{
   actor:scope.uid,houseId,action:name,operationId:r.operation?.id??null,
   agentId:r.agent?.id??null,fingerprint,requestKey:key,
   at:now,sourceSnapshotId:snapshotId,
  });
  return r.result;
 });
}
