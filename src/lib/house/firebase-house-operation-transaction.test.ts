import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {newHouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {createFirebaseHouseOperation,HouseOperationError}
 from './firebase-house-operation-transaction';

const snapshot='a'.repeat(64),uid='user-a';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=(s:string)=>s+'/'+snapshot;
const day={year:1522,month:1,day:1,festival:null,version:5};

function fixture(){
 const original=newHouseState('house-a','Ferlin',day.year*12+day.month);
 original.phase='active';original.method='import';
 for(const k of Object.keys(original.base) as (keyof typeof original.base)[])
  original.base[k]=200;
 original.domains=[{id:'11111111-1111-4111-8111-111111111111',
  name:'Vale A',terrain:'plains',features:[],notes:''}];
 const docs=new Map<string,Record<string,unknown>>();
 for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage','migrationNobleHouseStage'])
  docs.set(root(name),{status:'complete',private:true});
 docs.set(root('migrationDomainStage')+'/access/'+uid,{
  userId:uid,active:true,requirePasswordChange:false,
  profile:'jogador',admin:false,playerId:'player-a',
  memberHouseIds:['house-a'],editHouseIds:['house-a'],
 });
 docs.set(root('migrationDomainStage')+'/houses/'+hash('house:house-a'),
  {sourceId:'house-a',active:true,season:2,name:'Casa A'});
 const sheet=root('migrationNobleHouseStage')+'/sheets/'+hash('noble-sheet:house-a');
 docs.set(sheet,{houseId:'house-a',version:3,state:structuredClone(original)});
 docs.set(root('migrationTimeEngineStage')+'/calendar/current',day);
 docs.set(root('campaignCloudRuntime'),{status:'active',private:true,
  sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,applicationEnabled:true,
  houseOpsWriteApproved:true,calendarVersion:5});
 const economyPath=root('campaignCloudRuntime')+
  '/houseEconomies/'+hash('house:house-a');
 const fingerprint=constructionStateHash(original);
 docs.set(economyPath,{houseId:'house-a',status:'active',private:true,
  sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
  sourceSheetVersion:3,sourceStateHash:fingerprint,stateHash:fingerprint,
  version:0,state:structuredClone(original)});
 type Ref={path:string;collection:(name:string)=>{doc:(id:string)=>Ref}};
 const ref=(path:string):Ref=>({
  path,collection:(name:string)=>({doc:(id:string)=>ref(path+'/'+name+'/'+id)}),
 });
 let writes=0;
 const db={collection:(name:string)=>({doc:(id:string)=>ref(name+'/'+id)}),
  runTransaction:async <T,>(fn:(tx:unknown)=>Promise<T>):Promise<T>=>{
   const pending:{type:'create'|'update';path:string;value:Record<string,unknown>}[]=[];
   const tx={
    get:async(r:Ref)=>({exists:docs.has(r.path),
     data:()=>structuredClone(docs.get(r.path))}),
    update:(r:Ref,value:Record<string,unknown>)=>pending.push({type:'update',path:r.path,value}),
    create:(r:Ref,value:Record<string,unknown>)=>{
     if(docs.has(r.path)||pending.some(p=>p.path===r.path))throw Error('duplicate');
     pending.push({type:'create',path:r.path,value});
    },
   };
   const output=await fn(tx);
   for(const p of pending){
    docs.set(p.path,structuredClone(p.type==='update'
      ?{...docs.get(p.path),...p.value}:p.value));
    writes++;
   }
   return output;
  },
 } as unknown as Firestore;
 const auth={verifyIdToken:async(_token:string,revoke:boolean)=>{
  if(revoke!==true)throw Error('revocation-not-checked');
  return {uid};
 },getUser:async(_uid:string)=>({uid,disabled:false})} as unknown as Auth;
 const service=()=>createFirebaseHouseOperation({db,auth,snapshotId:snapshot,
  projectId:'cormyr',enabled:true,env:{},clock:()=> '2026-11-19T20:00:00Z'});
 const input=(other:Record<string,unknown>={})=>({
  houseId:'house-a',version:0,key:'22222222-2222-4222-8222-222222222222',
  action:'domain_edit',args:{id:original.domains[0]!.id,name:'Vale Novo',notes:'Nota'},
  explanation:'Atualização do nome do Vale',...other,
 });
 return {db,auth,docs,economyPath,sheet,service,input,
  writes:()=>writes};
}
async function denied(fn:()=>Promise<unknown>,code:string,status:number){
 try{await fn();throw Error('expected-denial');}
 catch(e){
  expect(e).toBeInstanceOf(HouseOperationError);
  expect((e as HouseOperationError).code).toBe(code);
  expect((e as HouseOperationError).status).toBe(status);
 }
}
describe('Item 4b, transação operacional por Casa',()=>{
 it('falha fechada sem flag, emulador ou ação ainda não pura',async()=>{
  const f=fixture();
  expect(()=>createFirebaseHouseOperation({db:f.db,auth:f.auth,
   snapshotId:snapshot,projectId:'cormyr',enabled:false,env:{}}))
   .toThrow(HouseOperationError);
  expect(()=>createFirebaseHouseOperation({db:f.db,auth:f.auth,
   snapshotId:snapshot,projectId:'cormyr',enabled:true,
   env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}}))
   .toThrow(HouseOperationError);
  await denied(()=>f.service().execute('valid-token-123',
   f.input({action:'purchase'})),'house_item_invalid',400);
  expect(f.writes()).toBe(0);
 });
 it('grava estado e livro-razão, idempotência, snapshot imutável',async()=>{
  const f=fixture(),before=structuredClone(f.docs.get(f.sheet));
  const result=await f.service().execute('valid-token-123',f.input());
  expect(result).toMatchObject({version:1,duplicate:false,
   action:'domain_edit',houseId:'house-a'});
  expect((f.docs.get(f.economyPath)?.['state'] as {domains:{name:string}[]})
   .domains[0]?.name).toBe('Vale Novo');
  expect(f.docs.get(f.sheet)).toEqual(before);
  expect([...f.docs.keys()].filter(k=>k.includes('/houseOperationLedger/'))).toHaveLength(1);
  expect([...f.docs.keys()].filter(k=>k.includes('/houseOperationAudits/'))).toHaveLength(1);
  const repeated=await f.service().execute('valid-token-123',f.input());
  expect(repeated.duplicate).toBe(true);
  expect(f.writes()).toBe(4);
  await denied(()=>f.service().execute('valid-token-123',f.input({
    args:{id:'11111111-1111-4111-8111-111111111111',name:'Ataque',notes:''},
  })),'house_operation_key_conflict',409);
 });
 it('bloqueia versão antiga, revogação e fonte não reconciliada',async()=>{
  const f=fixture();
  await denied(()=>f.service().execute('valid-token-123',f.input({version:7})),
   'house_version_conflict',409);
  f.docs.set(root('migrationDomainStage')+'/access/'+uid,{
   ...f.docs.get(root('migrationDomainStage')+'/access/'+uid),
   editHouseIds:[],
  });
  await denied(()=>f.service().execute('valid-token-123',f.input()),
   'house_access_denied',403);
  f.docs.set(root('migrationDomainStage')+'/access/'+uid,{
   ...f.docs.get(root('migrationDomainStage')+'/access/'+uid),
   editHouseIds:['house-a'],
  });
  f.docs.set(f.economyPath,{...f.docs.get(f.economyPath),
   sourceStateHash:'b'.repeat(64)});
  await denied(()=>f.service().execute('valid-token-123',f.input()),
   'house_economy_unreconciled',503);
  expect(f.writes()).toBe(0);
 });
 it('nega edição em outra Casa e Narrador não autorizado',async()=>{
  const f=fixture();
  await denied(()=>f.service().execute('valid-token-123',f.input({
   houseId:'house-b'
  })),'house_access_denied',403);
  await denied(()=>f.service().execute('valid-token-123',f.input({
   action:'approve'
  })),'house_operation_forbidden',403);
  expect(f.writes()).toBe(0);
 });
});

