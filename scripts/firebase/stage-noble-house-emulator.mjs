/**
 * Stage noble house sheets, ledger and rule overrides in the Firestore
 * Emulator ONLY. Source stays immutable; no data values are printed.
 * GM notes (admin-only secrets) are staged server-only (deny-all rules).
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationNobleHouseStage';
const T={
  sheets:'public.noble_house_sheets',ledger:'public.noble_house_ledger',
  rules:'public.noble_house_rule_overrides',notes:'public.noble_house_gm_notes',
  houses:'public.campaign_houses',
};
const MAX_DOC=900_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=s=>createHash('sha256').update(s).digest('hex');
export const idOf=(type,id)=>digest(type+':'+id);
export const sheetDocId=houseId=>idOf('noble-sheet',houseId);
export const ledgerDocId=(houseId,key)=>idOf('noble-ledger',houseId+':'+key);
const intVal=v=>typeof v==='string'&&/^-?\d+$/.test(v)?Number(v):null;
const isoDate=v=>{
  if(typeof v!=='string')return null;
  const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;
};
const json=v=>{
  if(v&&typeof v==='object')return v;
  if(typeof v!=='string')return undefined;
  try{return JSON.parse(v);}catch{return undefined;}
};
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildNobleHousePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.sheets,T.ledger,T.houses].filter(n=>!by.has(n));
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,oversizedDocuments:0};
  const houses=new Set(rows(T.houses).map(r=>r.id));
  const docs={sheets:[],ledger:[],ruleOverrides:[],gmNotes:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{
    if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}
    docs[type].push({id,payload});
  };
  for(const r of rows(T.sheets)){
    const state=json(r.state),version=intVal(r.version);
    if(!houses.has(r.house_id)){issues.orphanLinks++;continue;}
    if(!state||typeof state!=='object'||Array.isArray(state)||version===null||version<0||
       state.houseId!==r.house_id){issues.invalidValues++;continue;}
    if(!once('s:'+r.house_id))continue;
    push('sheets',sheetDocId(r.house_id),{
      houseId:r.house_id,state,version,updatedBy:r.updated_by||null,
      updatedAt:isoDate(r.updated_at),syncState:r.sync_state||null});
  }
  for(const r of rows(T.ledger)){
    const before=json(r.before_state)??{},after=json(r.after_state),version=intVal(r.version);
    if(!houses.has(r.house_id)){issues.orphanLinks++;continue;}
    if(!UUID.test(r.operation_key||'')||!after||typeof after!=='object'||
       version===null||typeof r.actor!=='string'||typeof r.action!=='string'){
      issues.invalidValues++;continue;}
    if(!once('l:'+r.house_id+':'+r.operation_key))continue;
    push('ledger',ledgerDocId(r.house_id,r.operation_key),{
      houseId:r.house_id,operationKey:r.operation_key,actor:r.actor,action:r.action,
      explanation:r.explanation??'',rule:r.rule??'',
      campaignMonth:intVal(r.campaign_month),beforeState:before,afterState:after,
      version,createdAt:isoDate(r.created_at)});
  }
  for(const r of rows(T.rules)){
    const def=json(r.definition),version=intVal(r.version);
    if(typeof r.id!=='string'||!r.id||!def||version===null){issues.invalidValues++;continue;}
    if(!once('r:'+r.id))continue;
    push('ruleOverrides',idOf('noble-rule',r.id),{
      ruleId:r.id,definition:def,version,updatedBy:r.updated_by||null,
      updatedAt:isoDate(r.updated_at)});
  }
  for(const r of rows(T.notes)){
    const secret=json(r.secret_state)??{};
    if(!houses.has(r.house_id)){issues.orphanLinks++;continue;}
    if(!once('n:'+r.house_id))continue;
    push('gmNotes',idOf('noble-gm-note',r.house_id),{
      houseId:r.house_id,notes:typeof r.notes==='string'?r.notes:'',secretState:secret,
      updatedAt:isoDate(r.updated_at)});
  }
  const counts=Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,v.length]));
  const sourceCounts={sheets:rows(T.sheets).length,ledger:rows(T.ledger).length,
    ruleOverrides:rows(T.rules).length,gmNotes:rows(T.notes).length};
  const complete=Object.keys(counts).every(k=>counts[k]===sourceCounts[k]);
  const planValid=missing.length===0&&complete&&
    Object.values(issues).every(n=>n===0);
  return {snapshotId,docs,summary:{
    planValid,missingRequiredTables:missing.length,sourceCounts,stagedCounts:counts,
    coverageComplete:complete,issues}};
}

export async function loadNobleHousePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildNobleHousePlan(tables,snapshotHash);
}

export async function writeNobleHouseToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Noble house plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;
    batch=db.batch();pending=0;size=0;};
  for(const [type,items] of Object.entries(plan.docs)){
    for(const item of items){
      const b=bytes(item.payload);
      if(pending>0&&(pending>=100||size+b>4*1024*1024))await flush();
      batch.set(root.collection(type).doc(item.id),item.payload);pending++;size+=b;
    }
  }
  await flush();
  await root.set({status:'complete',formatVersion:1,private:true,counts:plan.summary.stagedCounts});
  written++;
  return {staged:true,stagedCounts:plan.summary.stagedCounts,emulatorWrites:written,
    firebaseCloudWrites:0};
}

async function main(args){
  if(args.length<2||args[0]!=='--normalized')throw Error('Use --normalized DIR [--execute-emulator]');
  const execute=args.length===3&&args[2]==='--execute-emulator';
  if(args.length!==2&&!execute)throw Error('Invalid CLI args');
  const plan=await loadNobleHousePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid noble house plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-noble-stage');
  try{process.stdout.write(JSON.stringify(await writeNobleHouseToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Noble house staging blocked. No source data displayed.');
    process.exitCode=1;
  });
}
