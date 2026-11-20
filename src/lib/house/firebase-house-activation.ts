/** Explicit narrator activation of a verified imported House baseline.
 * Imported records are immutable; each operational target is create-only.
 */
import {createHash} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {prepareHouseEconomySeedDraft} from './firebase-economy-seed-preflight';
import {monthFromHarptosDate} from '../calendar/house-time-impact';
import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
import {advance} from './engine';
import {constructionStateHash} from './firebase-construction-transaction';
import type {HouseState} from './types';
/** Up to three monthly openings may be caught up when an imported sheet is
 * one désdia cycle behind the official month (owner decision, 19/11/2026). */
const MAX_CATCH_UP_MONTHS=3;
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
      // Rascunhos e fichas sob revisão não possuem economia oficialmente
      // aprovada. Expor o estado ao Narrador sem promover nem gravar o acervo.
      if(sheet['state']['phase']==='draft')
        return {status:'source_draft_requires_review',houseId,preview:null,sourceHash:null};
      if(sheet['state']['phase']==='review')
        return {status:'source_review_pending',houseId,preview:null,sourceHash:null};
      const target=monthFromHarptosDate(calendar);
      const sheetMonth=sheet['state']['month'];
      // Seed at the sheet's own month; the canonical engine then advances it
      // to the official month (projects complete exactly as in a month turn).
      const seedMonth=typeof sheetMonth==='number'&&Number.isSafeInteger(sheetMonth)&&
        sheetMonth<target&&target-sheetMonth<=MAX_CATCH_UP_MONTHS?sheetMonth:target;
      const plan=prepareHouseEconomySeedDraft({snapshotId,houseId,
        sourceSheetVersion:sheet['version'],calendarMonth:seedMonth,
        sourceState:sheet['state'],existingDocumentPresent:false});
      const balance=sheet['state']['treasury'];
      if(plan.status!=='ready_for_operator_review'||!plan.draft||!plan.preview)
        return {status:plan.status,houseId,preview:null,sourceHash:null};
      if(typeof balance!=='number'||!Number.isSafeInteger(balance)||balance<0||balance>1000000000)
        return {status:'treasury_invalid',houseId,preview:null,sourceHash:null};
      const preview={...plan.preview,treasury:balance,calendarMonth:target,
        catchUpMonths:target-seedMonth};
      if(!activate)return {status:'ready_for_operator_review',houseId,preview,sourceHash:plan.draft.sourceStateHash};
      if(input['expectedSourceVersion']!==sheet['version']||
         input['expectedSourceHash']!==plan.draft.sourceStateHash)
        return fail('source_version_conflict',409);
      const at=now();
      if(!Number.isFinite(Date.parse(at)))return fail('invalid_server_clock',503);
      let seeded:Record<string,unknown>={...plan.draft,status:'active',sourceReconciled:true,seedVerified:true,
        sourceAuthority:'owner_adopted_firebase',activatedBy:uid,activatedAt:at};
      if(seedMonth<target){
        let advanced:HouseState;
        try{advanced=JSON.parse(JSON.stringify(advance(plan.draft.state,target))) as HouseState;}
        catch{return fail('house_month_catch_up_failed',503);}
        seeded={...seeded,state:advanced,stateHash:constructionStateHash(advanced),version:1,
          monthlyProcessedTo:target,lastMonthlyProcessingAt:at};
      }
      tx.create(economy,seeded);
      tx.create(treasury,{houseId,status:'active',private:true,sourceSnapshotId:snapshotId,
        sourceReconciled:true,sourceSheetVersion:sheet['version'],balance,version:0,
        activatedBy:uid,activatedAt:at});
      tx.create(audit,{action:'activate_imported_house',actorUid:uid,houseId,
        sourceSnapshotId:snapshotId,sourceSheetVersion:sheet['version'],
        sourceStateHash:plan.draft.sourceStateHash,calendarVersion:calendar.version,
        catchUpMonths:target-seedMonth,at});
      tx.update(runtime,{constructionReadApproved:true,constructionSeededVerified:true,
        treasuryReadApproved:true,treasuryWriteApproved:true,treasurySeededVerified:true});
      return {status:'activated',houseId,preview,sourceHash:plan.draft.sourceStateHash};
    });
  }
  /**
   * The catalogue must never be read before a verified Narrator identity.
   * This guard also protects the bounded list endpoint used by the client to
   * process each House separately without one long Cloud Run request.
   */
  async function requireNarrator(token:string):Promise<void>{
    let uid:string;
    try{
      if(typeof token!=='string'||token.length<10||token.length>10000)
        return fail('authentication_required',401);
      const decoded=await auth.verifyIdToken(token,true);
      if(!id(decoded.uid))return fail('authentication_required',401);
      const person=await auth.getUser(decoded.uid);
      if(person.uid!==decoded.uid||person.disabled)
        return fail('authentication_required',401);
      uid=decoded.uid;
    }catch{return fail('authentication_required',401);}
    let actor:Record<string,unknown>|undefined;
    try{
      const access=await domain.collection('access').doc(uid).get();
      actor=access.data();
    }catch{return fail('house_access_unavailable',503);}
    if(actor?.['userId']!==uid||actor['active']!==true||
       actor['admin']!==true||actor['profile']!=='narrador'||
       actor['requirePasswordChange']!==false||
       !Array.isArray(actor['memberHouseIds'])||actor['memberHouseIds'].length||
       !Array.isArray(actor['editHouseIds'])||actor['editHouseIds'].length)
      return fail('narrator_required',403);
  }
  async function listHouses(token:string){
    await requireNarrator(token);
    let houses;
    try{houses=await domain.collection('houses').get();}
    catch{return fail('house_catalog_unavailable',503);}
    const ids=houses.docs.map(d=>d.data())
      .filter(h=>h?.['active']===true&&h['season']===2&&id(h['sourceId']))
      .map(h=>h['sourceId'] as string).sort();
    if(ids.length>50||new Set(ids).size!==ids.length)
      return fail('house_catalog_unavailable',503);
    return {houseIds:ids};
  }
  /**
   * Backwards-compatible server batch. The browser now uses listHouses,
   * then inspect/activate per House: smaller requests and visible progress.
   * Every mutation still requires fresh transaction-time authorization.
   */
  async function activateAll(token:string){
    const {houseIds}=await listHouses(token);
    const results:{houseId:string;status:string}[]=[];
    for(const houseId of houseIds){
      try{
        const inspected=await execute(token,{action:'inspect',houseId}) as {status:string;preview:{sourceSheetVersion:number}|null;sourceHash:string|null};
        if(inspected.status!=='ready_for_operator_review'||!inspected.preview||!inspected.sourceHash){
          results.push({houseId,status:inspected.status});continue;
        }
        const done=await execute(token,{action:'activate',houseId,
          expectedSourceVersion:inspected.preview.sourceSheetVersion,expectedSourceHash:inspected.sourceHash}) as {status:string};
        results.push({houseId,status:done.status});
      }catch(e){
        // Authentication or narrator failures stop the whole batch.
        if(e instanceof HouseActivationError&&(e.status===401||e.code==='narrator_required'))throw e;
        results.push({houseId,status:e instanceof HouseActivationError?e.code:'unavailable'});
      }
    }
    return {results};
  }
  return {execute,activateAll,listHouses};
}

