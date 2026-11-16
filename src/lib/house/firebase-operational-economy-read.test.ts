import {describe,it,expect} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {newHouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {createFirebaseOperationalEconomyRead,CloudEconomyReadError}
  from './firebase-operational-economy-read';

const snapshot='a'.repeat(64),uid='player-uid-a';
const d=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=(name:string)=>name+'/'+snapshot;
const month=1522*12+1;
const token='valid-firebase-token';
type Row=Record<string,unknown>;
function fixture(){
  const source=newHouseState('house-a','Ferlin',month);
  source.phase='active';source.method='import';
  for(const key of Object.keys(source.base) as (keyof typeof source.base)[])
    source.base[key]=80;
  source.domains=[{id:'d1',name:'Vale',terrain:'plains',
    features:[],notes:'detalhe privado'}];
  source.identity.notes='NÃO EXPOR DADOS PRIVADOS';
  const state=structuredClone(source);
  state.holdings.push({id:'h1',name:'Torre do Vale',
    domainId:'d1',itemId:'tower',source:'origem sigilosa',
    status:'building',costs:[{resource:'defense',amount:10,mode:'allocation'}],
    effects:[],ruleVersion:'2026'});
  state.projects.push({id:'p1',holdingId:'h1',
    name:'Torre do Vale',start:month,duration:3,
    modifier:0,dice:[],status:'building'});
  const docs=new Map<string,Row>();
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage','migrationNobleHouseStage'])
    docs.set(root(name),{status:'complete',private:true});
  const access=root('migrationDomainStage')+'/access/'+uid;
  docs.set(access,{
    userId:uid,active:true,requirePasswordChange:false,
    profile:'jogador',admin:false,playerId:'p1',
    memberHouseIds:['house-a'],editHouseIds:[],
  });
  const houseRef=root('migrationDomainStage')+'/houses/'+d('house:house-a');
  docs.set(houseRef,{sourceId:'house-a',active:true,
    season:2,name:'Evenhand'});
  const sheetRef=root('migrationNobleHouseStage')+
    '/sheets/'+d('noble-sheet:house-a');
  docs.set(sheetRef,{houseId:'house-a',version:3,state:structuredClone(source)});
  docs.set(root('migrationTimeEngineStage')+'/calendar/current',
    {year:1522,month:1,day:2,festival:null,version:5});
  docs.set(root('campaignCloudRuntime'),{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    constructionReadApproved:true,constructionWriteApproved:false,
    constructionSeededVerified:true,calendarVersion:5,
  });
  const op=root('campaignCloudRuntime')+'/houseEconomies/'+d('house:house-a');
  docs.set(op,{
    houseId:'house-a',status:'active',private:true,
    sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
    sourceSheetVersion:3,sourceStateHash:constructionStateHash(source),
    stateHash:constructionStateHash(state),version:1,state,
    privateMetadata:{adminUid:'never-leak'},
  });
  type Ref={path:string;collection:(name:string)=>{doc:(id:string)=>Ref}};
  const ref=(path:string):Ref=>({
    path,collection:(name:string)=>({doc:(id:string)=>ref(path+'/'+name+'/'+id)}),
  });
  let writes=0;
  const db={
    collection:(name:string)=>({doc:(id:string)=>ref(name+'/'+id)}),
    runTransaction:async <T>(fn:(tx:unknown)=>Promise<T>)=>
      fn({
        get:async (r:Ref)=>({exists:docs.has(r.path),
          data:()=>structuredClone(docs.get(r.path))}),
        set:()=>{writes++;throw Error('read must never write');},
        create:()=>{writes++;throw Error('read must never write');},
        update:()=>{writes++;throw Error('read must never write');},
      }),
  } as unknown as Firestore;
  const auth={
    verifyIdToken:async (_:string,check:boolean)=>{
      if(!check)throw Error('missing revoked check');
      return {uid};
    },
    getUser:async (identifier:string)=>({uid:identifier,disabled:false}),
  } as unknown as Auth;
  const service=()=>createFirebaseOperationalEconomyRead({
    db,auth,snapshotId:snapshot,projectId:'cormyr',
    enabled:true,env:{},
  });
  return {docs,source,state,service,db,auth,op,access,
    runtime:root('campaignCloudRuntime'),writes:()=>writes};
}
async function denies(fn:()=>Promise<unknown>,code:string,status:number){
  try{await fn();throw Error('expected denial');}
  catch(e){
    expect(e).toBeInstanceOf(CloudEconomyReadError);
    expect((e as CloudEconomyReadError).code).toBe(code);
    expect((e as CloudEconomyReadError).status).toBe(status);
  }
}
describe('Firebase Cloud — economia operacional somente leitura',()=>{
  it('retorna somente balanços atuais, obras e projetos autorizados',async()=>{
    const f=fixture(),before=structuredClone(f.docs.get(f.op));
    const result=await f.service().getHouse(token,'house-a');
    expect(result.houseId).toBe('house-a');
    expect(result.version).toBe(1);
    expect(result.sourceSheetVersion).toBe(3);
    expect(result.readOnly).toBe(true);
    expect(result.balances.committed.defense).toBe(10);
    expect(result.holdingsTotal).toBe(1);
    expect(result.projectsTotal).toBe(1);
    expect(result.holdings[0]?.name).toBe('Torre do Vale');
    expect(result.holdings[0]?.domainName).toBe('Vale');
    expect(result.projects[0]?.name).toBe('Torre do Vale');
    expect(result.projects[0]?.holdingName).toBe('Torre do Vale');
    const serialized=JSON.stringify(result);
    for(const secret of ['NÃO EXPOR','privateMetadata','adminUid',
      'sourceStateHash','actorUid','origem sigilosa','treasury','UID'])
      expect(serialized).not.toContain(secret);
    expect(f.docs.get(f.op)).toEqual(before);
    expect(f.writes()).toBe(0);
  });
  it('narrador pode ler Casa, editor e outra Casa são negados',async()=>{
    const f=fixture();
    await denies(()=>f.service().getHouse(token,'house-b'),'access_denied',403);
    const p=f.docs.get(f.access)!;
    f.docs.set(f.access,{...p,profile:'editor',admin:false,
      memberHouseIds:[],editHouseIds:[]});
    await denies(()=>f.service().getHouse(token,'house-a'),'access_denied',403);
    f.docs.set(f.access,{...p,profile:'narrador',admin:true,
      memberHouseIds:[],editHouseIds:[]});
    const response=await f.service().getHouse(token,'house-a');
    expect(response.houseId).toBe('house-a');
    expect(f.writes()).toBe(0);
  });
  it('gate de leitura independente de escrita e desabilitado por padrão',async()=>{
    const f=fixture();
    expect(()=>createFirebaseOperationalEconomyRead({
      db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',
      enabled:false,env:{},
    })).toThrow(CloudEconomyReadError);
    const data=await f.service().getHouse(token,'house-a');
    expect(data.readOnly).toBe(true);
    f.docs.set(f.runtime,{
      ...f.docs.get(f.runtime),constructionReadApproved:false,
      constructionWriteApproved:true,
    });
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_read_unapproved',503);
  });
  it('não retorna saldos de origem divergente ou estado adulterado',async()=>{
    const f=fixture(),op=f.docs.get(f.op)!;
    f.docs.set(f.op,{...op,sourceStateHash:'b'.repeat(64)});
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    const changed=structuredClone(op);
    (changed['state'] as typeof f.state).holdings[0]!.name='Adulterada';
    f.docs.set(f.op,changed);
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    f.docs.set(f.op,{...op,version:0});
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    expect(f.writes()).toBe(0);
  });
  it('não publica projetos com identidade ou situação indefinida',async()=>{
    const f=fixture(),original=f.docs.get(f.op)!;
    const invalid=structuredClone(original);
    const state=invalid['state'] as typeof f.state;
    state.projects[0]!.name='';
    invalid['stateHash']=constructionStateHash(state);
    f.docs.set(f.op,invalid);
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    const wrong=structuredClone(original);
    (wrong['state'] as typeof f.state).projects[0]!.status='cancelled';
    (wrong['state'] as typeof f.state).projects[0]!.id='';
    wrong['stateHash']=constructionStateHash(wrong['state']);
    f.docs.set(f.op,wrong);
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    expect(f.writes()).toBe(0);
  });
  it('rejeita período diferente, dados incompletos e escopo inválido',async()=>{
    const f=fixture();
    const doc=f.docs.get(f.runtime)!;
    f.docs.set(f.runtime,{...doc,calendarVersion:4});
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_read_unapproved',503);
    f.docs.set(f.runtime,doc);
    const before=f.docs.get(f.op)!;
    const newer=structuredClone(before);
    (newer['state'] as typeof f.state).month--;
    newer['stateHash']=constructionStateHash(newer['state']);
    f.docs.set(f.op,newer);
    await denies(()=>f.service().getHouse(token,'house-a'),
      'operational_economy_unavailable',503);
    f.docs.set(f.op,before);
    const profile=f.docs.get(f.access)!;
    f.docs.set(f.access,{...profile,editHouseIds:['house-b']});
    await denies(()=>f.service().getHouse(token,'house-a'),
      'invalid_access_scope',403);
  });
});