describe('segunda fatia de operações Firebase',()=>{
 it('recusa pendências inválidas sem criar qualquer lançamento',async()=>{
  const f=fixture();
  await denied(()=>f.service().execute('valid-token-123',f.input({
   action:'clear_pending',args:{indices:[0]},
  })),'house_operation_forbidden',403);
  expect(f.writes()).toBe(0);
 });
 it('preserva saldos ao remover nomeações da Corte',async()=>{
  const f=fixture();
  const base=structuredClone(f.docs.get(f.sheet) as Record<string,unknown>);
  const state=base['state'] as ReturnType<typeof newHouseState>;
  state.court.push({id:'33333333-3333-4333-8333-333333333333',
   npcId:'44444444-4444-4444-8444-444444444444',
   name:'Arauto',role:'Administrador',notes:''});
  f.docs.set(f.sheet,base);
  const economy=f.docs.get(f.economyPath)!;
  const sheetHash=constructionStateHash(state);
  f.docs.set(f.economyPath,{...economy,state:structuredClone(state),
   stateHash:sheetHash,sourceStateHash:sheetHash});
  const result=await f.service().execute('valid-token-123',f.input({
   action:'court_remove',
   args:{id:'33333333-3333-4333-8333-333333333333'},
  }));
  expect(result.action).toBe('court_remove');
  expect(((f.docs.get(f.economyPath)?.['state'] as ReturnType<typeof newHouseState>)
   .court)).toHaveLength(0);
  expect((f.docs.get(f.sheet)?.['state'] as ReturnType<typeof newHouseState>)
   .court).toHaveLength(1);
  expect(f.writes()).toBe(4);
 });
});

