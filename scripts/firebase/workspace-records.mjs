/**
 * Original campaign_records / record_versions read layer for Firebase Cloud.
 * READ ONLY, immutable workspace archive; no legacy Supabase API calls.
 * Caller MUST obtain viewer scope with Firebase Admin Auth on each request.
 */
import {readWorkspaceTable} from './workspace-import.mjs';

const VALID_ID=/^[^/\u0000-\u001f]{1,128}$/;
const MAX_RECORDS=1000;
const MAX_VERSIONS=5000;
export class WorkspaceRecordError extends Error{
  constructor(code,status){super(code);this.code=code;this.status=status;}
}
const bad=(code='invalid_record_request',status=400)=>{
  throw new WorkspaceRecordError(code,status);
};
const id=v=>typeof v==='string'&&VALID_ID.test(v);
function validateViewer(viewer){
  if(!viewer||!id(viewer.uid)||!['narrador','jogador'].includes(viewer.profile)||
    !Array.isArray(viewer.memberHouseIds)||
    viewer.memberHouseIds.some(x=>!id(x))||
    (viewer.profile==='jogador'&&!id(viewer.playerId)))
    bad('access_denied',403);
}
function validateRecord(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     !id(row.id)||!['gm','house','player'].includes(row.visibility)||
     typeof row.title!=='string'||typeof row.content!=='string'||
     typeof row.kind!=='string'||row.kind.length>80||
     !Number.isSafeInteger(row.version)||row.version<1)
    bad('workspace_record_invalid',503);
}
export function mayReadWorkspaceRecord(viewer,row){
  validateViewer(viewer);
  if(!row||typeof row!=='object'||Array.isArray(row))return false;
  if(viewer.profile==='narrador')return ['gm','house','player'].includes(row.visibility);
  return (row.visibility==='player'&&row.player_id===viewer.playerId)||
    (row.visibility==='house'&&
      viewer.memberHouseIds.includes(row.house_id));
}
function matchesHouse(row,houseId,viewer){
  if(houseId===undefined)return true;
  if(row.house_id===houseId)return true;
  // Original player-only rows have no required House link.
  return row.visibility==='player'&&row.player_id===viewer.playerId&&
    row.house_id==null&&viewer.memberHouseIds.includes(houseId);
}
function validateHouseArg(houseId,viewer){
  if(houseId!==undefined&&(!id(houseId)||viewer.profile==='jogador'&&
     !viewer.memberHouseIds.includes(houseId)))
    bad('access_denied',403);
}
function summary(row){
  const {id,house_id,visibility,kind,title,version,created_at,updated_at,sync_state}=row;
  return {id,house_id:house_id??null,visibility,kind,title,version,
    created_at:created_at??null,updated_at:updated_at??null,
    sync_state:sync_state??null};
}
function order(a,b){
  const whenA=String(a.updated_at??a.created_at??'');
  const whenB=String(b.updated_at??b.created_at??'');
  return whenB.localeCompare(whenA)||a.id.localeCompare(b.id);
}
export function filterWorkspaceRecords(rows,viewer,{houseId,kind}={}){
  validateViewer(viewer);validateHouseArg(houseId,viewer);
  if(kind!==undefined&&(typeof kind!=='string'||!/^[-a-z_]{1,80}$/.test(kind)))
    bad();
  if(!Array.isArray(rows)||rows.length>MAX_RECORDS)bad('workspace_record_invalid',503);
  for(const row of rows)validateRecord(row);
  return rows.filter(row=>mayReadWorkspaceRecord(viewer,row)&&
     matchesHouse(row,houseId,viewer)&&(kind===undefined||row.kind===kind))
    .sort(order);
}
export async function listWorkspaceRecords(db,snapshotId,viewer,input={}){
  validateViewer(viewer);
  const rows=await readWorkspaceTable(db,snapshotId,'campaign_records');
  const visible=filterWorkspaceRecords(rows,viewer,input);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,total:visible.length,items:visible.map(summary)};
}
export async function getWorkspaceRecord(db,snapshotId,viewer,recordId){
  validateViewer(viewer);
  if(!id(recordId))bad();
  const rows=await readWorkspaceTable(db,snapshotId,'campaign_records');
  if(!Array.isArray(rows)||rows.length>MAX_RECORDS)bad('workspace_record_invalid',503);
  const record=rows.find(row=>row.id===recordId);
  if(!record||!mayReadWorkspaceRecord(viewer,record))bad('record_not_found',404);
  validateRecord(record);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,record:{...summary(record),content:record.content,
      player_id:viewer.profile==='narrador'?record.player_id??null:undefined}};
}
export async function listWorkspaceRecordVersions(db,snapshotId,viewer,recordId){
  const result=await getWorkspaceRecord(db,snapshotId,viewer,recordId);
  const rows=await readWorkspaceTable(db,snapshotId,'record_versions');
  if(!Array.isArray(rows)||rows.length>MAX_VERSIONS)
    bad('workspace_record_invalid',503);
  const matching=rows.filter(r=>r.record_id===result.record.id);
  if(matching.some(r=>!Number.isSafeInteger(r.version)||r.version<1||
    r.snapshot===null||typeof r.snapshot!=='object'||Array.isArray(r.snapshot)))
    bad('workspace_record_invalid',503);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,recordId:result.record.id,total:matching.length,
    versions:matching.sort((a,b)=>b.version-a.version).slice(0,40)
      .map(r=>({id:r.id,version:r.version,created_at:r.created_at??null,
        author:r.author??null,snapshot:r.snapshot}))};
}
