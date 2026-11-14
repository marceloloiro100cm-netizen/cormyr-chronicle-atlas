/**
 * Stage schedule events (drafts + published snapshots) and their audit in
 * Firestore Emulator ONLY. Drafts are never client-readable in the source;
 * every collection is server-only here. No data values are printed.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {isCampaignDate} from './schedule-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationScheduleStage';
const T={events:'public.campaign_schedule_events',audit:'public.campaign_schedule_event_audit'};
const MAX_DOC=900_000;
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v==null||v==='')return null;if(typeof v==='object')return v;
  try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildSchedulePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.events].filter(n=>!by.has(n));
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,oversizedDocuments:0};
  const docs={events:[],audit:[]};
  const ids=new Set(),seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{
    if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}
    docs[type].push({id,payload});};
  for(const r of rows(T.events)){
    const version=int(r.version),del=bool(r.draft_deleted);
    const pubOk=r.published_date==null||r.published_date===''||isCampaignDate(r.published_date);
    if(!r.id||!isCampaignDate(r.draft_date)||typeof r.draft_title!=='string'||
       r.draft_title.trim().length<1||r.draft_title.length>180||del===null||
       version===null||Number.isNaN(version)||version<1||!pubOk){issues.invalidValues++;continue;}
    if(!once('e:'+r.id))continue;
    ids.add(r.id);
    push('events',r.id,{id:r.id,draftDate:r.draft_date,draftTitle:r.draft_title,
      draftDescription:r.draft_description??'',draftDeleted:del,
      publishedDate:nz(r.published_date),publishedTitle:nz(r.published_title),
      publishedDescription:nz(r.published_description),version,
      updatedAt:iso(r.updated_at),updatedBy:nz(r.updated_by)});
  }
  for(const r of rows(T.audit)){
    const before=json(r.before_state),after=json(r.after_state);
    if(!r.id||!r.event_id||typeof r.reason!=='string'||before===undefined||after===undefined){
      issues.invalidValues++;continue;}
    if(!ids.has(r.event_id)){issues.orphanLinks++;continue;}
    if(!once('a:'+r.id))continue;
    push('audit',r.id,{id:r.id,eventId:r.event_id,actor:nz(r.actor),changedAt:iso(r.changed_at),
      reason:r.reason,beforeState:before,afterState:after});
  }
  const src={events:rows(T.events).length,audit:rows(T.audit).length};
  const counts={events:docs.events.length,audit:docs.audit.length};
  const complete=counts.events===src.events&&counts.audit===src.audit;
  return {snapshotId,docs,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,
    coverageComplete:complete,issues}};
}

export async function loadSchedulePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildSchedulePlan(tables,snapshotHash);
}

export async function writeScheduleToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Schedule plan blocked before writes');
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
  const plan=await loadSchedulePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid schedule plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-schedule-stage');
  try{process.stdout.write(JSON.stringify(await writeScheduleToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Schedule staging blocked. No source data displayed.');process.exitCode=1;});
}
