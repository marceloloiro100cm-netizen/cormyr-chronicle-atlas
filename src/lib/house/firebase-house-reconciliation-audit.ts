/**
 * Narrator-only diagnostic of operational House-state reconciliation.
 * READ ONLY: no seed, approval, Firestore Rules or cutover changes.
 *
 * An internally consistent document is NOT proof of an audited mutation
 * history or permission/IAM acceptance. Never return states or hashes.
 */
import {createHash} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy} from './firebase-economic-readonly';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';
// @ts-expect-error Harptos source is a shared .mjs without TS declarations.
import {validateHarptosDate} from '../../../scripts/firebase/stage-temporal-emulator.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const record=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=(value:unknown):value is string=>
  typeof value==='string'&&ID.test(value);
const integer=(value:unknown,min=0,max=2147483646):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&
  value>=min&&value<=max;
const fail=(code:string,status=403):never=>{
  throw new HouseReconciliationAuditError(code,status);
};

export class HouseReconciliationAuditError extends Error{
  constructor(readonly code:string,readonly status=403){
    super(code);this.name='HouseReconciliationAuditError';
  }
}

export type HouseReconciliationStatus=
  'stage_incomplete'|'house_unavailable'|'sheet_unavailable'|
  'calendar_unavailable'|'source_invalid'|'runtime_unreconciled'|
  'operational_missing'|'operational_unverified'|
  'sheet_version_mismatch'|'source_hash_mismatch'|
  'operational_hash_mismatch'|'seed_mismatch'|
  'calendar_mismatch'|'economy_invalid'|
  'seed_consistent'|'operational_document_consistent';
export type HouseReconciliationReport={
  houseId:string;houseName:string;status:HouseReconciliationStatus;
  sourceVersion:number|null;operationalVersion:number|null;
  readGateApproved:boolean;writeGateApproved:boolean;
  documentIntegrityConfirmed:boolean;
  auditHistoryVerified:false;readyForCutover:false;readOnly:true;
};

const stageComplete=(v:unknown):boolean=>
  record(v)&&v['status']==='complete'&&v['private']===true;
const configuredRuntime=(v:unknown,snapshotId:string,calendarVersion:number)=>
  record(v)&&v['status']==='active'&&v['private']===true&&
  v['sourceSnapshotId']===snapshotId&&
  v['sourceSnapshotReconciled']===true&&
  v['applicationEnabled']===true&&
  v['calendarVersion']===calendarVersion;
const approvedRead=(v:unknown)=>
  record(v)&&v['constructionReadApproved']===true&&
  v['constructionSeededVerified']===true;
const approvedWrite=(v:unknown)=>
  record(v)&&v['constructionWriteApproved']===true&&
  v['constructionSeededVerified']===true;
const officialMonth=(v:unknown):{month:number;version:number}|null=>{
  if(!record(v)||!integer(v['year'],1,9999)||
     !integer(v['month'],0,11)||!integer(v['day'],1,30)||
     !integer(v['version'],1)||!validateHarptosDate(
       v['year'],v['month'],v['day'],v['festival']??null))
    return null;
  return {
    month:monthFromHarptosDate({
      year:v['year'],month:v['month'],
    }),
    version:v['version'],
  };
};
const sourceValid=(v:unknown,houseId:string):v is Record<string,unknown>=>{
  if(!record(v)||v['houseId']!==houseId)return false;
  const data=calculateFirebaseHouseEconomy(v);
  return data!==null&&data.houseId===houseId;
};

function narrator(actor:unknown,uid:string):void{
  if(!record(actor)||actor['userId']!==uid||
     actor['active']!==true||actor['requirePasswordChange']!==false||
     actor['profile']!=='narrador'||actor['admin']!==true||
     !Array.isArray(actor['memberHouseIds'])||
     actor['memberHouseIds'].length!==0||
     !Array.isArray(actor['editHouseIds'])||
     actor['editHouseIds'].length!==0)
    fail('narrator_only',403);
}

