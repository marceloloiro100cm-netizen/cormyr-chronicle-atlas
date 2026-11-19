/**
 * Legacy noble_house_sheets read projection, current Firebase House-scoped.
 * No mutations, no economic recalculation, no fake/seed units or holdings.
 */
import {readWorkspaceTable} from './workspace-import.mjs';
const ID=/^[^/\u0000-\u001f]{1,128}$/;
const safe=v=>typeof v==='string'&&ID.test(v);
export class WorkspaceHouseError extends Error{
  constructor(code,status){super(code);this.code=code;this.status=status;}
}
const fail=(code='workspace_house_invalid',status=503)=>{
  throw new WorkspaceHouseError(code,status);
};
function validate(viewer,houseId){
  if(!viewer||!safe(viewer.uid)||!['narrador','jogador'].includes(viewer.profile)||
     !Array.isArray(viewer.memberHouseIds)||
     viewer.memberHouseIds.some(v=>!safe(v)))fail('access_denied',403);
  if(houseId!==undefined&&!safe(houseId))fail('invalid_house',400);
  if(viewer.profile==='jogador'&&houseId!==undefined&&
     !viewer.memberHouseIds.includes(houseId))fail('access_denied',403);
}
const allowed=(viewer,houseId)=>
  viewer.profile==='narrador'||viewer.memberHouseIds.includes(houseId);
function unitView(unit){
  if(!unit||typeof unit!=='object'||Array.isArray(unit)||
     !safe(unit.id)||typeof unit.name!=='string'||unit.name.length>240)
    fail();
  const types=Array.isArray(unit.types)?unit.types:[];
  if(types.length>12||types.some(t=>typeof t!=='string'||t.length>100))
    fail();
  return {id:unit.id,name:unit.name,types,
    training:typeof unit.training==='string'?unit.training:null,
    domainId:typeof unit.domainId==='string'?unit.domainId:null,
    status:typeof unit.situation==='string'?unit.situation:null,
    strength:Number.isFinite(unit.strength)?unit.strength:null,
    casualties:Number.isFinite(unit.casualties)?unit.casualties:null,
    health:Number.isFinite(unit.health)?unit.health:null,
    xp:Number.isFinite(unit.xp)?unit.xp:null,
    destroyed:unit.destroyed===true};
}
function holdingView(item){
  if(!item||typeof item!=='object'||Array.isArray(item)||
     !safe(item.id)||typeof item.name!=='string'||item.name.length>240)
    fail();
  return {id:item.id,name:item.name,
    catalogItem:typeof item.itemId==='string'?item.itemId:null,
    status:typeof item.status==='string'?item.status:null,
    domainId:typeof item.domainId==='string'?item.domainId:null};
}
export function projectWorkspaceHouseSheets(rows,viewer,houseId){
  validate(viewer,houseId);
  if(!Array.isArray(rows)||rows.length>250)fail();
  const seen=new Set(),items=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       !safe(row.house_id)||!Number.isSafeInteger(row.version)||
       row.version<0||seen.has(row.house_id)||
       !row.state||typeof row.state!=='object'||Array.isArray(row.state)||
       row.state.houseId!==row.house_id)fail();
    seen.add(row.house_id);
    const state=row.state;
    if(!Array.isArray(state.units)||!Array.isArray(state.holdings)||
       state.units.length>500||state.holdings.length>500)fail();
    // Fully verify even rows outside this viewer's House: a corrupted source
    // cannot be silently classed as a valid imported original.
    const units=state.units.map(unitView);
    const holdings=state.holdings.map(holdingView);
    if(!allowed(viewer,row.house_id)||
       houseId!==undefined&&houseId!==row.house_id)continue;
    items.push({houseId:row.house_id,version:row.version,
      phase:typeof state.phase==='string'?state.phase:null,
      units,holdings,unitCount:units.length,holdingCount:holdings.length,
      projectCount:Array.isArray(state.projects)?state.projects.length:null,
      courtCount:Array.isArray(state.court)?state.court.length:null,
      domainCount:Array.isArray(state.domains)?state.domains.length:null});
  }
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,total:items.length,
    units:items.reduce((n,h)=>n+h.unitCount,0),
    holdings:items.reduce((n,h)=>n+h.holdingCount,0),
    items:items.sort((a,b)=>a.houseId.localeCompare(b.houseId))};
}
export async function listWorkspaceHouseSheets(db,snapshotId,viewer,
  {houseId}={}){
  validate(viewer,houseId);
  const rows=await readWorkspaceTable(db,snapshotId,'noble_house_sheets');
  return projectWorkspaceHouseSheets(rows,viewer,houseId);
}
