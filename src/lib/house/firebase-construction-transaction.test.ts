import {describe,it,expect} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {newHouseState} from './types';
import {
  createFirebaseCloudConstruction,CloudConstructionError,
  constructionStateHash,
} from './firebase-construction-transaction';

const snapshot='a'.repeat(64);
const uid='user-a';
const day={year:1522,month:1,day:1,festival:null,version:5};
const month=day.year*12+day.month;
const sha=(s:string)=>s;
// Test ids are obtained using the exact digest derivation used by the service.
import {createHash} from 'node:crypto';
const id=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=(name:string)=>name+'/'+snapshot;

function fixture(){
  const source=newHouseState('house-a','Ferlin',month);
  source.phase='active';
  source.method='import';
  for(const k of Object.keys(source.base) as (keyof typeof source.base)[])
    source.base[k]=200;
  source.domains=[{id:'d1',name:'Vale do Rio',terrain:'plains',features:[],notes:''},
    {id:'d2',name:'Outra Região',terrain:'hills',features:[],notes:''}];
  const docs=new Map<string,Record<string,unknown>>();
  for(const name of [
    'migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage','migrationNobleHouseStage',
  ])docs.set(root(name),{status:'complete',private:true});
  docs.set(root('migrationDomainStage')+'/access/'+uid,{
    userId:uid,active:true,requirePasswordChange:false,
    profile:'jogador',admin:false,playerId:'player-a',
    memberHouseIds:['house-a'],editHouseIds:['house-a'],
  });
  docs.set(root('migrationDomainStage')+'/houses/'+id('house:house-a'),{
    sourceId:'house-a',active:true,season:2,name:'Evenhand',
  });
  docs.set(root('migrationNobleHouseStage')+'/sheets/'+id('noble-sheet:house-a'),{
    houseId:'house-a',version:3,state:structuredClone(source),
  });
  docs.set(root('migrationTimeEngineStage')+'/calendar/current',{...day});
  docs.set(root('campaignCloudRuntime'),{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    constructionWriteApproved:true,constructionSeededVerified:true,
    calendarVersion:day.version,
  });
  const opPath=root('campaignCloudRuntime')+
    '/houseEconomies/'+id('house:house-a');
  const seeded=constructionStateHash(source);
  docs.set(opPath,{
    houseId:'house-a',status:'active',private:true,
    sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
    sourceSheetVersion:3,sourceStateHash:seeded,stateHash:seeded,
    version:0,state:structuredClone(source),
  });
  type Ref={path:string;collection:(name:string)=>{doc:(key:string)=>Ref}};
  const ref=(path:string):Ref=>({
    path,collection:(name:string)=>({doc:(key:string)=>ref(path+'/'+name+'/'+key)}),
  });
  let writes=0;
  const db={
    collection:(name:string)=>({doc:(key:string)=>ref(name+'/'+key)}),
    runTransaction:async <T>(fn:(tx:unknown)=>Promise<T>):Promise<T>=>{
      const pending:{op:'create'|'update';path:string;value:Record<string,unknown>}[]=[];
      const tx={
        get:async(r:Ref)=>({exists:docs.has(r.path),
          data:()=>structuredClone(docs.get(r.path))}),
        update:(r:Ref,v:Record<string,unknown>)=>{
          if(!docs.has(r.path))throw Error('missing target');
          pending.push({op:'update',path:r.path,value:v});
        },
        create:(r:Ref,v:Record<string,unknown>)=>{
          if(docs.has(r.path)||pending.some(x=>x.path===r.path))
            throw Error('duplicate audit');
          pending.push({op:'create',path:r.path,value:v});
        },
      };
      const answer=await fn(tx);
      for(const p of pending){
        const value=p.op==='update'?{...docs.get(p.path),...p.value}:p.value;
        docs.set(p.path,structuredClone(value));writes++;
      }
      return answer;
    },
  } as unknown as Firestore;
  const auth={
    verifyIdToken:async (_:string,checkRevoked:boolean)=>{
      if(!checkRevoked)throw Error('revocation bypass');
      return {uid};
    },
    getUser:async (userId:string)=>({uid:userId,disabled:false}),
  } as unknown as Auth;
  const service=()=>createFirebaseCloudConstruction({
    db,auth,snapshotId:snapshot,projectId:'cormyr',enabled:true,
    env:{},roll:()=>2,clock:()=> '2026-11-16T12:00:00.000Z',
  });
  const input=(overrides:Record<string,unknown>={})=>({
    houseId:'house-a',requestKey:'key_12345678',
    expectedVersion:0,itemId:'tower',domainId:'d1',
    name:'Torre de Vigilância',...overrides,
  });
  return {source,docs,opPath,service,input,auth,db,
    writes:()=>writes};
}
const rejected=async(fn:()=>Promise<unknown>,code:string,status:number)=>{
  try{await fn();throw Error('expected failure');}
  catch(e){
    expect(e).toBeInstanceOf(CloudConstructionError);
    expect((e as CloudConstructionError).code).toBe(code);
    expect((e as CloudConstructionError).status).toBe(status);
  }
};

