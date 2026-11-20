import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import {commitSpyNarrator} from './operational-spy-narrator';
import {spyDigest} from './operational-spy-context';
import {readDossiers} from '../../../scripts/firebase/spy-intel-core.mjs';
import type {Scope} from './service';
const snapshot='a'.repeat(64),uid='narrator';
const agentId='11111111-1111-4111-8111-111111111111';
const operationId='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
const scope:Scope={uid,profile:'narrador',playerId:null,memberHouseIds:[],editHouseIds:[]};
const calendar={year:1522,month:0,day:20,version:4};
const source={
 assets:[{id:agentId,ownerHouseId:'h1',codename:'Corvo',status:'operating',
  version:1,missionSuccesses:0,portraitId:null,
  currentLocationId:'reg1',createdAt:'2026-11-15T00:00:00Z'}],
 operations:[{id:operationId,ownerHouseId:'h1',assetId:agentId,
  targetType:'house',targetId:'h2',missionKind:'house_recon',
  requestedFields:['house_resources'],operationKey:key,status:'operating',
  version:1,sourceCalendarVersion:2,createdAt:'2026-11-15T00:00:00Z'}],
 timeline:[{operationId,agentId,ownerHouseId:'h1',
  departureKey:'1522-01-01',arrivalKey:'1522-01-01',
  investigationEndKey:'1522-01-11',destinationRegion:'crownlands',
  originRegion:'crownlands',destinationLocationId:'reg1',
  travelDays:0,travelRounds:0,route:[],createdAt:'2026-11-15T00:00:00Z'}],
 catalog:[{id:'h1',name:'Casa Origem',region:'crownlands',
   classification:'noble',publicReviewed:true},
  {id:'h2',name:'Casa Alvo',region:'crownlands',
   classification:'noble',publicReviewed:true}],
 history:[],upgrades:[],removals:[],segments:[],events:[],decisions:[],
 dossiers:[],findings:[],awards:[],intelEvents:[],adminAudit:[],
 locations:[],nobleStats:[],
};
function memory(){
 const data=new Map<string,any>([['campaignCloudRuntime/'+snapshot,{
  status:'active',private:true,applicationEnabled:true,
  sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
  spyReadApproved:true,spyWriteApproved:true,calendarVersion:4,
 }]]);
 const ref=(path:string):any=>({path,collection:(name:string)=>col(path+'/'+name)});
 const col=(path:string):any=>({doc:(id:string)=>ref(path+'/'+id),
  limit:(n:number)=>({query:path,max:n})});
 const db={collection:col,runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
  const writes=new Map<string,any>();
  const tx={
   get:async(r:any)=>{
    if(r.query)return {docs:[...data.entries()].filter(([path])=>
      path.startsWith(r.query+'/')&&!path.slice(r.query.length+1).includes('/'))
     .slice(0,r.max).map(([path,value])=>({id:path.split('/').at(-1),
      data:()=>value}))};
    return {exists:data.has(r.path),data:()=>data.get(r.path)};
   },
   set:(r:any,v:any)=>writes.set(r.path,structuredClone(v)),
  };
  const result=await fn(tx);
  for(const [path,value] of writes)data.set(path,value);
  return result;
 }};
 return {db,data};
}
const saved=process.env['CORMYR_FIREBASE_SPY_ENABLED'];
beforeEach(()=>{process.env['CORMYR_FIREBASE_SPY_ENABLED']='true';});
afterEach(()=>{if(saved===undefined)delete process.env['CORMYR_FIREBASE_SPY_ENABLED'];
 else process.env['CORMYR_FIREBASE_SPY_ENABLED']=saved;});
describe('7c: jornadas, decisão e sigilo dos dossiês',()=>{
 it('avança pelo HUB e resolve uma missão sem alterar histórico importado',async()=>{
  const m=memory(),unchanged=structuredClone(source);
  const base={db:m.db,snapshotId:snapshot,scope,source,calendar,archivedSheets:[]};
  const advanced=await commitSpyNarrator({...base,name:'spy_advance_active_missions',
   args:{p_calendar_version:4,p_request_key:key}});
  expect(advanced).toMatchObject({advanced:1,calendarVersion:4});
  const op=m.data.get('campaignCloudRuntime/'+snapshot+'/spyOperations/'+
   spyDigest('operation:'+operationId)).payload;
  const agent=m.data.get('campaignCloudRuntime/'+snapshot+'/spyAgents/'+
   spyDigest('agent:'+agentId)).payload;
  expect(op.status).toBe('pending_narrator_review');
  expect(agent.status).toBe('pending_review');
  const result=await commitSpyNarrator({...base,name:'spy_resolve_agent_mission',
   args:{p_operation:operationId,p_roll:18,p_modifier:0,p_discovered:false,
    p_guard_override:false,p_prison_override:false,
    p_expected_version:2,p_request_key:'44444444-4444-4444-8444-444444444444',
    p_reason:'Missão concluída pela regra oficial'}});
  expect(result).toMatchObject({operationId,agentId,outcome:'mission_success',
   intelligenceStatus:'waiting_catalog'});
  expect(source).toEqual(unchanged);
  expect([...m.data.keys()].filter(k=>k.includes('spyNarratorAudits/'))).toHaveLength(2);
  const dossier=[...m.data.keys()].find(k=>k.includes('spyDossiers/'));
  expect(dossier).toBeTruthy();
  const record=m.data.get(dossier!)?.payload;
  expect(record.ownerHouseId).toBe('h1');
  const byOther=readDossiers({
   actor:{uid:'u3',role:'jogador',memberHouseIds:new Set(['h3']),
    editHouseIds:new Set(),playerId:'p3'},houseId:'h3',
   dossiers:[record],findings:[],events:[],audit:[],catalog:source.catalog,
  });
  expect(byOther).toEqual([]);
 });
 it('impede que jogador ou editor executem comandos do Narrador',async()=>{
  const m=memory();
  const base={db:m.db,snapshotId:snapshot,source,calendar,archivedSheets:[],
   name:'spy_advance_active_missions',
   args:{p_calendar_version:4,p_request_key:key}};
  for(const profile of ['jogador','editor'] as const){
   await expect(commitSpyNarrator({...base,scope:{...scope,profile}}))
    .rejects.toMatchObject({code:'access_denied',status:403});
  }
  expect([...m.data.keys()].filter(k=>k.includes('spyNarratorAudits/'))).toHaveLength(0);
 });
 it('homologa apenas ligações pertencentes ao grafo oficial',async()=>{
  const m=memory(),base={db:m.db,snapshotId:snapshot,scope,source,calendar,
   archivedSheets:[],name:'spy_review_region_link',
   args:{p_id:operationId,p_request_key:key,p_from:'crownlands',
    p_to:'shieldmark',p_passage:'land_neighbor',p_bidirectional:true,
    p_approved:true,p_blocked:false,p_visibility:'public',
    p_source:'Catálogo oficial de rotas',p_reason:'Conferência oficial de adjacência'}};
  expect(await commitSpyNarrator(base)).toMatchObject({approved:true,routeId:operationId});
  await expect(commitSpyNarrator({...base,args:{...base.args,
   p_request_key:'55555555-5555-4555-8555-555555555555',
   p_to:'volkumburgh'}})).rejects.toMatchObject({
    code:'spy_route_not_in_official_graph'});
 });
});
