import {describe,it,expect} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {newHouseState,type HouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {
  createFirebaseOperationalHouseRead,CloudEconomyReadError,
} from './firebase-operational-house-read';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';

const snapshot='a'.repeat(64),uid='user-alpha';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const root=(name:string)=>name+'/'+snapshot;
const month=1522*12+1;
const token='a-valid-firebase-id-token';

function fixture(){
  const state=newHouseState('house-a','Ferlin',month);
  state.phase='active';state.method='import';
  for(const resource of Object.keys(state.base) as (keyof HouseState['base'])[])
    state.base[resource]=200;
  state.domains=[{id:'d1',name:'Vale de Ferlin',terrain:'plains',features:[],notes:''}];
  const docs=new Map<string,Record<string,unknown>>();
  for(const name of [
    'migrationDomainStage','migrationAuthStage','migrationNobleHouseStage',
    'migrationTimeEngineStage',
  ])docs.set(root(name),{status:'complete',private:true});
  const access=root('migrationDomainStage')+'/access/'+uid;
  docs.set(access,{
    userId:uid,active:true,requirePasswordChange:false,
    profile:'jogador',admin:false,playerId:'p1',
    memberHouseIds:['house-a'],editHouseIds:[],
  });
  docs.set(root('migrationDomainStage')+'/houses/'+hash('house:house-a'),{
    sourceId:'house-a',name:'Evenhand',active:true,season:2,
  });
  docs.set(root('migrationNobleHouseStage')+'/sheets/'+hash('noble-sheet:house-a'),{
    houseId:'house-a',version:3,state:structuredClone(state),
  });
  docs.set(root('migrationTimeEngineStage')+'/calendar/current',{
    year:1522,month:1,day:1,festival:null,version:5,
  });
  const runtime=root('campaignCloudRuntime');
  docs.set(runtime,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    constructionReadApproved:true,constructionWriteApproved:false,
    constructionSeededVerified:true,calendarVersion:5,
  });
  const opPath=runtime+'/houseEconomies/'+hash('house:house-a');
  const sourceHash=constructionStateHash(state);
  docs.set(opPath,{
    houseId:'house-a',status:'active',private:true,
    sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
    sourceSheetVersion:3,sourceStateHash:sourceHash,
    stateHash:sourceHash,version:0,state:structuredClone(state),
  });
  type Ref={path:string;get:()=>Promise<unknown>;
    collection:(name:string)=>{doc:(key:string)=>Ref}};
  let reads=0;
  const ref=(path:string):Ref=>({
    path,
    get:async()=>{reads++;return {exists:docs.has(path),
      data:()=>structuredClone(docs.get(path))};},
    collection:(name:string)=>({doc:(key:string)=>ref(path+'/'+name+'/'+key)}),
  });
  const db={
    collection:(name:string)=>({doc:(id:string)=>ref(name+'/'+id)}),
  } as unknown as Firestore;
  let disabled=false;
  const auth={
    verifyIdToken:async (_:string,revoked:boolean)=>{
      if(!revoked)throw Error('must check revocation');
      return {uid};
    },
    getUser:async (_:string)=>({uid,disabled}),
  } as unknown as Auth;
  const service=()=>createFirebaseOperationalHouseRead({
    db,auth,projectId:'cormyr',snapshotId:snapshot,
    enabled:true,env:{},
  });
  return {docs,opPath,runtime,access,state,service,auth,db,
    disable:()=>{disabled=true;},reads:()=>reads};
}
const denied=async(fn:()=>Promise<unknown>)=>{
  await expect(fn()).rejects.toBeInstanceOf(CloudAccessError);
};
describe('Firebase Cloud — economia operacional privada',()=>{
  it('rejeita leitura desligada e identidade de projeto não autorizada',()=>{
    const f=fixture();
    expect(()=>createFirebaseOperationalHouseRead({
      db:f.db,auth:f.auth,projectId:'cormyr',
      snapshotId:snapshot,env:{},enabled:false,
    })).toThrowError(CloudEconomyReadError);
    expect(()=>createFirebaseOperationalHouseRead({
      db:f.db,auth:f.auth,projectId:'other',
      snapshotId:snapshot,env:{},enabled:true,
    })).toThrowError(CloudEconomyReadError);
    expect(f.reads()).toBe(0);
  });
  it('lê somente a própria Casa sem precisar liberar escritas',async()=>{
    const f=fixture();
    const original=structuredClone(f.docs);
    const output=await f.service().summary(token,'house-a');
    expect(output.available).toBe(true);
    if(!output.available)throw Error('missing projection');
    expect(output.houseName).toBe('Evenhand');
    expect(output.version).toBe(0);
    expect(output.sourceSheetVersion).toBe(3);
    expect(output.balances.available.defense).toBe(200);
    expect(output.holdingsTotal).toBe(0);
    expect(output.projectsTotal).toBe(0);
    expect(JSON.stringify(output)).not.toContain('user-alpha');
    expect(JSON.stringify(output)).not.toContain('requestKey');
    expect(JSON.stringify(output)).not.toContain('base');
    expect(f.docs).toEqual(original);
  });
  it('bloqueia Casa externa, editor e conta desabilitada antes de ler runtime',async()=>{
    const f=fixture();
    const before=f.reads();
    await denied(()=>f.service().summary(token,'house-b'));
    expect(f.reads()).toBeGreaterThan(before);
    const row=f.docs.get(f.access)!;
    f.docs.set(f.access,{...row,profile:'editor',memberHouseIds:[]});
    await denied(()=>f.service().summary(token,'house-a'));
    f.docs.set(f.access,row);
    f.disable();
    await denied(()=>f.service().summary(token,'house-a'));
  });
  it('falha fechada sem aprovação de leitura, sem seed ou com hash inválido',async()=>{
    const f=fixture();
    const config=f.docs.get(f.runtime)!;
    f.docs.set(f.runtime,{...config,constructionReadApproved:false,
      constructionWriteApproved:true});
    expect(await f.service().summary(token,'house-a'))
      .toEqual({available:false,readOnly:true});
    f.docs.set(f.runtime,config);
    f.docs.delete(f.opPath);
    expect(await f.service().summary(token,'house-a'))
      .toEqual({available:false,readOnly:true});
    const f2=fixture();
    const broken=f2.docs.get(f2.opPath)!;
    f2.docs.set(f2.opPath,{...broken,stateHash:'b'.repeat(64)});
    expect(await f2.service().summary(token,'house-a'))
      .toEqual({available:false,readOnly:true});
  });
  it('detecta versão da origem e mês oficial divergentes',async()=>{
    const f=fixture();
    const op=f.docs.get(f.opPath)!;
    f.docs.set(f.opPath,{...op,sourceSheetVersion:4});
    expect(await f.service().summary(token,'house-a'))
      .toEqual({available:false,readOnly:true});
    f.docs.set(f.opPath,op);
    const altered=structuredClone(op);
    (altered['state'] as HouseState).month+=1;
    altered['stateHash']=constructionStateHash(altered['state']);
    altered['version']=1;
    f.docs.set(f.opPath,altered);
    expect(await f.service().summary(token,'house-a'))
      .toEqual({available:false,readOnly:true});
  });
  it('projeta recursos, posses e projetos após evento operacional',async()=>{
    const f=fixture();
    const op=structuredClone(f.docs.get(f.opPath)!);
    const state=op['state'] as HouseState;
    state.holdings.push({
      id:'h1',itemId:'tower',name:'Torre Azul',domainId:'d1',
      status:'building',category:'fortification',
      source:'Regra oficial',ruleVersion:'v1',
      costs:[{resource:'defense',amount:10,mode:'allocation'}],
      effects:[],
    });
    state.projects.push({
      id:'project1',holdingId:'h1',name:'Ampliação',status:'building',
      start:month,duration:4,dice:[],modifier:0,
    });
    op['version']=1;
    op['stateHash']=constructionStateHash(state);
    f.docs.set(f.opPath,op);
    const output=await f.service().summary(token,'house-a');
    expect(output.available).toBe(true);
    if(!output.available)throw Error('missing projection');
    expect(output.balances.committed.defense).toBe(10);
    expect(output.balances.available.defense).toBe(190);
    expect(output.holdings[0]?.name).toBe('Torre Azul');
    expect(output.projects[0]?.name).toBe('Ampliação');
    expect(output.version).toBe(1);
    expect('state' in output).toBe(false);
    expect('actorUid' in output).toBe(false);
  });
});
