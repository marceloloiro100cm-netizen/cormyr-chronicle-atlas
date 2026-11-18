/** Explicit narrator activation of a verified imported House baseline.
 * Imported records are immutable; each operational target is create-only.
 */
import {createHash} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {prepareHouseEconomySeedDraft} from './firebase-economy-seed-preflight';
import {monthFromHarptosDate} from '../calendar/house-time-impact';
import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const id=(s:unknown):s is string=>typeof s==='string'&&/^[^/\u0000-\u001f\u007f]{1,128}$/.test(s);
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export class HouseActivationError extends Error{
  constructor(readonly code:string,readonly status=403){super(code);}
}
const fail=(code:string,status=403):never=>{throw new HouseActivationError(code,status);};
export function createFirebaseHouseActivation({db,auth,snapshotId,enabled=false,env=process.env,now=()=>new Date().toISOString()}:{
  db:Firestore;auth:Auth;snapshotId:string;enabled?:boolean;env?:NodeJS.ProcessEnv;now?:()=>string;
}){
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail('house_activation_disabled',503);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const authRoot=db.collection('migrationAuthStage').doc(snapshotId);
  const time=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const noble=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  async function execute(token:string,input:unknown){
    if(!record(input)||!['inspect','activate'].includes(String(input['action']))||
       !id(input['houseId'])||Object.keys(input).some(k=>!['action','houseId','expectedSourceVersion','expectedSourceHash'].includes(k)))
      return fail('invalid_activation_request',400);
    const houseId=input['houseId'],activate=input['action']==='activate';
    if(activate&&(!Number.isSafeInteger(input['expectedSourceVersion'])||
       typeof input['expectedSourceHash']!=='string'||!/^[a-f0-9]{64}$/.test(input['expectedSourceHash'])))
      return fail('source_review_required',400);
    let uid:string;
    try{
      if(typeof token!=='string'||token.length<10||token.length>10000)throw Error();
      const decoded=await auth.verifyIdToken(token,true);
      const person=await auth.getUser(decoded.uid);
      if(!id(decoded.uid)||person.uid!==decoded.uid||person.disabled)throw Error();
      uid=decoded.uid;
    }catch{return fail('authentication_required',401);}
    const key=hash('house:'+houseId);
    const economy=runtime.collection('houseEconomies').doc(key);
    const treasury=runtime.collection('houseTreasuries').doc(key);
    const audit=runtime.collection('houseActivationAudits').doc(key);
    return db.runTransaction(async tx=>{
      const refs=[domain,authRoot,time,noble,domain.collection('access').doc(uid),
        runtime,time.collection('calendar').doc('current'),
        domain.collection('houses').doc(key),
        noble.collection('sheets').doc(hash('noble-sheet:'+houseId)),economy,treasury,audit];
      const d=await Promise.all(refs.map(ref=>tx.get(ref)));
      const actor=d[4]?.data();
      if(actor?.['userId']!==uid||actor['active']!==true||actor['admin']!==true||
         actor['profile']!=='narrador'||actor['requirePasswordChange']!==false||
         !Array.isArray(actor['memberHouseIds'])||actor['memberHouseIds'].length||
         !Array.isArray(actor['editHouseIds'])||actor['editHouseIds'].length)
        return fail('narrator_required');
      if(!d.slice(0,4).every(x=>x.exists&&x.data()?.['status']==='complete'&&x.data()?.['private']===true))
        return fail('source_stage_unavailable',503);
      const live=d[5]?.data();
      if(live?.['status']!=='active'||live['private']!==true||
         live['applicationEnabled']!==true||live['sourceSnapshotId']!==snapshotId||
         live['sourceSnapshotReconciled']!==true||
         live['sourceAuthority']!=='owner_adopted_firebase')
        return fail('publish_campaign_first',409);
      const calendar=effectiveCloudCalendar(d[6]?.data(),live,snapshotId);
      if(!calendar)return fail('calendar_unavailable',503);
      const house=d[7]?.data(),sheet=d[8]?.data();
      if(house?.['sourceId']!==houseId||house['active']!==true||house['season']!==2||
         sheet?.['houseId']!==houseId||!record(sheet['state']))
        return fail('house_source_unavailable',503);
      if(d[9]?.exists||d[10]?.exists||d[11]?.exists){
        // Never reseed an existing operational document, even on retries.
        const complete=[d[9],d[10],d[11]].every(x=>x?.exists&&
          x.data()?.['houseId']===houseId&&x.data()?.['sourceSnapshotId']===snapshotId);
        return {status:complete?'already_initialized':'existing_document_requires_review',houseId,preview:null,sourceHash:null};
      }
      const plan=prepareHouseEconomySeedDraft({snapshotId,houseId,
        sourceSheetVersion:sheet['version'],calendarMonth:monthFromHarptosDate(calendar),
        sourceState:sheet['state'],existingDocumentPresent:false});
      const balance=sheet['state']['treasury'];
      if(plan.status!=='ready_for_operator_review'||!plan.draft||!plan.preview)
        return {status:plan.status,houseId,preview:null,sourceHash:null};
      if(typeof balance!=='number'||!Number.isSafeInteger(balance)||balance<0||balance>1000000000)
        return {status:'treasury_invalid',houseId,preview:null,sourceHash:null};
      const preview={...plan.preview,treasury:balance,calendarMonth:monthFromHarptosDate(calendar)};
      if(!activate)return {status:'ready_for_operator_review',houseId,preview,sourceHash:plan.draft.sourceStateHash};
      if(input['expectedSourceVersion']!==sheet['version']||
         input['expectedSourceHash']!==plan.draft.sourceStateHash)
        return fail('source_version_conflict',409);
      const at=now();
      if(!Number.isFinite(Date.parse(at)))return fail('invalid_server_clock',503);
      tx.create(economy,{...plan.draft,status:'active',sourceReconciled:true,seedVerified:true,
        sourceAuthority:'owner_adopted_firebase',activatedBy:uid,activatedAt:at});
      tx.create(treasury,{houseId,status:'active',private:true,sourceSnapshotId:snapshotId,
        sourceReconciled:true,sourceSheetVersion:sheet['version'],balance,version:0,
        activatedBy:uid,activatedAt:at});
      tx.create(audit,{action:'activate_imported_house',actorUid:uid,houseId,
        sourceSnapshotId:snapshotId,sourceSheetVersion:sheet['version'],
        sourceStateHash:plan.draft.sourceStateHash,calendarVersion:calendar.version,at});
      tx.update(runtime,{constructionReadApproved:true,constructionSeededVerified:true,
        treasuryReadApproved:true,treasuryWriteApproved:true,treasurySeededVerified:true});
      return {status:'activated',houseId,preview,sourceHash:plan.draft.sourceStateHash};
    });
  }
  return {execute};
}

