/**
 * Stage the runtime calendar + time operation history in Firestore Emulator
 * ONLY. Everything is server-only; no data values are printed.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {isCampaignDate} from './schedule-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationTimeEngineStage';
const T={cal:'public.campaign_calendar',ops:'public.campaign_time_operations',audit:'public.campaign_calendar_audit'};
const FESTIVALS=new Set(['midwinter','greengrass','midsummer','shieldmeet','highharvestide','feast-moon']);
const MAX_DOC=900_000;
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v==null||v==='')return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildTimeEnginePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.cal].filter(n=>!by.has(n));
  const issues={notExactlyOneCalendar:rows(T.cal).length===1?0:1,invalidValues:0,duplicateIds:0,oversizedDocuments:0};
  const docs={calendar:[],operations:[],audit:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  if(rows(T.cal).length===1){
    const r=rows(T.cal)[0];
    const year=int(r.year),month=int(r.month),day=int(r.day),version=int(r.version),auto=bool(r.auto_advance);
    const festival=r.festival||null;
    if(![year,month,day,version].every(Number.isInteger)||year<1||year>9999||month<0||month>11||day<1||day>30||
       version<1||auto===null||(festival!==null&&!FESTIVALS.has(festival)))issues.invalidValues++;
    else{
      const payload={year,month,day,festival,autoAdvance:auto,version,lastRound:int(r.last_round)??null,
        publishedAt:iso(r.published_at),updatedAt:iso(r.updated_at),updatedBy:nz(r.updated_by)};
      if(r.published_week!==undefined)payload.publishedWeek=int(r.published_week)??null;
      push('calendar','current',payload);
    }
  }
  for(const r of rows(T.ops)){
    const before=json(r.before_state),after=json(r.after_state),ev=int(r.expected_version);
    if(!r.id||!r.actor||!r.request_hash||!Number.isInteger(ev)||!['advance','set','publish'].includes(r.mode)||
       !isCampaignDate(r.from_date)||!isCampaignDate(r.to_date)||!before||!after||typeof r.reason!=='string'){
      issues.invalidValues++;continue;}
    if(!once('o:'+r.id))continue;
    push('operations',r.id,{id:r.id,actor:r.actor,requestHash:r.request_hash,expectedVersion:ev,mode:r.mode,
      fromDate:r.from_date,toDate:r.to_date,beforeState:before,afterState:after,reason:r.reason,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.audit)){
    const before=json(r.before_state),after=json(r.after_state);
    if(!r.id||before===undefined||after===undefined||typeof r.reason!=='string'){issues.invalidValues++;continue;}
    if(!once('a:'+r.id))continue;
    push('audit',r.id,{id:r.id,actor:nz(r.actor),beforeState:before,afterState:after,reason:r.reason,
      createdAt:iso(r.created_at||r.changed_at)});
  }
  const src={calendar:rows(T.cal).length,operations:rows(T.ops).length,audit:rows(T.audit).length};
  const counts={calendar:docs.calendar.length,operations:docs.operations.length,audit:docs.audit.length};
  const complete=JSON.stringify(src)===JSON.stringify(counts);
  return {snapshotId,docs,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,coverageComplete:complete,issues}};
}

export async function loadTimeEnginePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildTimeEnginePlan(tables,snapshotHash);
}

export async function writeTimeEngineToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Time engine plan blocked before writes');
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
  const plan=await loadTimeEnginePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid time engine plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-time-stage');
  try{process.stdout.write(JSON.stringify(await writeTimeEngineToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Time engine staging blocked. No source data displayed.');process.exitCode=1;});
}
