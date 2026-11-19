/**
 * Original Firebase-imported spy assets, missions and timeline.
 * Read-only and scoped at every server call to the current Firebase Auth role.
 * Never exposes other Houses' secret agents or narratorial intelligence.
 */
import {readWorkspaceTable} from './workspace-import.mjs';

const SAFE_ID=/^[^/\u0000-\u001f]{1,128}$/;
const fail=(code='spy_archive_invalid',status=503)=>{
  throw new WorkspaceSpyError(code,status);
};
export class WorkspaceSpyError extends Error {
  constructor(code,status){super(code);this.code=code;this.status=status;}
}
const id=value=>typeof value==='string'&&SAFE_ID.test(value);
function authorize(viewer,houseId){
  if(!viewer||!id(viewer.uid)||
     !['narrador','jogador'].includes(viewer.profile)||
     !Array.isArray(viewer.memberHouseIds)||
     viewer.memberHouseIds.some(h=>!id(h)))
    fail('access_denied',403);
  if(houseId!==undefined&&!id(houseId))
    fail('invalid_house',400);
  if(viewer.profile==='jogador'&&
     (houseId!==undefined&&!viewer.memberHouseIds.includes(houseId)))
    fail('access_denied',403);
}
const visible=(viewer,owner,requested)=>
  id(owner)&&
  (requested===undefined||owner===requested)&&
  (viewer.profile==='narrador'||viewer.memberHouseIds.includes(owner));
