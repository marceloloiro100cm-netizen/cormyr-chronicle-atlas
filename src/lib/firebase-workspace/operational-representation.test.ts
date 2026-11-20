import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {startRepresentation,stopRepresentation,loadRepresentation}
 from './operational-representation';
import {representationRpc} from './representation-rpc';
import type {Scope} from './service';

const snapshot='a'.repeat(64);
const digest=(x:string)=>createHash('sha256').update(x).digest('hex');
const gm:Scope={uid:'narratorUid',profile:'narrador',playerId:'gmplayer',
 memberHouseIds:[],editHouseIds:[]};
const player={id:'p1',user_id:'playerUid',name:'Jogador Um',
 active:true,require_password_change:false};
const access={userId:'playerUid',profile:'jogador',admin:false,
 active:true,requirePasswordChange:false,playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:['h1']};
function memory(){
 const data=new Map<string,any>([
  ['campaignCloudRuntime/'+snapshot,{status:'active',private:true,
   applicationEnabled:true,sourceSnapshotId:snapshot,
   sourceSnapshotReconciled:true,representationReadApproved:true}],
  ['migrationDomainStage/'+snapshot+'/access/narratorUid',
   {userId:'narratorUid',profile:'narrador',admin:true,
    active:true,requirePasswordChange:false}],
  ['migrationDomainStage/'+snapshot+'/access/playerUid',structuredClone(access)],
  ['migrationDomainStage/'+snapshot+'/houses/'+digest('house:h1'),
   {sourceId:'h1',active:true,season:2}],
 ]);
 const reference=(path:string):any=>({
  path,collection:(key:string)=>collection(path+'/'+key),
 });
 const collection=(path:string):any=>({doc:(key:string)=>reference(path+'/'+key)});
 const db={
  collection,
  runTransaction:async <T,>(callback:(tx:any)=>Promise<T>):Promise<T>=>{
   const changes=new Map<string,any|null>();
   const tx={
    get:async(ref:any)=>({exists:data.has(ref.path),
     data:()=>data.get(ref.path)}),
    set:(ref:any,value:any)=>changes.set(ref.path,structuredClone(value)),
    create:(ref:any,value:any)=>{
     if(data.has(ref.path))throw Error('duplicate');
     changes.set(ref.path,structuredClone(value));
    },
    delete:(ref:any)=>changes.set(ref.path,null),
   };
   const result=await callback(tx);
   for(const [key,value] of changes){
    if(value===null)data.delete(key);else data.set(key,value);
   }
   return result;
  },
 };
 return {db,data};
}
const previous=process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED'];
beforeEach(()=>{process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']='true';});
afterEach(()=>{if(previous===undefined)delete process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED'];
 else process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']=previous;});

describe('Item 8, representação sem troca de credenciais',()=>{
 it('inicia, limita a 30 min, audita UID real e encerra',async()=>{
  const {db,data}=memory(),ctx={db,snapshotId:snapshot,actor:gm,players:[player]};
  const started=await startRepresentation(ctx,'p1');
  expect(started.alreadyActive).toBe(false);
  expect(Date.parse(started.expiresAt)-Date.now()).toBeGreaterThan(29*60_000);
  const read=await loadRepresentation(ctx);
  expect(read.scope).toMatchObject({uid:'playerUid',
   playerId:'p1',memberHouseIds:['h1'],editHouseIds:['h1']});
  expect(read.session.actorUid).toBe('narratorUid');
  const audits=[...data.values()].filter(x=>x?.action==='representation_start');
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
   realActorUid:'narratorUid',representedUid:'playerUid'});
  expect(await stopRepresentation(ctx)).toEqual({stopped:true});
  await expect(loadRepresentation(ctx)).rejects.toMatchObject({
   code:'representation_expired'});
  expect([...data.values()].filter(x=>x?.action==='representation_stop'))
   .toHaveLength(1);
 });
 it('substitui sessão expirada, mas nunca troca jogador em sessão ativa',async()=>{
  const m=memory(),other={id:'p2',user_id:'playerTwoUid',
   name:'Jogador Dois',active:true,require_password_change:false};
  m.data.set('migrationDomainStage/'+snapshot+'/access/playerTwoUid',
   {...access,userId:'playerTwoUid',playerId:'p2'});
  const ctx={db:m.db,snapshotId:snapshot,actor:gm,players:[player,other]};
  await startRepresentation(ctx,'p1');
  await expect(startRepresentation(ctx,'p2')).rejects.toMatchObject({
   code:'representation_already_active',status:409});
  const sessionPath='campaignCloudRuntime/'+snapshot+'/representationSessions/'+gm.uid;
  const old=m.data.get(sessionPath);
  m.data.set(sessionPath,{...old,expiresAt:'2020-01-01T00:00:00.000Z'});
  const replaced=await startRepresentation(ctx,'p2');
  expect(replaced.alreadyActive).toBe(false);
  const current=await loadRepresentation(ctx);
  expect(current.scope.uid).toBe('playerTwoUid');
  expect(current.session.nonce).not.toBe(old.nonce);
  expect([...m.data.values()].filter(x=>x?.action==='representation_start'))
   .toHaveLength(2);
 });
 it('recusa metadados corrompidos antes de reutilizar sessão',async()=>{
  const m=memory(),ctx={db:m.db,snapshotId:snapshot,actor:gm,players:[player]};
  await startRepresentation(ctx,'p1');
  const key='campaignCloudRuntime/'+snapshot+'/representationSessions/'+gm.uid;
  m.data.set(key,{...m.data.get(key),sourceSnapshotId:'outro-snapshot'});
  await expect(startRepresentation(ctx,'p1')).rejects.toMatchObject({
   code:'representation_corrupted',status:503});
 });
 it('recusa jogador alheio, narrador falso, conta desativada e troca de Casa',async()=>{
  const m=memory(),ctx={db:m.db,snapshotId:snapshot,actor:gm,players:[player]};
  await expect(startRepresentation({...ctx,actor:{...gm,profile:'jogador'}},
   'p1')).rejects.toMatchObject({code:'representation_denied'});
  await expect(startRepresentation({...ctx,players:[{...player,user_id:'different'}]},
   'p1')).rejects.toMatchObject({code:'representation_player_inactive'});
  await startRepresentation(ctx,'p1');
  m.data.set('migrationDomainStage/'+snapshot+'/access/playerUid',
   {...access,active:false});
  await expect(loadRepresentation(ctx)).rejects.toMatchObject({
   code:'representation_player_inactive'});
  m.data.set('migrationDomainStage/'+snapshot+'/access/playerUid',
   {...access,memberHouseIds:['h2'],editHouseIds:['h2']});
  await expect(loadRepresentation(ctx)).rejects.toMatchObject({
   code:'representation_house_invalid'});
 });
 it('não retorna documentos do Narrador ou de outra Casa',async()=>{
  const m=memory(),ctx={db:m.db,snapshotId:snapshot,actor:gm,players:[player]};
  await startRepresentation(ctx,'p1');
  const output=await representationRpc({
   ...ctx,token:'firebase-narrator-token',
   name:'campaign_representation_action',args:{p_action:'read',p_args:{}},
   players:async()=>[player],
   rows:async name=>name==='campaign_records'?[
    {id:'own',house_id:'h1',visibility:'house',title:'Próprio',content:'texto'},
    {id:'rival',house_id:'h2',visibility:'house',title:'Rival',content:'segredo rival'},
    {id:'gm',house_id:'h1',visibility:'gm',title:'Narrador',content:'segredo mestre'},
   ]:name==='campaign_houses'?[
    {id:'h1',active:true,season:2,name:'Casa Um'},
    {id:'h2',active:true,season:2,name:'Casa Rival'},
   ]:[],
   operationalRecords:async()=>[],
   mail:async()=>({letters:[],replies:[],rounds:[{number:3,status:'open'}]}),
   cloudMail:()=>{throw Error('unexpected mail mutation');},
  });
  expect(output.player).toMatchObject({user_id:'playerUid'});
  expect(output.houses.map((x:any)=>x.id)).toEqual(['h1']);
  expect(output.records.map((x:any)=>x.id)).toEqual(['own']);
  expect(JSON.stringify(output)).not.toContain('segredo');
  expect(output.week).toBe(3);
 });
 it('bloqueia gravação sem a aprovação independente dos registros',async()=>{
  const m=memory(),ctx={db:m.db,snapshotId:snapshot,actor:gm,players:[player]};
  await startRepresentation(ctx,'p1');
  delete process.env['CORMYR_FIREBASE_RECORDS_ENABLED'];
  await expect(representationRpc({
   ...ctx,token:'firebase-narrator-token',name:'campaign_representation_action',
   args:{p_action:'save_record',p_args:{id:'22222222-2222-4222-8222-222222222222',
    version:1,title:'Teste',content:'Conteúdo'}},
   players:async()=>[player],rows:async()=>[],operationalRecords:async()=>[],
   mail:async()=>({}),cloudMail:()=>({}),
  })).rejects.toMatchObject({code:'record_write_disabled',status:501});
 });
});
