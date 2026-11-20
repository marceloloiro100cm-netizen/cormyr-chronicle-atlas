import {createHash} from 'node:crypto';
import {describe,it,expect,afterEach,beforeEach} from 'vitest';
import {commitSpyMission,previewSpyMission} from './operational-spy-missions';
import {spyDigest} from './operational-spy-context';
import type {Scope} from './service';
const snapshot='a'.repeat(64);
const agentId='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
const cancelKey='33333333-3333-4333-8333-333333333333';
const scope:Scope={uid:'u1',profile:'jogador',playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:['h1']};
const calendar={year:1522,month:0,day:1,version:7};
const agent={id:agentId,ownerHouseId:'h1',status:'available',
 codename:'Águia',kind:'network_cell',missionSuccesses:0,version:1,
 currentLocationId:'domain-1',sourceHoldingId:'net1',portraitId:null,
 createdAt:'2026-11-01T00:00:00Z'};
const archived={
 assets:[agent],history:[],upgrades:[],removals:[],operations:[],timeline:[],
 events:[],decisions:[],dossiers:[],findings:[],awards:[],intelEvents:[],adminAudit:[],
 locations:[
  {id:'domain-1',kind:'domain',refId:'dom1',regionId:'crownlands',approved:true},
  {id:'region-1',kind:'region',refId:'crownlands',regionId:null,approved:true},
 ],
 catalog:[{id:'h2',name:'Casa Rivais',region:'crownlands',
  classification:'noble',publicReviewed:true}],
 nobleStats:[],portraits:[],
};
function memory(){
 const data=new Map<string,any>([['campaignCloudRuntime/'+snapshot,{
  status:'active',private:true,applicationEnabled:true,
  sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
  spyReadApproved:true,spyWriteApproved:true,calendarVersion:calendar.version,
 }]]);
 data.set('migrationDomainStage/'+snapshot+'/access/'+scope.uid,{
  userId:scope.uid,profile:scope.profile,admin:scope.profile==='narrador',
  active:true,requirePasswordChange:false,playerId:scope.playerId,
  memberHouseIds:scope.memberHouseIds,editHouseIds:scope.editHouseIds,
 });
 for(const id of scope.memberHouseIds)data.set(
  'migrationDomainStage/'+snapshot+'/houses/'+createHash('sha256').update('house:'+id).digest('hex'),
  {sourceId:id,active:true,season:2});
 const ref=(path:string):any=>({path,collection:(name:string)=>collection(path+'/'+name)});
 const collection=(path:string):any=>({
  doc:(id:string)=>ref(path+'/'+id),
  limit:(_n:number)=>({query:path}),
 });
 const db={collection,runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
  const writes=new Map<string,any>();
  const tx={
   get:async(r:any)=>{
    if(r.query)return {docs:[...data.entries()].filter(([path])=>
     path.startsWith(r.query+'/')&&path.slice(r.query.length+1).indexOf('/')<0)
     .map(([path,value])=>({id:path.split('/').at(-1),data:()=>value}))};
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
describe('7b, missões de espionagem operacional',()=>{
 it('envia, preserva acervo, aparece na fila e cancela com auditoria',async()=>{
  const m=memory(),source=structuredClone(archived);
  const args={p_house:'h1',p_agent:agentId,p_target:'h2',
   p_destination:'crownlands',p_objective:'house_resources',
   p_expected_agent_version:1,p_expected_calendar_version:7,p_request_key:key};
  const input={db:m.db,snapshotId:snapshot,scope,
   name:'spy_submit_house_mission',args,source,calendar};
  const first=await commitSpyMission(input);
  expect(first).toMatchObject({agentId,targetHouseId:'h2',status:'operating',
   objective:'house_resources',alreadyApplied:false,travelDays:0});
  expect(archived.operations).toHaveLength(0);
  const audit=[...m.data.keys()].filter(k=>k.includes('spyMissionAudits/'));
  expect(audit).toHaveLength(1);
  const duplicate=await commitSpyMission(input);
  expect(duplicate).toMatchObject({operationId:first.operationId,alreadyApplied:true});
  const currentOp=m.data.get('campaignCloudRuntime/'+snapshot+'/spyOperations/'+
   spyDigest('operation:'+first.operationId));
  expect(currentOp.payload.ownerHouseId).toBe('h1');
  const cancel=await commitSpyMission({...input,name:'spy_cancel_house_mission',
   args:{p_house:'h1',p_operation:first.operationId,
    p_expected_version:1,p_request_key:cancelKey}});
  expect(cancel).toMatchObject({operationId:first.operationId,
   status:'cancelled',alreadyApplied:false});
  expect([...m.data.keys()].filter(k=>k.includes('spyMissionAudits/'))).toHaveLength(2);
 });
 it('nunca revela ficha privada do alvo na prévia',()=>{
  const out=previewSpyMission({scope,houseId:'h1',agentId,targetHouseId:'h2',
   data:archived});
  expect(out.source).toBe('regional_fallback');
  expect(out.targetHouseId).toBe('h2');
  expect(out.testDice).toBe(3);
  expect(JSON.stringify(out)).not.toContain('sourceHoldingId');
  expect(()=>previewSpyMission({scope:{...scope,memberHouseIds:[]},
   houseId:'h1',agentId,targetHouseId:'h2',data:archived}))
   .toThrow('access_denied');
 });
 it('bloqueia Casa adversária, destino falso e alvo sem homologação',async()=>{
  const m=memory();
  const input={db:m.db,snapshotId:snapshot,scope,
   name:'spy_submit_house_mission',source:archived,calendar,
   args:{p_house:'h1',p_agent:agentId,p_target:'h2',
    p_destination:'helmlands',p_objective:'house_resources',
    p_expected_agent_version:1,p_expected_calendar_version:7,p_request_key:key}};
  await expect(commitSpyMission(input)).rejects.toMatchObject({
   code:'spy_operation_invalid'});
  await expect(commitSpyMission({...input,args:{...input.args,p_house:'h3'}}))
   .rejects.toMatchObject({code:'access_denied'});
  await expect(commitSpyMission({...input,source:{...archived,catalog:[]}}))
   .rejects.toMatchObject({code:'spy_target_not_reviewed'});
 });
 it('nega envio e cancelamento se a Casa foi desativada depois do login',async()=>{
  const m=memory(),input={db:m.db,snapshotId:snapshot,scope,
   name:'spy_submit_house_mission',source:archived,calendar,args:{
    p_house:'h1',p_agent:agentId,p_target:'h2',p_destination:'crownlands',
    p_objective:'house_resources',p_expected_agent_version:1,
    p_expected_calendar_version:7,p_request_key:key,
   }};
  const first=await commitSpyMission(input);
  m.data.set('migrationDomainStage/'+snapshot+'/houses/'+spyDigest('house:h1'),
   {sourceId:'h1',active:false,season:2});
  const before=structuredClone([...m.data]);
  await expect(commitSpyMission(input))
   .rejects.toMatchObject({code:'access_denied',status:403});
  await expect(commitSpyMission({...input,name:'spy_cancel_house_mission',
   args:{p_house:'h1',p_operation:first.operationId,p_expected_version:1,
    p_request_key:cancelKey}}))
   .rejects.toMatchObject({code:'access_denied',status:403});
  expect([...m.data]).toEqual(before);
 });
});
