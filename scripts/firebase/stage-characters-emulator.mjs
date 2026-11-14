/**
 * Stage the canonical character registry in Firestore Emulator ONLY.
 * The registry is Narrator-only in the source (RLS admin read), so every
 * collection is server-only here. No data values are printed.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationCharacterStage';
const T={chars:'public.campaign_characters',links:'public.character_source_links',
  queue:'public.character_review_queue',rel:'public.character_relations',
  audit:'public.character_registry_audit',trans:'public.character_year_transitions',
  houses:'public.campaign_houses'};
const MAX_DOC=900_000;
const digest=s=>createHash('sha256').update(s).digest('hex');
export const idOf=(t,id)=>digest(t+':'+id);
export const linkDocId=(kind,key)=>idOf('char-link',kind+':'+key);
export const relationDocId=(from,to,rel)=>idOf('char-rel',from+'|'+to+'|'+rel);
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const iso=v=>{if(typeof v!=='string')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const json=v=>{if(v&&typeof v==='object')return v;if(typeof v!=='string')return undefined;
  try{return JSON.parse(v);}catch{return undefined;}};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

/** Parses a PostgreSQL text[] literal such as {a,"b c",NULL}. */
export function parsePgArray(v){
  if(v==null||v==='')return [];
  if(Array.isArray(v))return v;
  if(typeof v!=='string'||v[0]!=='{'||v[v.length-1]!=='}')return undefined;
  const body=v.slice(1,-1);if(body==='')return [];
  const out=[];let i=0;
  while(i<=body.length){
    let item='';
    if(body[i]==='"'){i++;
      while(i<body.length&&body[i]!=='"'){if(body[i]==='\\')i++;item+=body[i++];}
      if(body[i]!=='"')return undefined;i++;
    }else{while(i<body.length&&body[i]!==',')item+=body[i++];}
    out.push(item);
    if(i>=body.length)break;
    if(body[i]!==',')return undefined;i++;
    if(i===body.length){out.push('');break;}
  }
  return out;
}