type Options={
  db:Firestore;auth:Auth;snapshotId:string;projectId:string;
  enabled?:boolean;env?:NodeJS.ProcessEnv;
};
export function createFirebaseHouseReconciliationAudit({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
}:Options){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||
     env['FIREBASE_AUTH_EMULATOR_HOST']||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||
     typeof auth?.getUser!=='function')
    fail('house_reconciliation_audit_disabled',503);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=db.collection('migrationAuthStage').doc(snapshotId);
  const time=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const noble=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);

  async function uidFor(idToken:string):Promise<string>{
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      fail('authentication_required',401);
    try{
      const token=await auth.verifyIdToken(idToken,true);
      if(!validId(token?.uid))fail('authentication_required',401);
      const person=await auth.getUser(token.uid);
      if(person.uid!==token.uid||person.disabled===true)
        fail('authentication_required',401);
      return token.uid;
    }catch{return fail('authentication_required',401);}
  }
  return {
    async inspect(idToken:string,houseId:unknown):
      Promise<HouseReconciliationReport>{
      const uid=await uidFor(idToken);
      if(!validId(houseId))fail('invalid_house',400);
      const selectedHouseId=houseId as string;
      const refs=[
        domain,access,time,noble,
        domain.collection('access').doc(uid),
        domain.collection('houses').doc(digest('house:'+selectedHouseId)),
        noble.collection('sheets').doc(digest('noble-sheet:'+selectedHouseId)),
        time.collection('calendar').doc('current'),
        runtime,
        runtime.collection('houseEconomies').doc(digest('house:'+selectedHouseId)),
      ];
      return db.runTransaction(async tx=>{
        const docs=await Promise.all(refs.map(ref=>tx.get(ref)));
        // Role checked before interpreting any private source or runtime.
        narrator(docs[4]?.data(),uid);
        const house=docs[5]?.data();
        const report=(status:HouseReconciliationStatus,
          sourceVersion:number|null=null,
          operationalVersion:number|null=null,
          runtimeData:unknown=null):HouseReconciliationReport=>({
          houseId:selectedHouseId,houseName:typeof house?.['name']==='string'
            ?house['name'].slice(0,160):'Casa não identificada',
          status,sourceVersion,operationalVersion,
          readGateApproved:approvedRead(runtimeData),
          writeGateApproved:approvedWrite(runtimeData),
          documentIntegrityConfirmed:
            status==='seed_consistent'||status==='operational_document_consistent',
          // A hash match does not certify the full event ledger or IAM.
          auditHistoryVerified:false,readyForCutover:false,readOnly:true,
        });

        if(docs.slice(0,4).some(d=>!d.exists||!stageComplete(d.data())))
          return report('stage_incomplete');
        if(!docs[5]?.exists||!record(house)||
           house['sourceId']!==selectedHouseId||house['active']!==true||
           house['season']!==2)
          return report('house_unavailable');
        const sheet=docs[6]?.data();
        if(!docs[6]?.exists||!record(sheet)||sheet['selectedHouseId']!==selectedHouseId||
           !integer(sheet['version'])||!record(sheet['state'])||
           sheet['state']['selectedHouseId']!==selectedHouseId)
          return report('sheet_unavailable');
        const sourceVersion=sheet['version'];
        const calendar=officialMonth(docs[7]?.data());
        if(!calendar)return report('calendar_unavailable',sourceVersion);
        if(!sourceValid(sheet['state'],selectedHouseId))
          return report('source_invalid',sourceVersion);
        const config=docs[8]?.data();
        if(!configuredRuntime(config,snapshotId,calendar.version))
          return report('runtime_unreconciled',sourceVersion,null,config);
        const operation=docs[9]?.data();
        if(!docs[9]?.exists)
          return report('operational_missing',sourceVersion,null,config);
        if(!record(operation)||operation['selectedHouseId']!==selectedHouseId||
           operation['status']!=='active'||operation['private']!==true||
           operation['sourceSnapshotId']!==snapshotId||
           operation['sourceReconciled']!==true||
           operation['seedVerified']!==true||
           !integer(operation['version'])||
           !record(operation['state'])||
           operation['state']['selectedHouseId']!==selectedHouseId)
          return report('operational_unverified',sourceVersion,null,config);
        const operationalVersion=operation['version'];
        if(operation['sourceSheetVersion']!==sourceVersion)
          return report('sheet_version_mismatch',
            sourceVersion,operationalVersion,config);
        let sourceHash:string,operationalHash:string;
        try{
          sourceHash=constructionStateHash(sheet['state']);
          operationalHash=constructionStateHash(operation['state']);
        }catch{return report('operational_unverified',
          sourceVersion,operationalVersion,config);}
        if(operation['sourceStateHash']!==sourceHash)
          return report('source_hash_mismatch',
            sourceVersion,operationalVersion,config);
        if(operation['stateHash']!==operationalHash)
          return report('operational_hash_mismatch',
            sourceVersion,operationalVersion,config);
        if(operationalVersion===0&&operationalHash!==sourceHash)
          return report('seed_mismatch',sourceVersion,operationalVersion,config);
        if(operation['state']['month']!==calendar.month)
          return report('calendar_mismatch',
            sourceVersion,operationalVersion,config);
        if(operation['state']['phase']!=='active'||
           !sourceValid(operation['state'],selectedHouseId))
          return report('economy_invalid',
            sourceVersion,operationalVersion,config);
        // Valid hashes and resource rules do not prove transaction history.
        return report(operationalVersion===0?'seed_consistent':
          'operational_document_consistent',
          sourceVersion,operationalVersion,config);
      });
    },
  };
}
