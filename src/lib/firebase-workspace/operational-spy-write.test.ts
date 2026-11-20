import {createHash} from 'node:crypto';
import {describe,it,expect,afterEach,beforeEach} from 'vitest';
import {commitSpyAction} from './operational-spy-write';
import type {Scope} from './service';
const snapshot='a'.repeat(64);
const id1='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
const scope:Scope={uid:'player-1',profile:'jogador',playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:['h1']};
const meta={status:'active',private:true,applicationEnabled:true,
 sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
 spyReadApproved:true,spyWriteApproved:true,calendarVersion:1};
const agent=(id:string,house='h1')=>({id,ownerHouseId:house,codename:'Codinome',
 version:1,status:'available',missionSuccesses:0,portraitId:null,
 createdAt:'2026-11-15T00:00:00Z'});
const source=(assets:any[]=[agent(id1)])=>({
 assets,upgrades:[],removals:[],history:[],operations:[],segments:[],
 portraits:[{id:'portrait-1',active:true,sortOrder:0,label:'Retrato'}],
 locations:[],catalog:[],
});
function memoryDb(){
 const data=new Map<string,any>([['campaignCloudRuntime/'+snapshot,meta]]);
 data.set('migrationDomainStage/'+snapshot+'/access/'+scope.uid,{
  userId:scope.uid,profile:scope.profile,admin:scope.profile==='narrador',
  active:true,requirePasswordChange:false,playerId:scope.playerId,
  memberHouseIds:scope.memberHouseIds,editHouseIds:scope.editHouseIds,
 });
 for(const id of scope.memberHouseIds)data.set(
  'migrationDomainStage/'+snapshot+'/houses/'+createHash('sha256').update('house:'+id).digest('hex'),
  {sourceId:id,active:true,season:2});
 const col=(path:string):any=>({
  path,limit:(_max:number)=>({query:path}),
  doc:(id:string)=>ref(path+'/'+id),
 });
 const ref=(path:string):any=>({path,collection:(name:string)=>col(path+'/'+name)});
 return {data,db:{collection:col,
  runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
   const batch=new Map<string,any>();
   const tx={
    get:async(r:any)=>{
     if(r.query)return {docs:[...data.entries()].filter(([k])=>k.startsWith(r.query+'/'))
      .map(([path,value])=>({id:path.split('/').at(-1),data:()=>value}))};
     return {exists:data.has(r.path),data:()=>data.get(r.path)};
    },
    set:(r:any,v:any)=>batch.set(r.path,structuredClone(v)),
    delete:(r:any)=>batch.set(r.path,null),
   };
   const result=await fn(tx);
   for(const [path,value] of batch)if(value===null)data.delete(path);else data.set(path,value);
   return result;
  },
 }};
}
const original=process.env['CORMYR_FIREBASE_SPY_ENABLED'];
beforeEach(()=>{process.env['CORMYR_FIREBASE_SPY_ENABLED']='true';});
afterEach(()=>{if(original===undefined)delete process.env['CORMYR_FIREBASE_SPY_ENABLED'];
 else process.env['CORMYR_FIREBASE_SPY_ENABLED']=original;});
const calendar={year:1522,month:0,day:1,version:1};
describe('item 7a, proteção da espionagem operacional',()=>{
 it('renomeia com versão, grava auditoria e retorna duplicação sem repetir efeitos',async()=>{
  const m=memoryDb(),imported=source();
  const args={p_house:'h1',p_agent:id1,p_name:'O Corvo',
   p_expected_version:1,p_request_key:key};
  const input={db:m.db,snapshotId:snapshot,scope,name:'spy_rename_agent',
   args,source:imported,calendar};
  const first=await commitSpyAction(input);
  expect(first).toEqual({id:id1,codename:'O Corvo',version:2});
  expect(imported.assets[0].codename).toBe('Codinome');
  const retry=await commitSpyAction(input);
  expect(retry).toMatchObject({...first,alreadyApplied:true});
  expect([...m.data.keys()].filter(k=>k.includes('spyAgentAudits/'))).toHaveLength(1);
  await expect(commitSpyAction({...input,args:{...args,p_name:'Outro',
   p_request_key:'44444444-4444-4444-8444-444444444444'}}))
   .rejects.toMatchObject({code:'spy_version_conflict',status:409});
 });
 it('reserva retrato sem permitir reutilização por outro agente',async()=>{
  const m=memoryDb(),imported=source([agent(id1),agent(id2)]);
  const first=await commitSpyAction({db:m.db,snapshotId:snapshot,scope,
   name:'spy_assign_agent_portrait',args:{
    p_house:'h1',p_agent:id1,p_portrait:'portrait-1',p_expected_version:1,
   },source:imported,calendar});
  expect(first.agentId).toBe(id1);
  await expect(commitSpyAction({db:m.db,snapshotId:snapshot,scope,
   name:'spy_assign_agent_portrait',args:{
    p_house:'h1',p_agent:id2,p_portrait:'portrait-1',p_expected_version:1,
   },source:imported,calendar})).rejects.toMatchObject({
    code:'spy_portrait_conflict',status:409,
   });
 });
 it('nega escrita na Casa alheia, perfil editorial e runtime sem aceite',async()=>{
  const m=memoryDb(),args={p_house:'h2',p_agent:id1,p_name:'Fraude',
   p_expected_version:1,p_request_key:key};
  await expect(commitSpyAction({db:m.db,snapshotId:snapshot,scope,
   name:'spy_rename_agent',args,source:source(),calendar})).rejects.toMatchObject({
   code:'access_denied',status:403,
  });
  m.data.set('campaignCloudRuntime/'+snapshot,{...meta,spyWriteApproved:false});
  await expect(commitSpyAction({db:m.db,snapshotId:snapshot,scope,
   name:'spy_rename_agent',args:{...args,p_house:'h1'},
   source:source(),calendar})).rejects.toMatchObject({
   code:'spy_runtime_not_approved',status:503,
  });
 });
 it('revogação operacional prevalece sobre permissão importada e recibos',async()=>{
  const m=memoryDb(),input={db:m.db,snapshotId:snapshot,scope,
   name:'spy_rename_agent',source:source(),calendar,args:{
    p_house:'h1',p_agent:id1,p_name:'Corvo',p_expected_version:1,p_request_key:key,
   }};
  await commitSpyAction(input);
  m.data.set('campaignCloudRuntime/'+snapshot+'/accountAccess/'+scope.uid,{
   userId:scope.uid,profile:'jogador',admin:false,active:false,
   requirePasswordChange:false,playerId:scope.playerId,
   memberHouseIds:['h1'],editHouseIds:['h1'],attrHouseIds:[],
  });
  const before=structuredClone([...m.data]);
  await expect(commitSpyAction(input))
   .rejects.toMatchObject({code:'access_denied',status:403});
  await expect(commitSpyAction({...input,args:{...input.args,
   p_expected_version:2,p_request_key:id2}}))
   .rejects.toMatchObject({code:'access_denied',status:403});
  expect([...m.data]).toEqual(before);
 });
});
