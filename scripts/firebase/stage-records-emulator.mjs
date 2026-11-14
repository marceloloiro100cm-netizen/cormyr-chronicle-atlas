/**
 * Stage campaign records and their version history in Firestore Emulator
 * ONLY. Source is immutable; no data values are printed.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {SYNC_STATES} from './record-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationRecordStage';
const T={records:'public.campaign_records',versions:'public.record_versions',
  houses:'public.campaign_houses',players:'public.campaign_players'};
const MAX_DOC=900_000;
const VIS=['player','house','gm'],KIND=['document','character','details'];
export const versionDocId=(recordId,version)=>
  createHash('sha256').update('record-version:'+recordId+':'+version).digest('hex');
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v&&typeof v==='object')return v;if(typeof v!=='string')return undefined;
  try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildRecordPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.records,T.versions,T.houses,T.players].filter(n=>!by.has(n));
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,oversizedDocuments:0};
  const houses=new Set(rows(T.houses).map(r=>r.id));
  const players=new Set(rows(T.players).map(r=>r.id));
  const docs={records:[],versions:[]};
  const recById=new Map();
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{
    if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}
    docs[type].push({id,payload});};
  for(const r of rows(T.records)){
    const version=int(r.version);
    const bad=!r.id||!VIS.includes(r.visibility)||!KIND.includes(r.kind)||typeof r.title!=='string'||
      version===null||Number.isNaN(version)||version<1||!SYNC_STATES.includes(r.sync_state||'pending')||
      (r.visibility==='player'&&!r.player_id)||(r.visibility==='house'&&!r.house_id);
    if(bad){issues.invalidValues++;continue;}
    if((r.house_id&&!houses.has(r.house_id))||(r.player_id&&!players.has(r.player_id))){
      issues.orphanLinks++;continue;}
    if(!once('r:'+r.id))continue;
    // Source index is UNIQUE(source_file_id,player_id): NULL player_id values
    // are distinct in PostgreSQL, so only owned imports can collide.
    if(r.source_file_id&&r.player_id&&!once('s:'+r.source_file_id+'|'+r.player_id))continue;
    const payload={id:r.id,houseId:nz(r.house_id),playerId:nz(r.player_id),visibility:r.visibility,
      kind:r.kind,title:r.title,content:r.content??'',version,createdBy:nz(r.created_by),
      updatedBy:nz(r.updated_by),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),
      syncState:r.sync_state||'pending',lastSyncedAt:iso(r.last_synced_at),
      sourceFileId:nz(r.source_file_id),sourceModifiedAt:nz(r.source_modified_at)};
    recById.set(r.id,payload);
    push('records',r.id,payload);
  }
  for(const r of rows(T.versions)){
    const version=int(r.version),snapshot=json(r.snapshot);
    if(!r.id||version===null||Number.isNaN(version)||!snapshot||typeof snapshot!=='object'){
      issues.invalidValues++;continue;}
    const rec=recById.get(r.record_id);
    if(!rec){issues.orphanLinks++;continue;}
    if(!once('v:'+r.record_id+':'+version))continue;
    push('versions',versionDocId(r.record_id,version),{recordId:r.record_id,version,snapshot,
      author:nz(r.author),createdAt:iso(r.created_at),
      visibility:rec.visibility,houseId:rec.houseId,playerId:rec.playerId});
  }
  const src={records:rows(T.records).length,versions:rows(T.versions).length};
  const counts={records:docs.records.length,versions:docs.versions.length};
  const complete=counts.records===src.records&&counts.versions===src.versions;
  return {snapshotId,docs,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,
    coverageComplete:complete,issues}};
}

export async function loadRecordPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildRecordPlan(tables,snapshotHash);
}

export async function writeRecordsToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Record plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;
    batch=db.batch();pending=0;size=0;};
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
  const plan=await loadRecordPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid record plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-record-stage');
  try{process.stdout.write(JSON.stringify(await writeRecordsToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Record staging blocked. No source data displayed.');process.exitCode=1;});
}
