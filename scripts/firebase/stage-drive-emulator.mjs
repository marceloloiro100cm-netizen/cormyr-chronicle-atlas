/**
 * Stage Drive sync state (bindings, file mappings, review inbox, outbox,
 * conflicts) in Firestore Emulator ONLY. Everything is server-only. Active
 * leases are NOT carried over: a new runtime must claim its own. No values
 * are printed; folder and file ids never leave the plan.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationDriveSyncStage';
const T={bindings:'public.drive_sync_bindings',files:'public.drive_sync_files',inbox:'public.drive_sync_inbox',
  outbox:'public.sync_outbox',conflicts:'public.sync_conflicts'};
const MAX_DOC=900_000;
const sha=s=>createHash('sha256').update(s).digest('hex');
export const fileDocId=(b,t,e)=>sha('drive-file:'+b+':'+t+':'+e);
export const inboxDocId=(b,f,h)=>sha('drive-inbox:'+b+':'+f+':'+h);
export const outboxDocId=(t,e,v)=>sha('drive-outbox:'+t+':'+e+':'+v);
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v==null||v==='')return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildDrivePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missingTables=Object.values(T).filter(n=>!by.has(n)).length;
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,oversizedDocuments:0};
  const docs={bindings:[],files:[],inbox:[],outbox:[],conflicts:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  const ids=new Set();
  for(const r of rows(T.bindings)){
    const en=bool(r.enabled),pr=bool(r.privacy_reviewed),ra=bool(r.runtime_authorized);
    const ok=r.id&&r.folder_id&&['house','player','master'].includes(r.scope)&&r.owner_user_id&&r.confirmed_by&&
      en!==null&&pr!==null&&ra!==null&&
      ((r.scope==='house'&&r.house_id&&!r.player_id)||(r.scope==='player'&&r.player_id)||
       (r.scope==='master'&&!r.house_id&&!r.player_id));
    if(!ok){issues.invalidValues++;continue;}
    if(!once('b:'+r.id))continue;
    ids.add(r.id);
    push('bindings',r.id,{id:r.id,folderId:r.folder_id,technicalFolderId:nz(r.technical_folder_id),scope:r.scope,
      houseId:nz(r.house_id),playerId:nz(r.player_id),ownerUserId:r.owner_user_id,confirmedBy:r.confirmed_by,
      privacyReviewed:pr,runtimeAuthorized:ra,enabled:en,lastCheckedAt:iso(r.last_checked_at),
      lastError:nz(r.last_error),leaseToken:null,leaseUntil:null});
  }
  for(const r of rows(T.files)){
    const snap=json(r.base_snapshot);
    if(!r.id||!r.file_id||!r.remote_hash||!['record','letter','reply'].includes(r.entity_type)||!r.entity_id||
       !snap||typeof snap!=='object'){issues.invalidValues++;continue;}
    if(!ids.has(r.binding_id)){issues.orphanLinks++;continue;}
    if(!once('f:'+r.binding_id+':'+r.entity_type+':'+r.entity_id)||!once('ff:'+r.binding_id+':'+r.file_id))continue;
    push('files',fileDocId(r.binding_id,r.entity_type,r.entity_id),{id:r.id,bindingId:r.binding_id,
      entityType:r.entity_type,entityId:r.entity_id,fileId:r.file_id,etag:nz(r.etag),baseSnapshot:snap,
      remoteHash:r.remote_hash,lastSyncedAt:iso(r.last_synced_at)});
  }
  for(const r of rows(T.inbox)){
    const folder=json(r.folder_snapshot),site=json(r.site_snapshot);
    if(!r.id||!r.file_id||!r.remote_hash||!folder||typeof folder!=='object'||site===undefined||
       !['review','conflict','applied','rejected'].includes(r.state)){issues.invalidValues++;continue;}
    if(!ids.has(r.binding_id)){issues.orphanLinks++;continue;}
    if(!once('i:'+r.binding_id+':'+r.file_id+':'+r.remote_hash))continue;
    push('inbox',inboxDocId(r.binding_id,r.file_id,r.remote_hash),{id:r.id,bindingId:r.binding_id,fileId:r.file_id,
      remoteHash:r.remote_hash,etag:nz(r.etag),siteSnapshot:site,folderSnapshot:folder,state:r.state,
      resolvedBy:nz(r.resolved_by),resolvedAt:iso(r.resolved_at),createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.outbox)){
    const version=int(r.version),attempts=int(r.attempts),payload=json(r.payload);
    if(!r.id||!['record','letter','reply'].includes(r.entity_type)||!r.entity_id||!Number.isInteger(version)||
       !Number.isInteger(attempts)||payload===undefined||!['pending','synced','error'].includes(r.state)){
      issues.invalidValues++;continue;}
    if(!once('o:'+r.entity_type+':'+r.entity_id+':'+version))continue;
    push('outbox',outboxDocId(r.entity_type,r.entity_id,version),{id:r.id,entityType:r.entity_type,
      entityId:r.entity_id,version,payload:payload??{},state:r.state,attempts,error:nz(r.error),
      createdAt:iso(r.created_at),lastAttemptAt:iso(r.last_attempt_at),nextAttemptAt:iso(r.next_attempt_at)});
  }
  for(const r of rows(T.conflicts)){
    const site=json(r.site_snapshot),folder=json(r.folder_snapshot);
    if(!r.id||!site||!folder){issues.invalidValues++;continue;}
    if(!once('c:'+r.id))continue;
    push('conflicts',r.id,{id:r.id,recordId:nz(r.record_id),siteSnapshot:site,folderSnapshot:folder,
      resolvedAt:iso(r.resolved_at),resolvedBy:nz(r.resolved_by),createdAt:iso(r.created_at)});
  }
  const src=Object.fromEntries(Object.entries(T).map(([k,n])=>[k,rows(n).length]));
  const counts=Object.fromEntries(Object.keys(T).map(k=>[k,docs[k].length]));
  const complete=JSON.stringify(src)===JSON.stringify(counts);
  return {snapshotId,docs,summary:{
    planValid:complete&&Object.values(issues).every(n=>n===0),missingTables,
    sourceCounts:src,stagedCounts:counts,coverageComplete:complete,issues,
    enabledBindings:docs.bindings.filter(d=>d.payload.enabled).length}};
}

export async function loadDrivePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildDrivePlan(tables,snapshotHash);
}

export async function writeDriveToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Drive plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;batch=db.batch();pending=0;size=0;};
  for(const [type,items] of Object.entries(plan.docs))for(const item of items){
    const b=bytes(item.payload);
    if(pending>0&&(pending>=100||size+b>4*1024*1024))await flush();
    batch.set(root.collection(type).doc(item.id),item.payload);pending++;size+=b;}
  await flush();
  await root.set({status:'complete',formatVersion:1,private:true,counts:plan.summary.stagedCounts});
  written++;
  return {staged:true,stagedCounts:plan.summary.stagedCounts,emulatorWrites:written,firebaseCloudWrites:0};
}

async function main(args){
  if(args.length<2||args[0]!=='--normalized')throw Error('Use --normalized DIR [--execute-emulator]');
  const execute=args.length===3&&args[2]==='--execute-emulator';
  if(args.length!==2&&!execute)throw Error('Invalid CLI args');
  const plan=await loadDrivePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid Drive plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-drive-stage');
  try{process.stdout.write(JSON.stringify(await writeDriveToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Drive staging blocked. No source data displayed.');process.exitCode=1;});
}