describe('transação de economia com ledger completo',()=>{
 it('doa ouro e grava saldos antes e depois no livro-razão',async()=>{
  const f=fixture();
  const source=structuredClone(f.docs.get(f.sheet)!);
  const state=source['state'] as ReturnType<typeof newHouseState>;
  state.treasury=1000;
  f.docs.set(f.sheet,source);
  const original=f.docs.get(f.economyPath)!;
  const stateHash=constructionStateHash(state);
  f.docs.set(f.economyPath,{...original,state:structuredClone(state),
   stateHash,sourceStateHash:stateHash});
  const out=await f.service().execute('valid-token-123',f.input({
   action:'donate_gold',args:{points:1},
  }));
  expect(out.version).toBe(1);
  const after=f.docs.get(f.economyPath)!['state'] as ReturnType<typeof newHouseState>;
  expect(after.treasury).toBe(800);
  expect(after.permanent.wealth).toBe(state.permanent.wealth+1);
  const ledger=[...f.docs].find(([p])=>p.includes('/houseOperationLedger/'))?.[1];
  expect(ledger?.['beforeTreasury']).toBe(1000);
  expect(ledger?.['afterTreasury']).toBe(800);
  expect(ledger?.['afterBalances']).toBeDefined();
  expect(f.docs.get(f.sheet)?.['state']).toEqual(state);
  const repeat=await f.service().execute('valid-token-123',f.input({
   action:'donate_gold',args:{points:1},
  }));
  expect(repeat.duplicate).toBe(true);
  expect(f.writes()).toBe(4);
 });
 it('não concede recursos por APIs narrativas a jogador',async()=>{
  const f=fixture();
  await denied(()=>f.service().execute('valid-token-123',f.input({
   action:'treasury_deposit',args:{coins:500,source:'Recolhimento comprovado'},
   explanation:'Aprovação da receita pelo narrador',
  })),'house_operation_forbidden',403);
  expect(f.writes()).toBe(0);
 });
});
