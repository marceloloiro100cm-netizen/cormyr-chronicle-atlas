/* eslint-disable @typescript-eslint/no-explicit-any -- limite do Firebase Admin e das regras puras de espionagem. */
/** Item 7a: operações do jogador, transação única, acervo importado imutável. */
import {createHash,randomUUID} from 'node:crypto';
import type {Scope} from './service';
import {constructionStateHash} from '../house/firebase-construction-transaction';
import {projectSpyOverlay} from '../../../scripts/firebase/workspace-spy-overlay.mjs';
import {recruitAgent,createAgent,buyUpgrade,assignPortrait,removeAgent} from '../../../scripts/firebase/spy-agents-core.mjs';

const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const safe=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=160&&
 !/[\/\u0000-\u001f\u007f]/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export class SpyWriteError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}
const fail=(code:string,status=400):never=>{throw new SpyWriteError(code,status);};
type Input={
 db:any;snapshotId:string;scope:Scope;name:string;args:Record<string,any>;
 source:any;calendar:any;fallbackSheet?:{state:any;version:number}|null;
};
const METHODS=new Set(['spy_recruit_agent','spy_create_agent','spy_buy_agent_upgrade',
 'spy_assign_agent_portrait','spy_rename_agent','spy_remove_agent']);
const COLLECTIONS=[
 ['spyAgents','agent',500],['spyUpgrades','upgrade',1000],
 ['spyHistories','history',2000],['spyRemovals','removal',500],
] as const;
const dataField=(o:any,k:string)=>o&&typeof o==='object'?o[k]:undefined;
const validatedPayload=(docs:any[],kind:string,snapshotId:string)=>{
 if(!Array.isArray(docs))fail('spy_runtime_invalid',503);
 return docs.map(d=>{
  const v=d.data();
  if(!v||!safe(v.key)||v.sourceSnapshotId!==snapshotId||
     d.id!==digest(kind+':'+v.key)||!v.payload||
     typeof v.payload!=='object'||Array.isArray(v.payload))
   fail('spy_runtime_invalid',503);
  return v.payload;
 });
};
const activeOperation=(list:any[],agentId:string)=>list.some(o=>o.assetId===agentId&&
 !['cancelled','resolved','completed','failed','rejected'].includes(o.status));
