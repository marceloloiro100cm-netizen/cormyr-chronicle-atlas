/**
 * Source-faithful, server-only projections of imported House sheets,
 * military units, properties, projects and immutable ledger.
 * No live write, no legacy Supabase runtime, no synthetic fallback.
 */
import {readWorkspaceTable} from './workspace-import.mjs';

const ID=/^[^/\u0000-\u001f]{1,128}$/;
const RESOURCES=['defense','influence','lands','law','population','power','wealth'];
const MAX_SHEETS=250,MAX_HOUSES=500,MAX_LEDGER=5000;
export class HouseSourceError extends Error{
  constructor(code='house_source_invalid',status=503){
    super(code);this.code=code;this.status=status;
  }
}
const fail=(code='house_source_invalid',status=503)=>{throw new HouseSourceError(code,status);};
const validId=x=>typeof x==='string'&&ID.test(x);
const validObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function checkViewer(viewer,houseId){
  if(!viewer||!validId(viewer.uid)||!['narrador','jogador'].includes(viewer.profile)||
    !Array.isArray(viewer.memberHouseIds)||viewer.memberHouseIds.some(h=>!validId(h))||
    viewer.profile==='jogador'&&!validId(viewer.playerId))
    fail('access_denied',403);
  if(houseId!==undefined&&!validId(houseId))fail('invalid_house',400);
  if(houseId!==undefined&&viewer.profile==='jogador'&&
    !viewer.memberHouseIds.includes(houseId))fail('access_denied',403);
}
const permitted=(viewer,houseId)=>viewer.profile==='narrador'||
  viewer.memberHouseIds.includes(houseId);
const numberOrNull=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
function resources(input){
  if(!validObject(input))return null;
  const ret={};
  for(const key of RESOURCES)
    ret[key]=numberOrNull(input[key]);
  return ret;
}
function assertSource(tables){
  const {campaign_houses:houses,noble_house_sheets:sheets,
    noble_house_ledger:ledger}=tables??{};
  if(!Array.isArray(houses)||!Array.isArray(sheets)||!Array.isArray(ledger)||
    houses.length>MAX_HOUSES||sheets.length>MAX_SHEETS||ledger.length>MAX_LEDGER)
    fail();
  const h=new Map(),s=new Map(),ledgerCounts=new Map();
  for(const house of houses){
    if(!validObject(house)||!validId(house.id)||typeof house.name!=='string'||
      !house.name.trim()||h.has(house.id))fail();
    h.set(house.id,house);
  }
  for(const row of sheets){
    if(!validObject(row)||!validId(row.house_id)||!h.has(row.house_id)||
       s.has(row.house_id)||!Number.isSafeInteger(row.version)||row.version<1||
       !validObject(row.state)||row.state.houseId!==row.house_id||
       row.state.schemaVersion!==1)fail();
    const state=row.state;
    for(const key of ['units','holdings','projects','domains','court']){
      if(!Array.isArray(state[key])||state[key].length>3000)fail();
      for(const item of state[key])
        if(!validObject(item)||!validId(item.id)||typeof item.name!=='string')fail();
    }
    s.set(row.house_id,row);
  }
  for(const entry of ledger){
    if(!validObject(entry)||!validId(entry.id)||
       !validId(entry.house_id)||!h.has(entry.house_id)||
       !Number.isSafeInteger(entry.version)||entry.version<1)fail();
    ledgerCounts.set(entry.house_id,(ledgerCounts.get(entry.house_id)??0)+1);
  }
  return {houses:h,sheets:s,ledgerCounts};
}
function projectSummary(house,row,ledgerCount){
  if(!row)return {houseId:house.id,houseName:house.name,available:false,
    source:'verified-workspace-archive',units:0,holdings:0,projects:0,
    domains:0,ledgerEntries:ledgerCount,version:null,phase:null,
    base:null,permanent:null};
  const state=row.state;
  return {houseId:house.id,houseName:house.name,available:true,
    source:'verified-workspace-archive',units:state.units.length,
    holdings:state.holdings.length,projects:state.projects.length,
    domains:state.domains.length,ledgerEntries:ledgerCount,version:row.version,
    phase:state.phase??null,base:resources(state.base),
    permanent:resources(state.permanent)};
}
const str=x=>typeof x==='string'?x:null;
function projectUnit(unit){
  return {id:unit.id,name:unit.name,types:Array.isArray(unit.types)?
    unit.types.filter(x=>typeof x==='string').slice(0,20):[],
    training:str(unit.training),origin:str(unit.origin),
    strength:numberOrNull(unit.strength),casualties:numberOrNull(unit.casualties),
    health:numberOrNull(unit.health),armor:numberOrNull(unit.armor),
    xp:numberOrNull(unit.xp),situation:str(unit.situation),
    destroyed:unit.destroyed===true,
    equipment:Array.isArray(unit.equipment)?
      unit.equipment.filter(x=>typeof x==='string').slice(0,40):[]};
}
function projectHolding(holding){
  return {id:holding.id,name:holding.name,itemId:str(holding.itemId),
    category:str(holding.category),status:str(holding.status),
    domainId:str(holding.domainId),parentId:str(holding.parentId),
    costs:Array.isArray(holding.costs)?holding.costs.filter(validObject)
      .map(x=>({resource:str(x.resource),amount:numberOrNull(x.amount),
        mode:str(x.mode)})).slice(0,40):[]};
}
const projectProject=p=>({id:p.id,name:p.name,status:str(p.status),
  start:numberOrNull(p.start),duration:numberOrNull(p.duration),
  holdingId:str(p.holdingId)});