describe('Firebase Cloud — compra transacional bloqueada por padrão',()=>{
  it('exige habilitação explícita, mesmo com fixture de banco válida',()=>{
    const f=fixture();
    expect(()=>createFirebaseCloudConstruction({
      db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',
      enabled:false,env:{},
    })).toThrowError(CloudConstructionError);
    expect(()=>createFirebaseCloudConstruction({
      db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',
      enabled:true,env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'},
    })).toThrowError(CloudConstructionError);
    expect(f.writes()).toBe(0);
  });
  it('compra usando motor canônico, rolagem do servidor, CAS e auditoria',async()=>{
    const f=fixture();
    const original=structuredClone(f.docs.get(root('migrationNobleHouseStage')+
      '/sheets/'+id('noble-sheet:house-a')));
    const result=await f.service().purchase('long-firebase-token',f.input());
    expect(result.duplicate).toBe(false);
    expect(result.version).toBe(1);
    expect(result.dice).toEqual(Array(10).fill(2));
    const op=f.docs.get(f.opPath)!;
    expect(op['version']).toBe(1);
    const state=op['state'] as typeof f.source;
    expect(state.holdings).toHaveLength(1);
    expect(state.holdings[0]?.itemId).toBe('tower');
    expect(state.holdings[0]?.status).toBe('building');
    expect(state.projects).toHaveLength(1);
    expect(op['stateHash']).toBe(constructionStateHash(state));
    expect(f.docs.get(root('migrationNobleHouseStage')+
      '/sheets/'+id('noble-sheet:house-a'))).toEqual(original);
    const audit=f.docs.get(root('campaignCloudRuntime')+
      '/houseConstructionAudits/'+result.id)!;
    expect(audit['actorUid']).toBe(uid);
    expect(audit['houseId']).toBe('house-a');
    expect(audit['dice']).toEqual(Array(10).fill(2));
    expect(audit['beforeStateHash']).toBe(audit['sourceStateHash']);
    expect(f.writes()).toBe(2);
  });
  it('replay idempotente não cria segunda obra; key e CAS conflitantes falham',async()=>{
    const f=fixture();
    const service=f.service();
    const first=await service.purchase('long-firebase-token',f.input());
    const again=await service.purchase('long-firebase-token',f.input());
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(first.id);
    expect(f.writes()).toBe(2);
    await rejected(()=>service.purchase('long-firebase-token',
      f.input({name:'Outra obra'})),'construction_request_key_conflict',409);
    await rejected(()=>service.purchase('long-firebase-token',
      f.input({requestKey:'key_second123'})),'construction_version_conflict',409);
    expect(f.writes()).toBe(2);
  });
  it('proíbe escritor de outra Casa, editor e conta revogada',async()=>{
    const f=fixture();
    await rejected(()=>f.service().purchase('long-firebase-token',
      f.input({houseId:'house-b'})),'access_denied',403);
    const user=f.docs.get(root('migrationDomainStage')+'/access/'+uid)!;
    f.docs.set(root('migrationDomainStage')+'/access/'+uid,{
      ...user,profile:'editor',admin:false,
      memberHouseIds:[],editHouseIds:[],
    });
    await rejected(()=>f.service().purchase('long-firebase-token',f.input()),
      'access_denied',403);
    expect(f.writes()).toBe(0);
  });
  it('rejeita seed divergente, flag privada ausente e desvio temporal',async()=>{
    const f=fixture();
    const op=f.docs.get(f.opPath)!;
    f.docs.set(f.opPath,{...op,sourceStateHash:'b'.repeat(64)});
    await rejected(()=>f.service().purchase('long-firebase-token',f.input()),
      'construction_source_not_reconciled',503);
    f.docs.set(f.opPath,op);
    const runtime=f.docs.get(root('campaignCloudRuntime'))!;
    f.docs.set(root('campaignCloudRuntime'),{
      ...runtime,constructionWriteApproved:false,
    });
    await rejected(()=>f.service().purchase('long-firebase-token',f.input()),
      'construction_runtime_not_approved',503);
    f.docs.set(root('campaignCloudRuntime'),runtime);
    const changed=structuredClone(op);
    (changed['state'] as typeof f.source).month--;
    changed['stateHash']=constructionStateHash(changed['state']);
    f.docs.set(f.opPath,changed);
    await rejected(()=>f.service().purchase('long-firebase-token',f.input()),
      'construction_source_not_reconciled',503);
    expect(f.writes()).toBe(0);
  });
  it('não permite dados de custos, rolagem nem posse de domínio alheio',async()=>{
    const f=fixture();
    const s=f.service();
    await rejected(()=>s.purchase('long-firebase-token',
      f.input({dice:[6,6],costs:[{resource:'defense',amount:0}]})),
      'invalid_construction_request',400);
    const state=f.docs.get(f.opPath)!.state as typeof f.source;
    state.holdings.push({
      id:'another-holding',itemId:'tower',name:'Torre do norte',domainId:'d2',
      costs:[],effects:[],ruleVersion:'2026',source:'teste',status:'active',
    });
    const op=f.docs.get(f.opPath)!;
    const seeded=constructionStateHash(state);
    f.docs.set(f.opPath,{...op,state:structuredClone(state),
      sourceStateHash:seeded,stateHash:seeded});
    const sheetPath=root('migrationNobleHouseStage')+
      '/sheets/'+id('noble-sheet:house-a');
    const sheet=f.docs.get(sheetPath)!;
    f.docs.set(sheetPath,{...sheet,state:structuredClone(state)});
    await rejected(()=>s.purchase('long-firebase-token',
      f.input({parentId:'another-holding'})),
      'construction_rule_blocked',409);
    expect(f.writes()).toBe(0);
  });
});
