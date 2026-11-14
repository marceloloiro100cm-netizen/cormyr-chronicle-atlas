/**
 * Runtime stage in Firestore Emulator ONLY of the small public tables that no
 * other stager consumed: mission-link graph, migration backups, profiles,
 * archive review, noble-house Drive exports, source links, workbook imports
 * and the legacy spy seed archive. Server-only, archival; no service. jsonb
 * values are stored as JSON text. Aggregate counts only are printed. The plan
 * also reconciles the stored mission-link graph with the one coded in the
 * espionage core.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {LINKS} from './spy-missions-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationResidualStage';
const T={
  links:'public.spy_cormyr_mission_links',backups:'public.campaign_migration_backups',profiles:'public.profiles',
  review:'public.archive_source_review',driveExports:'public.noble_house_drive_exports',
  sourceLinks:'public.noble_house_source_links',workbooks:'public.noble_house_workbook_imports',
  legacySeed:'public.spy_legacy_seed_archive',
};
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOC=900*1024;
const CHUNK_THRESHOLD=400*1024,CHUNK_CHARS=150000;
export const chunkText=t=>{const out=[];for(let i=0;i<t.length;i+=CHUNK_CHARS)out.push(t.slice(i,i+CHUNK_CHARS));return out;};
/** Inverse of the chunking: chunks may arrive in any order. */
export const joinChunks=chunks=>[...chunks].sort((a,b)=>a.index-b.index).map(c=>c.text).join('');
const sha=s=>createHash('sha256').update(s).digest('hex');
export const idOf=(...parts)=>sha(parts.join('\u0000'));
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string'||v==='')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');
function jsonText(v,{object=false}={}){
  if(v==null||v==='')return undefined;
  let p=v;
  if(typeof v==='string'){try{p=JSON.parse(v);}catch{return undefined;}}
  if(object&&(p===null||typeof p!=='object'||Array.isArray(p)))return undefined;
  return JSON.stringify(p);
}
const edge=(a,b,p)=>[a,b].sort().join('|')+'|'+p;