const projectDomain=d=>({id:d.id,name:d.name,terrain:str(d.terrain),
  features:Array.isArray(d.features)?d.features.filter(x=>typeof x==='string'):[]});
function projectLedger(rows,houseId){
  return rows.filter(row=>row.house_id===houseId)
    .sort((a,b)=>b.version-a.version)
    .slice(0,100).map(row=>({
      id:row.id,version:row.version,action:str(row.action),
      explanation:str(row.explanation),rule:str(row.rule),
      campaign_month:numberOrNull(row.campaign_month),
      created_at:str(row.created_at),
    }));
}

export function listImportedHouseSheets(tables,viewer){
  checkViewer(viewer);
  const {houses,sheets,ledgerCounts}=assertSource(tables);
  return {readOnly:true,operationalConnected:false,
    source:'verified-workspace-archive',
    items:[...houses.values()].filter(h=>permitted(viewer,h.id))
      .map(h=>projectSummary(h,sheets.get(h.id),ledgerCounts.get(h.id)??0))
      .sort((a,b)=>a.houseName.localeCompare(b.houseName))};
}
export function getImportedHouseSheet(tables,viewer,houseId){
  checkViewer(viewer,houseId);
  const {houses,sheets,ledgerCounts}=assertSource(tables);
  const house=houses.get(houseId),row=sheets.get(houseId);
  if(!house||!row||!permitted(viewer,houseId))fail('house_source_unavailable',404);
  const state=row.state;
  return {readOnly:true,operationalConnected:false,
    source:'verified-workspace-archive',
    summary:projectSummary(house,row,ledgerCounts.get(houseId)??0),
    units:state.units.map(projectUnit),holdings:state.holdings.map(projectHolding),
    projects:state.projects.map(projectProject),
    domains:state.domains.map(projectDomain),
    ledger:projectLedger(tables.noble_house_ledger,houseId)};
}
export async function loadImportedHouseSheets(db,snapshotId,viewer,houseId){
  // Validate requested House BEFORE any private archive access.
  checkViewer(viewer,houseId);
  if(!/^[a-f0-9]{64}$/.test(snapshotId))fail();
  const names=['campaign_houses','noble_house_sheets','noble_house_ledger'];
  const rows=await Promise.all(names.map(name=>readWorkspaceTable(db,snapshotId,name)));
  const tables=Object.fromEntries(names.map((name,i)=>[name,rows[i]]));
  return houseId===undefined?listImportedHouseSheets(tables,viewer)
    :getImportedHouseSheet(tables,viewer,houseId);
}
