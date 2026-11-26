import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
import {runtimeApprovalEnabled} from '../../../scripts/firebase/runtime-approval-policy.mjs';
/**
 * Firebase-only, strictly gated House construction purchases.
 * The historical migration stages are READ ONLY. An operator must
 * independently reconcile and provision each operational House document.
 * Nothing in this file seeds data, enables a flag or grants permission.
 */
import {createHash,randomInt} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {findItem} from './catalog';
import {purchase} from './engine';
import {previewHouseConstruction} from './firebase-construction-quote';
import {calculateFirebaseHouseEconomy,verifiedEconomicState}
  from './firebase-economic-readonly';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';
// The canonical Harptos implementation is a JS-only module.
// @ts-expect-error This .mjs has no TypeScript declarations.
import {validateHarptosDate,harptosKey} from '../../../scripts/firebase/stage-temporal-emulator.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const MAX_VERSION=2147483646;
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const record=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=(x:unknown):x is string=>typeof x==='string'&&ID.test(x);
const version=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=MAX_VERSION;
const fail=(code:string,status=403):never=>{throw new CloudConstructionError(code,status);};

export class CloudConstructionError extends Error{
  constructor(readonly code:string,readonly status=403){
    super(code);this.name='CloudConstructionError';
  }
}

/** Canonical JSON hash is independent of Firestore property insertion order. */
function normalized(v:unknown):unknown{
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(normalized);
  if(record(v)){
    const out:Record<string,unknown>={};
    for(const k of Object.keys(v).sort())out[k]=normalized(v[k]);
    return out;
  }
  return fail('invalid_operational_state',503);
}
const serialize=(v:unknown)=>JSON.stringify(normalized(v));
const digest=(v:unknown)=>hash(serialize(v));
/** For offline seed reconciliation; never exported through a public API. */
export const constructionStateHash=(v:unknown):string=>digest(v);

export type ConstructionPurchaseRequest={
  requestKey:string;houseId:string;expectedVersion:number;
  itemId:string;domainId:string;name:string;
  parentId?:string;supportId?:string;replaceId?:string;
  weaponSpecialty?:'fighting'|'marksmanship';
};
function validateInput(raw:unknown):ConstructionPurchaseRequest{
  if(!record(raw)||Object.keys(raw).some(k=>![
    'requestKey','houseId','expectedVersion','itemId','domainId',
    'name','parentId','supportId','replaceId','weaponSpecialty',
  ].includes(k))||typeof raw['requestKey']!=='string'||
    !KEY.test(raw['requestKey'])||!safeId(raw['houseId'])||
    !safeId(raw['itemId'])||!safeId(raw['domainId'])||
    !version(raw['expectedVersion'])||
    typeof raw['name']!=='string'||!raw['name'].trim()||
    raw['name'].length>160||/[\u0000-\u001f\u007f]/.test(raw['name'])||
    ['parentId','supportId','replaceId'].some(k=>
      raw[k]!==undefined&&!safeId(raw[k]))||
    (raw['weaponSpecialty']!==undefined&&
     raw['weaponSpecialty']!=='fighting'&&
     raw['weaponSpecialty']!=='marksmanship'))
    return fail('invalid_construction_request',400);
  return {
    requestKey:raw['requestKey'] as string,
    houseId:raw['houseId'] as string,
    expectedVersion:raw['expectedVersion'] as number,
    itemId:raw['itemId'] as string,
    domainId:raw['domainId'] as string,
    name:(raw['name'] as string).trim(),
    ...(raw['parentId']!==undefined?{parentId:raw['parentId'] as string}:{}),
    ...(raw['supportId']!==undefined?{supportId:raw['supportId'] as string}:{}),
    ...(raw['replaceId']!==undefined?{replaceId:raw['replaceId'] as string}:{}),
    ...(raw['weaponSpecialty']!==undefined?
      {weaponSpecialty:raw['weaponSpecialty'] as 'fighting'|'marksmanship'}:{}),
  };
}
function allowedActor(actor:unknown,uid:string,houseId:string):void{
  if(!record(actor)||actor['userId']!==uid||actor['active']!==true||
     actor['requirePasswordChange']!==false||
     !Array.isArray(actor['memberHouseIds'])||
     !Array.isArray(actor['editHouseIds']))
    return fail('access_denied');
  const members=actor['memberHouseIds'];
  const edits=actor['editHouseIds'];
  if(members.length>250||edits.length>250||
     members.some(id=>!safeId(id))||edits.some(id=>!safeId(id))||
     edits.some(id=>!members.includes(id)))
    return fail('invalid_access_scope');
  if(actor['profile']==='narrador'&&actor['admin']===true&&
     members.length===0&&edits.length===0)return;
  if(actor['profile']==='jogador'&&actor['admin']===false&&
     safeId(actor['playerId'])&&members.includes(houseId)&&
     edits.includes(houseId))return;
  return fail('access_denied');
}
function rootReady(v:unknown):boolean{
  return record(v)&&v['status']==='complete'&&v['private']===true;
}
function runtimeReady(v:unknown,snapshot:string,calendarVersion:number):boolean{
  return record(v)&&v['status']==='active'&&v['private']===true&&
    v['sourceSnapshotId']===snapshot&&v['sourceSnapshotReconciled']===true&&
    v['applicationEnabled']===true&&
    runtimeApprovalEnabled(v,'constructionWriteApproved')&&
    v['constructionSeededVerified']===true&&
    v['calendarVersion']===calendarVersion;
}
function campaignCalendar(v:unknown):{month:number;date:string;version:number}{
  if(!record(v)||!Number.isSafeInteger(v['version'])||
     (v['version'] as number)<1||
     !Number.isSafeInteger(v['year'])||
     (v['year'] as number)<1||(v['year'] as number)>9999||
     !Number.isSafeInteger(v['month'])||
     !Number.isSafeInteger(v['day'])||
     !validateHarptosDate(v['year'],v['month'],v['day'],v['festival']??null))
    return fail('calendar_unavailable',503);
  const calendar={year:v['year'] as number,month:v['month'] as number};
  return {
    month:monthFromHarptosDate(calendar),
    date:harptosKey(v['year'],v['month'],v['day'],v['festival']??null),
    version:v['version'] as number,
  };
}
function readyOperational(v:unknown,houseId:string,snapshot:string,
  sheetVersion:number,sourceHash:string):void{
  if(!record(v)||v['houseId']!==houseId||v['status']!=='active'||
     v['private']!==true||v['sourceSnapshotId']!==snapshot||
     v['sourceReconciled']!==true||v['seedVerified']!==true||
     v['sourceSheetVersion']!==sheetVersion||
     v['sourceStateHash']!==sourceHash||!version(v['version'])||
     !record(v['state'])||v['state']['houseId']!==houseId||
     v['stateHash']!==digest(v['state'])||
     (v['version']===0&&v['stateHash']!==sourceHash)||
     !verifiedEconomicState(v['state']))
    return fail('construction_source_not_reconciled',503);
}