export function buildCharacterPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.chars,T.houses].filter(n=>!by.has(n));
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,oversizedDocuments:0};
  const houses=new Set(rows(T.houses).map(r=>r.id));
  const charIds=new Set(rows(T.chars).map(r=>r.id));
  const docs={characters:[],links:[],queue:[],relations:[],audit:[],transitions:[]};
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{
    if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}
    docs[type].push({id,payload});};
  for(const r of rows(T.chars)){
    const aliases=parsePgArray(r.aliases),roles=parsePgArray(r.noble_roles);
    const nums=['birth_year','baseline_age','baseline_year','death_year','version'].map(k=>int(r[k]));
    if(!aliases||!roles||nums.some(Number.isNaN)||!r.id||!r.display_name||bool(r.is_noble)===null||nums[4]===null){
      issues.invalidValues++;continue;}
    if(r.house_id&&!houses.has(r.house_id)){issues.orphanLinks++;continue;}
    if(!once('c:'+r.id))continue;
    push('characters',r.id,{id:r.id,displayName:r.display_name,aliases,houseId:nz(r.house_id),
      nobleRoles:roles,race:nz(r.race),isNoble:bool(r.is_noble),birthYear:nums[0],
      birthDate:nz(r.birth_date),baselineAge:nums[1],baselineYear:nums[2],
      agePolicy:r.age_policy,ageExceptionNote:nz(r.age_exception_note),
      apparentAge:nz(r.apparent_age),aliveStatus:r.alive_status,deathYear:nums[3],
      deathDate:nz(r.death_date),visibility:r.visibility,ownerUserId:nz(r.owner_user_id),
      confidence:r.confidence,reviewStatus:r.review_status,reviewNote:r.review_note??'',
      version:nums[4],createdBy:nz(r.created_by),updatedBy:nz(r.updated_by),
      createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.links)){
    const ref=json(r.source_reference)??{};
    if(!charIds.has(r.character_id)){issues.orphanLinks++;continue;}
    if(!r.source_kind||!r.source_key){issues.invalidValues++;continue;}
    if(!once('l:'+r.source_kind+':'+r.source_key))continue;
    push('links',linkDocId(r.source_kind,r.source_key),{characterId:r.character_id,
      sourceKind:r.source_kind,sourceKey:r.source_key,sourceVisibility:r.source_visibility,
      sourceReference:ref,confirmedBy:nz(r.confirmed_by),confirmedAt:iso(r.confirmed_at)});
  }
  for(const r of rows(T.queue)){
    const ev=json(r.evidence)??{};
    const nums=['claimed_birth_year','claimed_age','claimed_age_year'].map(k=>int(r[k]));
    if(!r.id||!r.source_kind||!r.source_key||!r.proposed_name||nums.some(Number.isNaN)){
      issues.invalidValues++;continue;}
    if((r.house_id&&!houses.has(r.house_id))||(r.character_id&&!charIds.has(r.character_id))){
      issues.orphanLinks++;continue;}
    if(!once('q:'+r.id))continue;
    push('queue',r.id,{id:r.id,sourceKind:r.source_kind,sourceKey:r.source_key,
      proposedName:r.proposed_name,houseId:nz(r.house_id),claimedBirthYear:nums[0],
      claimedAge:nums[1],claimedAgeYear:nums[2],evidence:ev,
      sourceVisibility:r.source_visibility,status:r.status,characterId:nz(r.character_id),
      reviewNote:r.review_note??'',reviewedBy:nz(r.reviewed_by),reviewedAt:iso(r.reviewed_at),
      createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.rel)){
    if(!charIds.has(r.from_character)||!charIds.has(r.to_character)){issues.orphanLinks++;continue;}
    if(!once('r:'+r.from_character+'|'+r.to_character+'|'+r.relation))continue;
    push('relations',relationDocId(r.from_character,r.to_character,r.relation),{
      from:r.from_character,to:r.to_character,relation:r.relation,note:r.note??'',
      approvedBy:nz(r.approved_by),createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.audit)){
    const before=json(r.before_state),after=json(r.after_state);
    if(!r.id||!r.actor||!r.action||(r.character_id&&!charIds.has(r.character_id))){
      if(r.character_id&&!charIds.has(r.character_id))issues.orphanLinks++;else issues.invalidValues++;
      continue;}
    if(!once('a:'+r.id))continue;
    push('audit',r.id,{id:r.id,actor:r.actor,action:r.action,characterId:nz(r.character_id),
      sourceKind:nz(r.source_kind),sourceKey:nz(r.source_key),
      beforeState:before===undefined?null:before,afterState:after===undefined?null:after,
      reason:r.reason??'',createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.trans)){
    const nums=['calendar_version','from_year','to_year'].map(k=>int(r[k]));
    if(!r.id||nums.some(n=>n===null||Number.isNaN(n))){issues.invalidValues++;continue;}
    if(!once('t:'+r.id))continue;
    push('transitions',r.id,{id:r.id,calendarVersion:nums[0],fromYear:nums[1],toYear:nums[2],
      actor:nz(r.actor),createdAt:iso(r.created_at)});
  }
  const src={characters:rows(T.chars).length,links:rows(T.links).length,queue:rows(T.queue).length,
    relations:rows(T.rel).length,audit:rows(T.audit).length,transitions:rows(T.trans).length};
  const counts=Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,v.length]));
  const complete=Object.keys(counts).every(k=>counts[k]===src[k]);
  return {snapshotId,docs,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,
    coverageComplete:complete,issues}};
}

export async function loadCharacterPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildCharacterPlan(tables,snapshotHash);
}

export async function writeCharactersToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Character plan blocked before writes');
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
  const plan=await loadCharacterPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid character plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-character-stage');
  try{process.stdout.write(JSON.stringify(await writeCharactersToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Character staging blocked. No source data displayed.');process.exitCode=1;});
}
