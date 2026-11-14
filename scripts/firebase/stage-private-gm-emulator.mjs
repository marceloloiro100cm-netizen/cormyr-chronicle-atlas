/**
 * Stage Narrator-private content, vassal workbooks and the administrative
 * audit in Firestore Emulator ONLY. Never client-readable. Representation
 * sessions are ephemeral (30 min) and are intentionally not imported; the
 * migration backups table is excluded by design. No values are printed.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationPrivateGmStage';
const T={gm:'public.campaign_private_gm_content',vassal:'public.campaign_private_vassal_workbooks',
  audit:'public.campaign_admin_audit'};
const MAX_DOC=900_000;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v==null||v==='')return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return undefined;}};
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
export const gmDocId=id=>sha('gm:'+id);
export const vassalDocId=(p,v)=>sha('vassal:'+p+':'+v);

export function buildPrivateGmPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const issues={duplicateIds:0,invalidValues:0,oversizedDocuments:0};
  const docs={content:[],vassal:[],audit:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  for(const r of rows(T.gm)){
    const p=json(r.payload);
    if(!r.id||!p||typeof p!=='object'){issues.invalidValues++;continue;}
    if(!once('g:'+r.id))continue;
    push('content',gmDocId(r.id),{id:r.id,payload:p,updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.vassal)){
    const p=json(r.payload);
    if(!r.parent_house_id||!r.vassal_house_id||!p||typeof p!=='object'){issues.invalidValues++;continue;}
    if(!once('v:'+r.parent_house_id+'|'+r.vassal_house_id))continue;
    push('vassal',vassalDocId(r.parent_house_id,r.vassal_house_id),{parentHouseId:r.parent_house_id,
      vassalHouseId:r.vassal_house_id,payload:p,updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.audit)){
    const d=json(r.details);
    if(!r.id||!r.actor||typeof r.action!=='string'||!r.action||d===undefined){issues.invalidValues++;continue;}
    if(!once('a:'+r.id))continue;
    push('audit',r.id,{id:r.id,actor:r.actor,targetPlayer:r.target_player||null,action:r.action,
      details:d??{},createdAt:iso(r.created_at)});
  }
  const src={content:rows(T.gm).length,vassal:rows(T.vassal).length,audit:rows(T.audit).length};
  const counts={content:docs.content.length,vassal:docs.vassal.length,audit:docs.audit.length};
  const complete=JSON.stringify(src)===JSON.stringify(counts);
  return {snapshotId,docs,summary:{
    planValid:complete&&Object.values(issues).every(n=>n===0),
    sourceCounts:src,stagedCounts:counts,coverageComplete:complete,issues,
    excludedByDesign:['representation sessions (ephemeral)','migration backups']}};
}

export async function loadPrivateGmPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildPrivateGmPlan(tables,snapshotHash);
}

export async function writePrivateGmToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Private GM plan blocked before writes');
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
  const plan=await loadPrivateGmPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid private GM plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-private-gm-stage');
  try{process.stdout.write(JSON.stringify(await writePrivateGmToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Private GM staging blocked. No source data displayed.');process.exitCode=1;});
}
