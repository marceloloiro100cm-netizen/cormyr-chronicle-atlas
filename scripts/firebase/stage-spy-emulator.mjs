/**
 * Runtime stage of the espionage domain (agents slice) in Firestore Emulator
 * ONLY: assets, history, upgrades, removals, portrait catalog, locations,
 * operations, segments and operation events. Server-only; aggregate counts
 * only are printed. Later slices add missions, travel engine and intelligence.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {isCampaignDate} from './schedule-core.mjs';
import {RULES_VERSION,UPGRADES} from './spy-agents-core.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationSpyStage';
const T={
  assets:'public.spy_assets',history:'public.spy_agent_history',upgrades:'public.spy_agent_upgrades',
  removals:'public.spy_agent_removals',portraits:'public.spy_portrait_catalog',locations:'public.spy_locations',
  operations:'public.spy_operations',segments:'public.spy_operation_segments',events:'public.spy_operation_events',
  catalog:'public.house_catalog',nobleStats:'public.spy_noble_house_stats',decisions:'public.spy_mission_decisions',
  timeline:'public.spy_mission_timeline',
};
const MAX_DOC=850*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_STATUS=new Set(['available','assigned','traveling','operating','returning','missing','captured','retired','lost','dead','pending_review']);
const EVENTS=new Set(['recruited','mission_success','mission_failure','escaped','captured','dead','promoted','upgrade_purchased','retired']);
const RANKS=new Set(['Verde','Treinada','Veterana','Elite']);
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string'||v==='')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');
/** text[] as exported by PostgREST/COPY: JSON array or {a,b} literal. */
export function textArray(v){
  if(v==null||v==='')return [];
  if(Array.isArray(v))return v.map(String);
  if(typeof v!=='string')return undefined;
  if(v.startsWith('[')){try{const a=JSON.parse(v);return Array.isArray(a)?a.map(String):undefined;}catch{return undefined;}}
  if(v.startsWith('{')&&v.endsWith('}'))return v.slice(1,-1).split(',').map(x=>x.replace(/^"|"$/g,'')).filter(Boolean);
  return undefined;
}

