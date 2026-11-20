import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createRepresentationService} from './operational-representation';
import type {Scope} from './service';
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const snapshot='a'.repeat(64),root='campaignCloudRuntime/'+snapshot;
const stage='migrationDomainStage/'+snapshot;
const narrator:Scope={uid:'gm',profile:'narrador',playerId:null,
 memberHouseIds:[],editHouseIds:[]};
const access={userId:'u1',profile:'jogador',admin:false,
 playerId:'p1',active:true,requirePasswordChange:false,
 memberHouseIds:['h1'],editHouseIds:['h1']};
const baseline={
 status:'active',private:true,applicationEnabled:true,
 sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
 representationReadApproved:true,representationWriteApproved:true,
};
function memory(){
 const data=new Map<string,any>([
  [root,baseline],
  [stage+'/access/u1',access],
  [stage+'/houses/'+hash('house:h1'),{sourceId:'h1',season:2,active:true}],
 ]);
 const docs=(path:string):any=>({
  path,collection:(name:string)=>coll(path+'/'+name),
  get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
 });
 const coll=(path:string):any=>({
  doc:(id:string)=>docs(path+'/'+id),
 });
 const tx={
  get:async(ref:any)=>ref.get(),
  set:(ref:any,value:any)=>data.set(ref.path,structuredClone(value)),
  create:(ref:any,value:any)=>{
   if(data.has(ref.path))throw Error('already exists');
   data.set(ref.path,structuredClone(value));
  },
  delete:(ref:any)=>data.delete(ref.path),
 };
 const db={collection:coll,runTransaction:async(fn:(tx:any)=>Promise<any>)=>fn(tx)};
 const auth={getUser:async(uid:string)=>({uid,disabled:false})};
 const service=(actor=narrator)=>createRepresentationService({
  db,auth,snapshotId:snapshot,actor,
  importedPlayers:[{id:'p1',user_id:'u1',name:'Jogador'}],
 });
 return {data,service};
}
const previous=process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED'];
beforeEach(()=>{process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']='true';});
afterEach(()=>{
 if(previous===undefined)delete process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED'];
 else process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']=previous;
});
describe('representação Firebase auditada',()=>{
 it('inicia, lê escopo do jogador e encerra sem obter token do jogador',async()=>{
  const m=memory();
  const created=await m.service().start('p1');
  expect(created.playerId).toBe('p1');
  expect(Date.parse(created.expiresAt)).toBeGreaterThan(Date.now());
  const current=await m.service().identity();
  expect(current.scope).toMatchObject({
   uid:'u1',profile:'jogador',memberHouseIds:['h1'],editHouseIds:['h1'],
  });
  expect(current.actorUid).toBe('gm');
  expect((await m.service().stop()).stopped).toBe(true);
  await expect(m.service().identity()).rejects.toMatchObject({
   code:'representation_session_missing',
  });
  const audits=[...m.data.keys()].filter(x=>x.includes('representationAudits/'));
  expect(audits).toHaveLength(2);
 });
 it('recusa conta inativa, Narrador não autenticado, autorização vencida ou revogada',async()=>{
  const m=memory();
  await expect(m.service({...narrator,profile:'editor'}).start('p1'))
   .rejects.toMatchObject({code:'representation_access_denied'});
  m.data.set(stage+'/access/u1',{...access,active:false});
  await expect(m.service().start('p1'))
   .rejects.toMatchObject({code:'representation_access_invalid'});
  m.data.set(stage+'/access/u1',access);
  await m.service().start('p1');
  m.data.set(stage+'/access/u1',{...access,editHouseIds:[]});
  await expect(m.service().identity()).resolves.toMatchObject({
   scope:{editHouseIds:[]},
  });
  const session=m.data.get(root+'/representationSessions/gm');
  session.expiresAt=new Date(Date.now()-1000).toISOString();
  await expect(m.service().identity()).rejects.toMatchObject({
   code:'representation_access_denied'});
 });
 it('bloqueia início sem liberação expressa na raiz ou na configuração',async()=>{
  const m=memory();
  process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']='false';
  await expect(m.service().start('p1')).rejects.toMatchObject({
   code:'representation_disabled'});
  process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']='true';
  m.data.set(root,{...baseline,representationWriteApproved:false});
  await expect(m.service().start('p1')).rejects.toMatchObject({
   code:'representation_not_approved'});
  expect([...m.data.keys()].some(x=>x.includes('representationSessions/'))).toBe(false);
 });
 it('recusa sessões trocadas de identidade ou acesso a Casa inválida',async()=>{
  const m=memory();
  await m.service().start('p1');
  m.data.set(stage+'/houses/'+hash('house:h1'),{sourceId:'h1',season:1,active:true});
  await expect(m.service().identity()).rejects.toMatchObject({
   code:'representation_house_not_approved'});
  m.data.set(stage+'/houses/'+hash('house:h1'),{sourceId:'h1',season:2,active:true});
  const session=m.data.get(root+'/representationSessions/gm');
  session.representedUid='other';
  await expect(m.service().identity()).rejects.toMatchObject({
   code:'representation_player_inactive'});
 });
});