const MAX_ASSETS=1000,MAX_OPERATIONS=1000,MAX_TIMELINES=1000;
const MAX_HISTORY=5000,MAX_REMOVALS=5000;
function validateAssets(items){
  if(!Array.isArray(items)||items.length>MAX_ASSETS)fail();
  const seen=new Set();
  for(const a of items){
    if(!a||typeof a!=='object'||Array.isArray(a)||
      !id(a.id)||!id(a.owner_house_id)||seen.has(a.id)||
      typeof a.codename!=='string'||!a.codename.trim()||
      typeof a.status!=='string'||!a.status.trim()||
      !Number.isSafeInteger(a.mission_successes)||a.mission_successes<0||
      !Number.isSafeInteger(a.version)||a.version<1)fail();
    seen.add(a.id);
  }
  return new Map(items.map(a=>[a.id,a]));
}
function validateOperations(items,assets){
  if(!Array.isArray(items)||items.length>MAX_OPERATIONS)fail();
  const seen=new Set();
  for(const op of items){
    if(!op||typeof op!=='object'||Array.isArray(op)||
       !id(op.id)||!id(op.asset_id)||!id(op.owner_house_id)||
       seen.has(op.id)||typeof op.status!=='string'||
       typeof op.mission_kind!=='string'||typeof op.target_type!=='string'||
       typeof op.target_id!=='string')fail();
    // The immutable source must not allow a mission to attach to an agent
    // owned by a different House, even if a forged row matches a query.
    const asset=assets.get(op.asset_id);
    if(!asset||asset.owner_house_id!==op.owner_house_id)
      fail('spy_archive_relationship_inconsistent',503);
    seen.add(op.id);
  }
  return new Map(items.map(op=>[op.id,op]));
}
function validateTimeline(items,operations,assets){
  if(!Array.isArray(items)||items.length>MAX_TIMELINES)fail();
  const seen=new Set();
  for(const row of items){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       !id(row.operation_id)||!id(row.agent_id)||
       !id(row.owner_house_id)||seen.has(row.operation_id))
      fail();
    const op=operations.get(row.operation_id),asset=assets.get(row.agent_id);
    if(!op||!asset||op.asset_id!==row.agent_id||
       op.owner_house_id!==row.owner_house_id)
      fail('spy_archive_relationship_inconsistent',503);
    seen.add(row.operation_id);
  }
  return new Map(items.map(row=>[row.operation_id,row]));
}
function validateHistory(rows,assets,operations){
  if(!Array.isArray(rows)||rows.length>MAX_HISTORY)fail();
  const seen=new Set();
  for(const h of rows){
    if(!h||typeof h!=='object'||Array.isArray(h)||
       !id(h.id)||!id(h.agent_id)||!id(h.owner_house_id)||
       seen.has(h.id)||!assets.has(h.agent_id)||
       assets.get(h.agent_id).owner_house_id!==h.owner_house_id||
       h.operation_id!=null&&
         (!operations.has(h.operation_id)||
          operations.get(h.operation_id).owner_house_id!==h.owner_house_id))
      fail('spy_archive_relationship_inconsistent',503);
    seen.add(h.id);
  }
}
function validateRemovals(rows,assets){
  if(!Array.isArray(rows)||rows.length>MAX_REMOVALS)fail();
  const seen=new Set();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       !id(row.agent_id)||!id(row.owner_house_id)||
       seen.has(row.agent_id)||!assets.has(row.agent_id)||
       assets.get(row.agent_id).owner_house_id!==row.owner_house_id)
      fail('spy_archive_relationship_inconsistent',503);
    seen.add(row.agent_id);
  }
}
const agentSummary=a=>({
  id:a.id,owner_house_id:a.owner_house_id,codename:a.codename,
  kind:a.kind??null,status:a.status,version:a.version,
  mission_successes:a.mission_successes,
  current_location_id:a.current_location_id??null,
  portrait_id:a.portrait_id??null,
});
const operationSummary=(op,timeline)=>({
  id:op.id,asset_id:op.asset_id,owner_house_id:op.owner_house_id,
  mission_kind:op.mission_kind,target_type:op.target_type,target_id:op.target_id,
  status:op.status,created_at:op.created_at??null,
  source_calendar_version:op.source_calendar_version??null,
  ...(timeline?{timeline:{
    departure_key:timeline.departure_key??null,
    arrival_key:timeline.arrival_key??null,
    investigation_end_key:timeline.investigation_end_key??null,
    origin_region:timeline.origin_region??null,
    destination_region:timeline.destination_region??null,
    travel_rounds:timeline.travel_rounds??null,
    travel_days:timeline.travel_days??null,
  }}:{}),
});
export function projectWorkspaceSpies(tables,viewer,{houseId}={}){
  authorize(viewer,houseId);
  if(!tables||typeof tables!=='object')fail();
  const assets=validateAssets(tables.spy_assets);
  const operations=validateOperations(tables.spy_operations,assets);
  const timeline=validateTimeline(tables.spy_mission_timeline,operations,assets);
  validateHistory(tables.spy_agent_history,assets,operations);
  validateRemovals(tables.spy_agent_removals,assets);
  // Only after ALL source links are validated may the requested subset leave
  // the private server. No admin audit, investigations or enemy dossiers.
  const ownAgents=[...assets.values()].filter(a=>
    visible(viewer,a.owner_house_id,houseId))
    .map(agentSummary).sort((a,b)=>a.codename.localeCompare(b.codename));
  const ownMissions=[...operations.values()].filter(op=>
    visible(viewer,op.owner_house_id,houseId))
    .map(op=>operationSummary(op,timeline.get(op.id)))
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const ownHistory=tables.spy_agent_history.filter(row=>
    visible(viewer,row.owner_house_id,houseId))
    .map(row=>({
      id:row.id,agent_id:row.agent_id,owner_house_id:row.owner_house_id,
      event_type:row.event_type??null,event_date_key:row.event_date_key??null,
      agent_rank:row.agent_rank??null,cunning:row.cunning??null,
      total_successes:row.total_successes??null,
      // Deliberately exclude detail, actor, roll and private target-law data.
    })).sort((a,b)=>String(b.event_date_key).localeCompare(String(a.event_date_key)));
  const ownRemovals=tables.spy_agent_removals.filter(row=>
    visible(viewer,row.owner_house_id,houseId))
    .map(row=>({agent_id:row.agent_id,owner_house_id:row.owner_house_id,
      codename:row.codename??null,removed_at:row.removed_at??null,
      refunded_wealth:row.refunded_wealth??null}));
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,
    agents:{total:ownAgents.length,items:ownAgents},
    missions:{total:ownMissions.length,items:ownMissions},
    history:{total:ownHistory.length,items:ownHistory},
    removals:{total:ownRemovals.length,items:ownRemovals}};
}
export async function readWorkspaceSpies(db,snapshotId,viewer,input={}){
  authorize(viewer,input?.houseId);
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>k!=='houseId'))fail('invalid_spy_request',400);
  const names=['spy_assets','spy_operations','spy_mission_timeline',
    'spy_agent_history','spy_agent_removals'];
  const rows=await Promise.all(names.map(name=>readWorkspaceTable(db,snapshotId,name)));
  return projectWorkspaceSpies(Object.fromEntries(names.map((n,i)=>[n,rows[i]])),
    viewer,input);
}