type Options={
  db:Firestore;auth:Auth;snapshotId:string;projectId:string;
  enabled?:boolean;env?:NodeJS.ProcessEnv;
  clock?:()=>string;roll?:(sides:number)=>number;
};
export function createFirebaseCloudConstruction({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
  clock=()=>new Date().toISOString(),roll=sides=>randomInt(1,sides+1),
}:Options){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||
     typeof auth?.getUser!=='function')
    return fail('firebase_cloud_construction_disabled',503);

  const stage=db.collection('migrationDomainStage').doc(snapshotId);
  const authStage=db.collection('migrationAuthStage').doc(snapshotId);
  const timeStage=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const nobleStage=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);

  async function trustedUid(idToken:string):Promise<string>{
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      return fail('authentication_required',401);
    try{
      const token=await auth.verifyIdToken(idToken,true);
      if(!safeId(token?.uid))return fail('authentication_required',401);
      const user=await auth.getUser(token.uid);
      if(user.uid!==token.uid||user.disabled===true)
        return fail('authentication_required',401);
      return token.uid;
    }catch{return fail('authentication_required',401);}
  }

  return {
    async purchase(idToken:string,input:unknown){
      const uid=await trustedUid(idToken);
      const req=validateInput(input);
      const fingerprint=digest({uid,...req});
      const eventId=hash('construction-purchase:'+uid+':'+req.requestKey);
      const holdingId=hash('construction-holding:'+eventId);
      const houseRef=stage.collection('houses').doc(hash('house:'+req.houseId));
      const sheetRef=nobleStage.collection('sheets')
        .doc(hash('noble-sheet:'+req.houseId));
      const operationalRef=runtime.collection('houseEconomies')
        .doc(hash('house:'+req.houseId));
      const auditRef=runtime.collection('houseConstructionAudits').doc(eventId);

      return db.runTransaction(async tx=>{
        // All reads precede all writes, including idempotency lookups.
        const refs=[
          stage,authStage,timeStage,nobleStage,
          stage.collection('access').doc(uid),
          timeStage.collection('calendar').doc('current'),
          runtime,houseRef,sheetRef,operationalRef,auditRef,
        ];
        const docs=await Promise.all(refs.map(ref=>tx.get(ref)));
        allowedActor(docs[4]?.data(),uid,req.houseId);
        if(!docs.slice(0,4).every(d=>d.exists&&rootReady(d.data())))
          return fail('migration_stage_not_ready',503);
        const calendar=campaignCalendar(effectiveCloudCalendar(docs[5]?.data(),docs[6]?.data(),snapshotId));
        if(!runtimeReady(docs[6]?.data(),snapshotId,calendar.version))
          return fail('construction_runtime_not_approved',503);
        const house=docs[7]?.data();
        if(!docs[7]?.exists||!record(house)||house['sourceId']!==req.houseId||
           house['active']!==true||house['season']!==2||
           typeof house['name']!=='string')
          return fail('house_unavailable',404);
        const sheet=docs[8]?.data();
        if(!docs[8]?.exists||!record(sheet)||sheet['houseId']!==req.houseId||
           !version(sheet['version'])||!record(sheet['state'])||
           sheet['state']['houseId']!==req.houseId)
          return fail('house_sheet_unavailable',503);
        const sheetVersion=sheet['version'] as number;
        const origin=digest(sheet['state']);
        const operation=docs[9]?.data();
        if(!docs[9]?.exists||!record(operation))
          return fail('construction_source_not_reconciled',503);
        readyOperational(operation,req.houseId,snapshotId,sheetVersion,origin);
        const operationVersion=operation['version'] as number;
        if(!record(operation['state']))
          return fail('construction_source_not_reconciled',503);

        if(docs[10]?.exists){
          const audit=docs[10].data();
          if(!record(audit)||audit['actorUid']!==uid||
             audit['houseId']!==req.houseId||
             audit['requestFingerprint']!==fingerprint||
             audit['sourceSnapshotId']!==snapshotId)
            return fail('construction_request_key_conflict',409);
          // A retry may return the original result, never create another holding.
          if(!safeId(audit['holdingId'])||!version(audit['version'])||
             typeof audit['campaignDate']!=='string'||
             !Array.isArray(audit['dice'])||
             audit['dice'].some(v=>!Number.isSafeInteger(v)||v<1||v>100))
            return fail('construction_audit_invalid',503);
          return {id:eventId,holdingId:audit['holdingId'],
            houseId:req.houseId,version:audit['version'],
            campaignDate:audit['campaignDate'],duplicate:true,
            dice:audit['dice']};
        }
        if(req.expectedVersion!==operationVersion)
          return fail('construction_version_conflict',409);
        const state=verifiedEconomicState(operation['state']);
        if(!state||state.phase!=='active'||state.month!==calendar.month)
          return fail('construction_calendar_conflict',409);
        const item=findItem(req.itemId);
        if(!item||item.category==='vassal')
          return fail('construction_item_unavailable',404);
        if(item.pending)return fail('construction_rule_pending',409);
        const choice={
          houseId:req.houseId,itemId:req.itemId,domainId:req.domainId,
          ...(req.parentId?{parentId:req.parentId}:{}),
          ...(req.supportId?{supportId:req.supportId}:{}),
          ...(req.replaceId?{replaceId:req.replaceId}:{}),
        };
        let candidate;
        let dice:number[]=[];
        let costData;
        try{
          const preview=previewHouseConstruction(
            state,choice,house['name'],sheetVersion);
          if(!preview.purchaseEligibleByRules)
            return fail('construction_rule_blocked',409);
          const count=item.duration.dice??0,sides=item.duration.sides??6;
          if(!Number.isSafeInteger(count)||count<0||count>12||
             !Number.isSafeInteger(sides)||sides<2||sides>100)
            return fail('construction_roll_unavailable',503);
          dice=Array.from({length:count},()=>{
            const value=roll(sides);
            if(!Number.isSafeInteger(value)||value<1||value>sides)
              return fail('construction_roll_unavailable',503);
            return value;
          });
          const purchased=purchase(state,item,{
            id:holdingId,name:req.name,domainId:req.domainId,
            dice,...(req.parentId?{parentId:req.parentId}:{}),
            ...(req.supportId?{supportId:req.supportId}:{}),
            ...(req.replaceId?{replaceId:req.replaceId}:{}),
            ...(req.weaponSpecialty?{weaponSpecialty:req.weaponSpecialty}:{}),
          });
          // Firestore never receives undefined fields from the canonical engine.
          candidate=JSON.parse(JSON.stringify(purchased));
          costData=preview.costs;
          const after=calculateFirebaseHouseEconomy(candidate);
          if(!after||Object.values(after.balances.available).some(x=>x<0))
            return fail('construction_result_invalid',503);
        }catch(e){
          if(e instanceof CloudConstructionError)throw e;
          return fail('construction_rule_blocked',409);
        }
        if(!record(candidate)||!verifiedEconomicState(candidate))
          return fail('construction_result_invalid',503);
        const nextHash=digest(candidate);
        const createdAt=clock();
        if(typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))
          return fail('invalid_server_clock',503);
        tx.update(operationalRef,{
          state:candidate,version:operationVersion+1,
          stateHash:nextHash,lastConstructionEventId:eventId,updatedAt:createdAt,
        });
        tx.create(auditRef,{
          id:eventId,action:'purchase',actorUid:uid,houseId:req.houseId,
          sourceSnapshotId:snapshotId,requestKey:req.requestKey,
          requestFingerprint:fingerprint,holdingId,itemId:item.id,
          domainId:req.domainId,expectedVersion:operationVersion,
          version:operationVersion+1,sourceSheetVersion:sheetVersion,
          sourceStateHash:origin,beforeStateHash:operation['stateHash'],
          afterStateHash:nextHash,costs:costData,dice,
          // v1 replay proof: complete normalized canonical purchase input.
          // Remains private in Firestore, never returned to players.
          replaySchemaVersion:1,catalogRuleVersion:item.version,
          purchaseInput:req,
          campaignDate:calendar.date,createdAt,
        });
        return {id:eventId,holdingId,houseId:req.houseId,
          version:operationVersion+1,campaignDate:calendar.date,
          duplicate:false,dice};
      });
    },
  };
}