function runtimeReady(root:any,snapshotId:string,calendar:any){
 if(root?.status!=='active'||root?.private!==true||
    root?.applicationEnabled!==true||root?.sourceSnapshotId!==snapshotId||
    root?.sourceSnapshotReconciled!==true||root?.spyReadApproved!==true||
    root?.spyWriteApproved!==true||
    !Number.isSafeInteger(calendar?.version)||root.calendarVersion!==calendar.version)
  fail('spy_runtime_not_approved',503);
}
function sheetReady(live:any,source:any,houseId:string,snapshotId:string){
 if(!live)return source;
 if(live.status!=='active'||live.seedVerified!==true||live.houseId!==houseId||
    live.sourceSnapshotId!==snapshotId||
    !Number.isSafeInteger(live.version)||live.version<1||
    !live.state||typeof live.state!=='object'||
    live.stateHash!==constructionStateHash(live.state))
  fail('spy_economy_not_reconciled',503);
 return {state:live.state,version:live.version};
}
function mapError(e:unknown):never{
 if(e instanceof SpyWriteError)throw e;
 const code=(e as any)?.code;
 if(code==='denied')fail('access_denied',403);
 if(code==='conflict')fail('spy_version_conflict',409);
 if(code==='invalid')fail('spy_operation_invalid',400);
 throw e;
}
export async function commitSpyAction({
 db,snapshotId,scope,name,args,source,calendar,fallbackSheet=null,
}:Input):Promise<any>{
 if(process.env['CORMYR_FIREBASE_SPY_ENABLED']!=='true')
  fail('spy_write_disabled',501);
 if(!METHODS.has(name)||!args||typeof args!=='object'||Array.isArray(args)||
    !/^[a-f0-9]{64}$/.test(snapshotId))fail('spy_operation_invalid');
 const houseId=args.p_house;
 if(!safe(houseId)||scope.profile!=='narrador'&&
    (scope.profile!=='jogador'||!scope.editHouseIds.includes(houseId)))
   fail('access_denied',403);
 if(scope.profile==='editor')fail('access_denied',403);
 const agentId=args.p_agent,now=new Date().toISOString();
 const requestKey=args.p_request_key??args.p_key??
   (name==='spy_assign_agent_portrait'?
    digest(JSON.stringify([name,houseId,agentId,args.p_portrait,args.p_expected_version])):null);
 if(typeof requestKey!=='string'||!safe(requestKey)||
    (name!=='spy_assign_agent_portrait'&&!uuid(requestKey)))
   fail('spy_operation_invalid');
 if(name!=='spy_recruit_agent'&&name!=='spy_create_agent'&&!uuid(agentId))
   fail('spy_operation_invalid');
 const raw=JSON.stringify([name,houseId,scope.uid,args]);
 if(Buffer.byteLength(raw,'utf8')>10000)fail('spy_operation_invalid');
 const fingerprint=digest(raw);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const houseEconomy=root.collection('houseEconomies').doc(digest('house:'+houseId));
 const houseControl=root.collection('spyHouseControls').doc(digest('spy-house:'+houseId));
 const request=root.collection('spyAgentRequests').doc(digest('spy-request:'+scope.uid+':'+requestKey));
 const claimId=typeof args.p_portrait==='string'?args.p_portrait:null;
 const claim=claimId?root.collection('spyPortraitClaims').doc(digest('portrait:'+claimId)):null;
 const actor={uid:scope.uid,role:scope.profile,memberHouseIds:new Set(scope.memberHouseIds),
  editHouseIds:new Set(scope.editHouseIds)};
 return db.runTransaction(async(tx:any)=>{
  // Todas as leituras precedem a primeira escrita.
  const [rootDoc,economyDoc,controlDoc,requestDoc,claimDoc,...snapshots]=await Promise.all([
   tx.get(root),tx.get(houseEconomy),tx.get(houseControl),tx.get(request),
   claim?tx.get(claim):Promise.resolve(null),
   ...COLLECTIONS.map(([col,,max])=>tx.get(root.collection(col).limit(max+1))),
  ]);
  runtimeReady(rootDoc.data(),snapshotId,calendar);
  if(requestDoc.exists){
   const old=requestDoc.data();
   if(old.actor!==scope.uid||old.houseId!==houseId||old.fingerprint!==fingerprint)
    fail('spy_request_key_conflict',409);
   return {...old.result,alreadyApplied:true};
  }
  const overlay:any={};
  for(let i=0;i<COLLECTIONS.length;i++){
   const [coll,kind,max]=COLLECTIONS[i]!;
   if(snapshots[i].docs.length>max)fail('spy_collection_over_limit',503);
   overlay[coll]=validatedPayload(snapshots[i].docs,kind,snapshotId);
  }
  let d:any;
  try{d=projectSpyOverlay(source,overlay);}catch{fail('spy_overlay_conflict',503);}
  const existsAgent=d.assets.find((a:any)=>a.id===agentId);
  if(claimDoc?.exists&&claimDoc.data()?.agentId!==agentId)
   fail('spy_portrait_conflict',409);
  const liveEconomy=economyDoc.exists?economyDoc.data():null;
  const sheet=sheetReady(liveEconomy,fallbackSheet,houseId,snapshotId);
  const requiredSheet=['spy_create_agent','spy_recruit_agent','spy_buy_agent_upgrade','spy_remove_agent'];
  if(requiredSheet.includes(name)&&(!sheet||sheet.state?.phase!=='active'))
   fail('spy_economy_unavailable',503);
  const extra:any={},writes:any[]=[];
  const histories:any[]=[],upgrades:any[]=[],removals:any[]=[];
  let resultingAgent:any=null,result:any=null,newEconomy:any=null;
  const newId=()=>randomUUID();
  const agentUpgrades=d.upgrades.filter((u:any)=>u.agentId===agentId);
  const holder=(portrait:string)=>d.assets.some((a:any)=>
   a.id!==agentId&&a.status!=='retired'&&a.portraitId===portrait);
  const previousRequest=d.history.find((h:any)=>h.requestKey===requestKey);
  const operating=existsAgent&&activeOperation(d.operations,agentId);
  const calendarData=calendar;
  try{
   if(name==='spy_recruit_agent'){
    const r=recruitAgent({actor,houseId,sourceHolding:args.p_source_holding,
     codename:args.p_codename,key:requestKey,sheet,assets:d.assets,
     existingByKey:previousRequest,existingAgent:previousRequest?
      d.assets.find((a:any)=>a.id===previousRequest.agentId):null,
     locations:d.locations,calendar:calendarData,newId,now});
    resultingAgent=r.agent;result=r.result;if(r.history)histories.push(r.history);
   }else if(name==='spy_create_agent'){
    if(!Array.isArray(args.p_upgrades))fail('spy_operation_invalid');
    const codes=args.p_upgrades;
    const previousAgent=previousRequest?d.assets.find((a:any)=>a.id===previousRequest.agentId):null;
    const r=createAgent({actor,houseId,sourceHolding:args.p_source_holding,
     codename:args.p_codename,portraitId:args.p_portrait,upgrades:codes,key:requestKey,
     ctx:{existingByKey:previousRequest,existingAgent:previousAgent,
      existingAgentUpgrades:d.upgrades.filter((u:any)=>u.agentId===previousAgent?.id),
      portrait:d.portraits.find((p:any)=>p.id===args.p_portrait),
      portraitHeldByOther:args.p_portrait?holder(args.p_portrait):false,
      catalogHasActive:d.portraits.some((p:any)=>p.active),
      sheet,assets:d.assets,locations:d.locations,calendar:calendarData,
      ledgerKeysTaken:new Set(),historyKeysTaken:new Set()},
     newId,now});
    resultingAgent=r.agent;result=r.result;histories.push(...(r.histories??[]));
    upgrades.push(...(r.upgrades??[]));if(r.ledgers?.length)newEconomy=r.sheet;
    extra.ledgers=r.ledgers??[];
   }else if(name==='spy_buy_agent_upgrade'){
    const r=buyUpgrade({actor,houseId,agent:existsAgent,
     code:args.p_code,expectedAgentVersion:args.p_expected_agent_version,
     expectedHouseVersion:args.p_expected_house_version,key:requestKey,sheet,
     keyUpgrade:d.upgrades.find((u:any)=>u.requestKey===requestKey),
     agentUpgrades,ledgerKeyTaken:false,historyKeyTaken:!!previousRequest,
     hasActiveOperation:operating,calendar:calendarData,newId,now});
    resultingAgent=r.agent;result=r.result;if(r.upgrade)upgrades.push(r.upgrade);
    if(r.history)histories.push(r.history);if(r.sheet)newEconomy=r.sheet;
    if(r.ledger)extra.ledgers=[r.ledger];
   }else if(name==='spy_assign_agent_portrait'){
    const r=assignPortrait({actor,houseId,agent:existsAgent,
     portraitId:args.p_portrait,expectedVersion:args.p_expected_version,
     catalogItem:d.portraits.find((p:any)=>p.id===args.p_portrait),
     heldByOther:holder(args.p_portrait)});
    resultingAgent=r.changed?r.agent:null;result=r.result;
   }else if(name==='spy_rename_agent'){
    if(!existsAgent||existsAgent.ownerHouseId!==houseId||
       !Number.isSafeInteger(args.p_expected_version)||
       existsAgent.version!==args.p_expected_version)fail('spy_version_conflict',409);
    const nameValue=String(args.p_name??'').trim();
    if(nameValue.length<2||nameValue.length>80||/[\u0000-\u001f\u007f]/.test(nameValue))
     fail('spy_operation_invalid');
    resultingAgent={...existsAgent,codename:nameValue,version:existsAgent.version+1};
    result={id:agentId,codename:nameValue,version:resultingAgent.version};
   }else if(name==='spy_remove_agent'){
    const r=removeAgent({actor,houseId,agent:existsAgent,
     expectedAgentVersion:args.p_expected_agent_version,
     expectedHouseVersion:args.p_expected_house_version,key:requestKey,sheet,
     previousRemoval:d.removals.find((x:any)=>x.agentId===agentId),
     keyRemoval:d.removals.some((x:any)=>x.requestKey===requestKey),
     ledgerKeyTaken:false,agentUpgrades,hasActiveOperation:operating,
     calendar:calendarData,newId,now});
    resultingAgent=r.agent;result=r.result;
    if(r.removal)removals.push(r.removal);if(r.history)histories.push(r.history);
    if(r.sheet)newEconomy=r.sheet;if(r.ledger)extra.ledgers=[r.ledger];
   }
  }catch(e){mapError(e);}
  if(!result)fail('spy_operation_invalid');
  if(resultingAgent){
   if(!safe(resultingAgent.id)||resultingAgent.ownerHouseId!==houseId)
    fail('spy_agent_invalid',503);
   writes.push([root.collection('spyAgents').doc(digest('agent:'+resultingAgent.id)),
    {key:resultingAgent.id,sourceSnapshotId:snapshotId,payload:resultingAgent}]);
  }
  for(const h of histories)writes.push([root.collection('spyHistories').doc(digest('history:'+h.id)),
   {key:h.id,sourceSnapshotId:snapshotId,payload:h}]);
  for(const u of upgrades)writes.push([root.collection('spyUpgrades').doc(digest('upgrade:'+u.agentId+':'+u.upgradeCode)),
   {key:u.agentId+':'+u.upgradeCode,sourceSnapshotId:snapshotId,payload:u}]);
  for(const r of removals)writes.push([root.collection('spyRemovals').doc(digest('removal:'+r.agentId)),
   {key:r.agentId,sourceSnapshotId:snapshotId,payload:r}]);
  if(newEconomy){
   if(!liveEconomy||rootDoc.data()?.houseOpsWriteApproved!==true)
    fail('spy_economy_not_approved',503);
   if(newEconomy.version!==sheet.version+(extra.ledgers?.length??1))
    fail('spy_economy_version_conflict',409);
   const next={...liveEconomy,state:newEconomy.state,version:newEconomy.version,
    stateHash:constructionStateHash(newEconomy.state),updatedBy:scope.uid,updatedAt:now};
   writes.push([houseEconomy,next]);
   for(const ledger of extra.ledgers??[]){
    const id=digest('spy-ledger:'+ledger.operationKey);
    writes.push([root.collection('houseOperationLedger').doc(id),{
     id,actorUid:scope.uid,houseId,action:ledger.action,
     explanation:ledger.explanation,rule:ledger.rule,version:ledger.version,
     campaignMonth:ledger.campaignMonth,created_at:ledger.createdAt,
     sourceSnapshotId:snapshotId,
    }]);
   }
  }
  // A reserva global impede duas transações de tomar o mesmo retrato.
  if(claim&&resultingAgent?.portraitId===claimId)
   writes.push([claim,{agentId:resultingAgent.id,houseId,sourceSnapshotId:snapshotId}]);
  if(existsAgent?.portraitId&&resultingAgent&&
     existsAgent.portraitId!==resultingAgent.portraitId){
   const old=root.collection('spyPortraitClaims').doc(digest('portrait:'+existsAgent.portraitId));
   // Sem leitura do dono do retrato antigo nesta transação, a liberação é
   // feita somente por novo processo de reconciliação, nunca por exclusão cega.
   void old;
  }
  const auditId=digest('spy-audit:'+scope.uid+':'+requestKey);
  const audit=root.collection('spyAgentAudits').doc(auditId);
  tx.set(houseControl,{houseId,lastRequest:requestKey,updatedBy:scope.uid,at:now,
   previousVersion:controlDoc.exists?controlDoc.data()?.version??0:0,
   version:(controlDoc.data()?.version??0)+1});
  for(const [ref,payload] of writes)tx.set(ref,payload);
  tx.set(request,{actor:scope.uid,houseId,requestKey,fingerprint,
   result,action:name,at:now,sourceSnapshotId:snapshotId});
  tx.set(audit,{actor:scope.uid,houseId,requestKey,fingerprint,
   action:name,agentId:resultingAgent?.id??agentId,at:now,sourceSnapshotId:snapshotId});
  return result;
 });
}