export function buildSpyAgentsPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const missing=[T.assets].filter(n=>!by.has(n));
  const issues={duplicateIds:0,invalidValues:0,orphanLinks:0,oversizedDocuments:0};
  const docs=Object.fromEntries(Object.keys(T).map(k=>[k,[]]));
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return;}docs[type].push({id,payload});};
  const bad=()=>{issues.invalidValues++;};
  const assetIds=new Set(),assetHouse=new Map(),opIds=new Set(),portraitIds=new Set();
  for(const r of rows(T.portraits)){
    const so=int(r.sort_order),active=bool(r.active);
    if(!r.id||!r.label||!r.image_url||!Number.isInteger(so)||active===null){bad();continue;}
    if(!once('p:'+r.id))continue;
    portraitIds.add(r.id);
    push('portraits',r.id,{id:r.id,label:r.label,imageUrl:r.image_url,sortOrder:so,active,createdAt:iso(r.created_at)});
  }
  const locIds=new Set();
  for(const r of rows(T.locations)){
    const ver=int(r.version),ap=bool(r.approved);
    if(!r.id||!r.kind||!r.ref_id||!Number.isInteger(ver)||ap===null){bad();continue;}
    if(!once('l:'+r.id))continue;
    locIds.add(r.id);
    push('locations',r.id,{id:r.id,kind:r.kind,refId:r.ref_id,regionId:nz(r.region_id),name:nz(r.name),approved:ap,
      source:nz(r.source),version:ver,visibility:nz(r.visibility)});
  }
  for(const r of rows(T.assets)){
    const ms=int(r.mission_successes),ver=int(r.version);
    if(!UUID.test(r.id||'')||!r.owner_house_id||!r.codename||!ASSET_STATUS.has(r.status)||!Number.isInteger(ms)||ms<0||
       !Number.isInteger(ver)||ver<1){bad();continue;}
    if(r.portrait_id&&!portraitIds.has(r.portrait_id)){issues.orphanLinks++;continue;}
    if(r.current_location_id&&!locIds.has(r.current_location_id)){issues.orphanLinks++;continue;}
    if(!once('a:'+r.id))continue;
    assetIds.add(r.id);assetHouse.set(r.id,r.owner_house_id);
    push('assets',r.id,{id:r.id,ownerHouseId:r.owner_house_id,kind:nz(r.kind),codename:r.codename,
      sourceHoldingId:nz(r.source_holding_id),sourceRef:nz(r.source_ref),currentLocationId:nz(r.current_location_id),
      status:r.status,rulesVersion:nz(r.rules_version)||RULES_VERSION,missionSuccesses:ms,portraitId:nz(r.portrait_id),
      version:ver,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.operations)){
    const ver=int(r.version),cal=int(r.source_calendar_version),fields=textArray(r.requested_fields);
    if(!UUID.test(r.id||'')||!r.owner_house_id||!r.mission_kind||!r.status||!r.target_type||!r.target_id||
       !Number.isInteger(ver)||!Number.isInteger(cal)||fields===undefined||!UUID.test(r.operation_key||'')){bad();continue;}
    if(!assetIds.has(r.asset_id)){issues.orphanLinks++;continue;}
    if(!once('o:'+r.id))continue;
    opIds.add(r.id);
    push('operations',r.id,{id:r.id,assetId:r.asset_id,ownerHouseId:r.owner_house_id,missionKind:r.mission_kind,
      targetType:r.target_type,targetId:r.target_id,status:r.status,operationKey:r.operation_key,requestedFields:fields,
      rulesVersion:nz(r.rules_version),sourceCalendarVersion:cal,version:ver,createdBy:nz(r.created_by),
      createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.segments)){
    const ord=int(r.ordinal),dur=int(r.duration_days),ev=int(r.edge_version);
    if(!UUID.test(r.id||'')||!r.status||!Number.isInteger(ord)||!Number.isInteger(dur)||dur<0||!isCampaignDate(r.departure_key)||
       !isCampaignDate(r.arrival_key)){bad();continue;}
    if(!opIds.has(r.operation_id)){issues.orphanLinks++;continue;}
    if(!once('s:'+r.id))continue;
    push('segments',r.id,{id:r.id,operationId:r.operation_id,ordinal:ord,edgeId:nz(r.edge_id),edgeVersion:Number.isInteger(ev)?ev:null,
      fromLocationId:nz(r.from_location_id),toLocationId:nz(r.to_location_id),departureKey:r.departure_key,
      arrivalKey:r.arrival_key,durationDays:dur,status:r.status});
  }
  for(const r of rows(T.history)){
    const total=int(r.total_successes),cun=int(r.cunning),cal=int(r.calendar_version);
    if(!UUID.test(r.id||'')||!UUID.test(r.request_key||'')||!r.owner_house_id||!r.actor||!EVENTS.has(r.event_type)||
       !isCampaignDate(r.event_date_key)||!RANKS.has(r.agent_rank)||![total,cun,cal].every(Number.isInteger)||total<0||
       typeof r.detail!=='string'){bad();continue;}
    if(!assetIds.has(r.agent_id)||(r.operation_id&&!opIds.has(r.operation_id))){issues.orphanLinks++;continue;}
    if(!once('h:'+r.id)||!once('hk:'+r.request_key))continue;
    const opt=k=>{const v=int(r[k]);return Number.isInteger(v)?v:null;};
    push('history',r.id,{id:r.id,ownerHouseId:r.owner_house_id,agentId:r.agent_id,operationId:nz(r.operation_id),
      eventType:r.event_type,eventDateKey:r.event_date_key,calendarVersion:cal,targetHouseId:nz(r.target_house_id),
      targetName:nz(r.target_name),targetRegion:nz(r.target_region),agentRank:r.agent_rank,cunning:cun,totalSuccesses:total,
      rollTotal:opt('roll_total'),modifier:opt('modifier'),targetDifficulty:opt('target_difficulty'),
      failureDegrees:opt('failure_degrees'),lawSnapshot:opt('law_snapshot'),guardPresent:bool(r.guard_present),
      prisonPresent:bool(r.prison_present),detail:r.detail,requestKey:r.request_key,actor:r.actor,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.upgrades)){
    const cost=int(r.cost_wealth);
    if(!(r.upgrade_code in UPGRADES)||cost!==1||!UUID.test(r.request_key||'')||!r.purchased_by){bad();continue;}
    if(!assetIds.has(r.agent_id)||assetHouse.get(r.agent_id)!==r.owner_house_id){issues.orphanLinks++;continue;}
    if(!once('u:'+r.agent_id+':'+r.upgrade_code)||!once('uk:'+r.request_key))continue;
    push('upgrades',r.agent_id+':'+r.upgrade_code,{agentId:r.agent_id,ownerHouseId:r.owner_house_id,upgradeCode:r.upgrade_code,
      costWealth:cost,purchasedAt:iso(r.purchased_at),requestKey:r.request_key,purchasedBy:r.purchased_by});
  }
  for(const r of rows(T.removals)){
    const refund=int(r.refunded_wealth);
    if(!r.codename||!UUID.test(r.request_key||'')||!Number.isInteger(refund)||refund<0||refund>2||!r.removed_by){bad();continue;}
    if(!assetIds.has(r.agent_id)||assetHouse.get(r.agent_id)!==r.owner_house_id){issues.orphanLinks++;continue;}
    if(!once('r:'+r.agent_id)||!once('rk:'+r.request_key))continue;
    push('removals',r.agent_id,{agentId:r.agent_id,ownerHouseId:r.owner_house_id,requestKey:r.request_key,refundedWealth:refund,
      portraitId:nz(r.portrait_id),codename:r.codename,removedBy:r.removed_by,removedAt:iso(r.removed_at)});
  }
  for(const r of rows(T.events)){
    if(!UUID.test(r.request_key||'')||!UUID.test(r.id||'')||!r.event_type||typeof r.reason!=='string'){bad();continue;}
    if(r.operation_id&&!opIds.has(r.operation_id)){issues.orphanLinks++;continue;}
    if(!once('ev:'+r.request_key))continue;
    const cal=int(r.calendar_version);
    push('events',r.request_key,{id:r.id,operationId:nz(r.operation_id),requestKey:r.request_key,actor:nz(r.actor),
      eventType:r.event_type,oldState:nz(r.old_state),newState:nz(r.new_state),reason:r.reason,
      calendarVersion:Number.isInteger(cal)?cal:null,occurredAt:iso(r.occurred_at)});
  }
  for(const r of rows(T.catalog)){
    const rev=bool(r.public_reviewed);
    if(!r.id||!r.name||!r.classification||rev===null){bad();continue;}
    if(!once('c:'+r.id))continue;
    push('catalog',r.id,{id:r.id,name:r.name,classification:r.classification,region:nz(r.region),publicReviewed:rev});
  }
  for(const r of rows(T.nobleStats)){
    const law=int(r.law);
    if(!r.house_id||!Number.isInteger(law)){bad();continue;}
    if(!once('ns:'+r.house_id))continue;
    push('nobleStats',r.house_id,{houseId:r.house_id,houseName:nz(r.house_name),law,regionId:nz(r.region_id)});
  }
  for(const r of rows(T.timeline)){
    const rounds=int(r.travel_rounds),days=int(r.travel_days),cal=int(r.source_calendar_version);
    let route;try{route=typeof r.route==='string'?JSON.parse(r.route):r.route;}catch{route=undefined;}
    if(!isCampaignDate(r.departure_key)||!isCampaignDate(r.arrival_key)||!isCampaignDate(r.investigation_end_key)||
       !r.owner_house_id||!r.origin_region||!r.destination_region||![rounds,days,cal].every(Number.isInteger)||
       days!==rounds*10||!Array.isArray(route)){bad();continue;}
    if(!opIds.has(r.operation_id)||!assetIds.has(r.agent_id)){issues.orphanLinks++;continue;}
    if(!once('t:'+r.operation_id))continue;
    push('timeline',r.operation_id,{operationId:r.operation_id,ownerHouseId:r.owner_house_id,agentId:r.agent_id,
      departureKey:r.departure_key,arrivalKey:r.arrival_key,investigationEndKey:r.investigation_end_key,
      originRegion:r.origin_region,destinationRegion:r.destination_region,travelRounds:rounds,travelDays:days,route,
      sourceLocationId:nz(r.source_location_id),destinationLocationId:nz(r.destination_location_id),
      sourceCalendarVersion:cal,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.decisions)){
    let mods;try{mods=typeof r.modifiers==='string'?JSON.parse(r.modifiers):r.modifiers;}catch{mods=undefined;}
    if(!UUID.test(r.id||'')||!r.resolution||mods===undefined){bad();continue;}
    if(!opIds.has(r.operation_id)){issues.orphanLinks++;continue;}
    if(!once('d:'+r.id))continue;
    const opt=k=>{const v=int(r[k]);return Number.isInteger(v)?v:null;};
    push('decisions',r.id,{id:r.id,operationId:r.operation_id,targetLaw:opt('target_law'),lawSource:nz(r.law_source),
      lawSourceVersion:opt('law_source_version'),difficulty:opt('difficulty'),ruleVersion:nz(r.rule_version),modifiers:mods,
      resolution:r.resolution,reviewer:nz(r.reviewer),rationale:nz(r.rationale),createdAt:iso(r.created_at)});
  }
  const src=Object.fromEntries(Object.keys(T).map(k=>[k,rows(T[k]).length]));
  const counts=Object.fromEntries(Object.keys(T).map(k=>[k,docs[k].length]));
  const complete=Object.keys(T).every(k=>counts[k]===src[k]);
  return {snapshotId,docs,summary:{
    planValid:missing.length===0&&complete&&Object.values(issues).every(n=>n===0),
    missingRequiredTables:missing.length,sourceCounts:src,stagedCounts:counts,coverageComplete:complete,issues}};
}

export async function loadSpyAgentsPlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildSpyAgentsPlan(tables,snapshotHash);
}

export async function writeSpyAgentsToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Spy agents plan blocked before writes');
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
  const plan=await loadSpyAgentsPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid spy agents plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-spy-stage');
  try{process.stdout.write(JSON.stringify(await writeSpyAgentsToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Spy agents staging blocked. No source data displayed.');process.exitCode=1;});
}