export function buildResidualPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!HASH.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const issues={duplicateIds:0,invalidValues:0,oversizedDocuments:0};
  const docs=Object.fromEntries([...Object.keys(T),'backupChunks'].map(k=>[k,[]]));
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const bad=()=>{issues.invalidValues++;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  const stored=new Set();
  for(const r of rows(T.links)){
    const active=bool(r.active);
    if(!r.from_region||!r.to_region||r.from_region===r.to_region||!['land_neighbor','sea_passage'].includes(r.passage)||active===null){bad();continue;}
    if(!once('l:'+r.from_region+'|'+r.to_region+'|'+r.passage))continue;
    if(active)stored.add(edge(r.from_region,r.to_region,r.passage));
    push('links',idOf(r.from_region,r.to_region,r.passage),{fromRegion:r.from_region,toRegion:r.to_region,passage:r.passage,active});
  }
  for(const r of rows(T.backups)){
    const snap=jsonText(r.snapshot);
    if(!UUID.test(r.id||'')||!r.reason||snap===undefined){bad();continue;}
    if(!once('b:'+r.id))continue;
    if(Buffer.byteLength(snap,'utf8')>CHUNK_THRESHOLD){
      // Large snapshots are split by characters into separate documents (Firestore limit is 1 MiB).
      const parts=chunkText(snap);
      push('backups',r.id,{id:r.id,reason:r.reason,snapshotJson:null,snapshotChunks:parts.length,createdAt:iso(r.created_at)});
      parts.forEach((text,i)=>push('backupChunks',r.id+':'+i,{backupId:r.id,index:i,text}));
    }else push('backups',r.id,{id:r.id,reason:r.reason,snapshotJson:snap,snapshotChunks:0,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.profiles)){
    if(!UUID.test(r.id||'')){bad();continue;}
    if(!once('p:'+r.id))continue;
    push('profiles',r.id,{id:r.id,displayName:r.display_name??'',createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.review)){
    if(!UUID.test(r.id||'')||!r.house_id||!r.source_file_id||r.modified_at==null||r.modified_at===''||!r.reason){bad();continue;}
    if(!once('r:'+r.id)||!once('rk:'+r.house_id+'|'+r.source_file_id+'|'+r.modified_at))continue;
    push('review',r.id,{id:r.id,houseId:r.house_id,sourceFileId:r.source_file_id,modifiedAt:r.modified_at,
      remoteText:nz(r.remote_text),localText:nz(r.local_text),reason:r.reason,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.driveExports)){
    const ver=int(r.exported_version);
    if(!UUID.test(r.binding_id||'')||!r.house_id||!Number.isInteger(ver)||ver<0||!r.status){bad();continue;}
    if(!once('de:'+r.binding_id))continue;
    push('driveExports',r.binding_id,{bindingId:r.binding_id,houseId:r.house_id,fileId:nz(r.file_id),providerEtag:nz(r.provider_etag),
      contentHash:nz(r.content_hash),exportedVersion:ver,status:r.status,error:nz(r.error),lastSyncedAt:iso(r.last_synced_at)});
  }
  for(const r of rows(T.sourceLinks)){
    const sv=int(r.source_version),av=int(r.after_version);
    const totals=jsonText(r.confirmed_totals),snap=jsonText(r.source_snapshot),before=jsonText(r.before_state);
    if(!r.house_id||!UUID.test(r.record_id||'')||!Number.isInteger(sv)||!Number.isInteger(av)||!UUID.test(r.actor||'')||
       totals===undefined||snap===undefined||before===undefined){bad();continue;}
    if(!once('sl:'+r.house_id))continue;
    push('sourceLinks',sha('house:'+r.house_id),{houseId:r.house_id,recordId:r.record_id,sourceVersion:sv,sourceFileId:nz(r.source_file_id),
      sourceModifiedAt:nz(r.source_modified_at),confirmedTotalsJson:totals,sourceSnapshotJson:snap,beforeStateJson:before,
      afterVersion:av,actor:r.actor,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.workbooks)){
    if(!r.batch||!r.house_key||!['applied','missing','ambiguous','needs_review'].includes(r.status)||!r.detail){bad();continue;}
    if(!once('w:'+r.batch+'|'+r.house_key))continue;
    push('workbooks',idOf(r.batch,r.house_key),{batch:r.batch,houseKey:r.house_key,houseId:nz(r.house_id),status:r.status,
      detail:r.detail,checkedAt:iso(r.checked_at)});
  }
  for(const r of rows(T.legacySeed)){
    const snap=jsonText(r.archived_snapshot);
    if(!UUID.test(r.id||'')||!r.owner_house_id||!r.reason||snap===undefined){bad();continue;}
    if(!once('ls:'+r.id))continue;
    push('legacySeed',r.id,{id:r.id,ownerHouseId:r.owner_house_id,archivedSnapshotJson:snap,archivedAt:iso(r.archived_at),reason:r.reason});
  }
  const src=Object.fromEntries(Object.keys(T).map(k=>[k,rows(T[k]).length]));
  const counts=Object.fromEntries(Object.keys(T).map(k=>[k,docs[k].length]));
  const complete=Object.keys(T).every(k=>counts[k]===src[k]);
  // Reconciliation with the graph coded in the espionage core (only when the table is present).
  const core=new Set(LINKS.map(l=>edge(l[0],l[1],l[2])));
  const hasLinks=by.has(T.links);
  const missionLinksMatchCore=!hasLinks||(stored.size===core.size&&[...core].every(e=>stored.has(e)));
  return {snapshotId,docs,summary:{
    planValid:complete&&Object.values(issues).every(n=>n===0)&&missionLinksMatchCore,
    sourceCounts:src,stagedCounts:{...counts,backupChunks:docs.backupChunks.length},coverageComplete:complete,missionLinksMatchCore,issues}};
}

export async function loadResidualPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildResidualPlan(tables,snapshotHash);
}

export async function writeResidualToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Residual plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;batch=db.batch();pending=0;size=0;};
  for(const [type,items] of Object.entries(plan.docs))for(const item of items){
    const b=bytes(item.payload);
    if(pending>0&&(pending>=50||size+b>4*1024*1024))await flush();
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
  const plan=await loadResidualPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid residual plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-residual-stage');
  try{process.stdout.write(JSON.stringify(await writeResidualToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Residual staging blocked. No source data displayed.');process.exitCode=1;});
}
