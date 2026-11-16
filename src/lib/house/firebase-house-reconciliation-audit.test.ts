import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import type {Auth} from 'firebase-admin/auth';
import {newHouseState,type HouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {
  createFirebaseHouseReconciliationAudit,HouseReconciliationAuditError,
} from './firebase-house-reconciliation-audit';

const snapshot='b'.repeat(64),uid='narrator-1';
const token='a-valid-firebase-token';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=(s:string)=>s+'/'+snapshot;
const month=1522*12+1;
type Doc=Record<string,unknown>;

function fixture(){
  const state=newHouseState('house-a','Ferlin',month);
  state.phase='active';state.method='import';
  for(const key of Object.keys(state.base) as (keyof HouseState['base'])[])
    state.base[key]=90;
  state.domains=[{id:'d1',name:'Vale',terrain:'plains',features:[],notes:''}];
  const docs=new Map<string,Doc>();
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage','migrationNobleHouseStage'])
    docs.set(root(name),{status:'complete',private:true});
  const access=root('migrationDomainStage')+'/access/'+uid;
  docs.set(access,{
    userId:uid,profile:'narrador',admin:true,active:true,
    requirePasswordChange:false,memberHouseIds:[],editHouseIds:[],
  });
  const house=root('migrationDomainStage')+
    '/houses/'+hash('house:house-a');
  docs.set(house,{sourceId:'house-a',name:'Evenhand',active:true,season:2});
  const sheet=root('migrationNobleHouseStage')+
    '/sheets/'+hash('noble-sheet:house-a');
  docs.set(sheet,{houseId:'house-a',version:3,state:structuredClone(state)});
  const calendar=root('migrationTimeEngineStage')+'/calendar/current';
  docs.set(calendar,{year:1522,month:1,day:10,festival:null,version:5});
  const runtime=root('campaignCloudRuntime');
  docs.set(runtime,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    calendarVersion:5,constructionSeededVerified:true,
    constructionReadApproved:false,constructionWriteApproved:false,
  });
  const op=runtime+'/houseEconomies/'+hash('house:house-a');
  const sourceHash=constructionStateHash(state);
  docs.set(op,{
    houseId:'house-a',status:'active',private:true,
    sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
    sourceSheetVersion:3,sourceStateHash:sourceHash,
    stateHash:sourceHash,version:0,state:structuredClone(state),
    secret:'never leak this private value',
  });
  type Ref={path:string;collection:(name:string)=>{doc:(id:string)=>Ref}};
  const ref=(path:string):Ref=>({
    path,collection:(name:string)=>({doc:(id:string)=>ref(path+'/'+name+'/'+id)}),
  });
  let writes=0,reads=0;
  const db={
    collection:(name:string)=>({doc:(id:string)=>ref(name+'/'+id)}),
    runTransaction:async <T>(fn:(tx:unknown)=>Promise<T>):Promise<T>=>
      fn({
        get:async(x:Ref)=>{
          reads++;
          return {exists:docs.has(x.path),
            data:()=>structuredClone(docs.get(x.path))};
        },
        set:()=>{writes++;throw Error('read-only violation');},
        create:()=>{writes++;throw Error('read-only violation');},
        update:()=>{writes++;throw Error('read-only violation');},
      }),
  } as unknown as Firestore;
  let disabled=false;
  const auth={
    verifyIdToken:async (_:string,revoked:boolean)=>{
      if(!revoked)throw Error('revocation check required');
      return {uid};
    },
    getUser:async (name:string)=>({uid:name,disabled}),
  } as unknown as Auth;
  const service=()=>createFirebaseHouseReconciliationAudit({
    db,auth,snapshotId:snapshot,projectId:'cormyr',enabled:true,env:{},
  });
  return {state,docs,db,auth,service,access,house,sheet,calendar,runtime,op,
    disabled:()=>{disabled=true;},reads:()=>reads,writes:()=>writes};
}
async function denied(fn:()=>Promise<unknown>,code:string,status:number){
  try{await fn();throw Error('expected denial');}
  catch(e){
    expect(e).toBeInstanceOf(HouseReconciliationAuditError);
    expect((e as HouseReconciliationAuditError).code).toBe(code);
    expect((e as HouseReconciliationAuditError).status).toBe(status);
  }
}

describe('Firebase — Narrador: diagnóstico de reconciliação',()=>{
  it('exige flag explícita, snapshot fixo e bloqueia emulador',()=>{
    const f=fixture();
    expect(()=>createFirebaseHouseReconciliationAudit({
      db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',env:{},
    })).toThrow(HouseReconciliationAuditError);
    expect(()=>createFirebaseHouseReconciliationAudit({
      db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',
      enabled:true,env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},
    })).toThrow(HouseReconciliationAuditError);
    expect(f.writes()).toBe(0);
  });
  it('informa seed consistente, mas jamais libera cutover ou atesta auditoria',async()=>{
    const f=fixture();
    const original=structuredClone([...f.docs]);
    const result=await f.service().inspect(token,'house-a');
    expect(result.status).toBe('seed_consistent');
    expect(result.houseName).toBe('Evenhand');
    expect(result.sourceVersion).toBe(3);
    expect(result.operationalVersion).toBe(0);
    expect(result.documentIntegrityConfirmed).toBe(true);
    expect(result.auditHistoryVerified).toBe(false);
    expect(result.readyForCutover).toBe(false);
    expect(result.readGateApproved).toBe(false);
    expect(result.writeGateApproved).toBe(false);
    expect(JSON.stringify(result)).not.toContain('never leak');
    expect(JSON.stringify(result)).not.toContain(sourceHashOf(f.state));
    expect([...f.docs]).toEqual(original);
    expect(f.writes()).toBe(0);
  });
  it('somente Narrador administrador lê o diagnóstico privado',async()=>{
    const f=fixture(),row=f.docs.get(f.access)!;
    f.docs.set(f.access,{...row,profile:'jogador',admin:false,
      memberHouseIds:['house-a'],editHouseIds:['house-a']});
    await denied(()=>f.service().inspect(token,'house-a'),'narrator_only',403);
    f.docs.set(f.access,{...row,profile:'editor',admin:false});
    await denied(()=>f.service().inspect(token,'house-a'),'narrator_only',403);
    f.docs.set(f.access,{...row,memberHouseIds:['house-a']});
    await denied(()=>f.service().inspect(token,'house-a'),'narrator_only',403);
    f.docs.set(f.access,row);
    f.disabled();
    await denied(()=>f.service().inspect(token,'house-a'),
      'authentication_required',401);
    expect(f.writes()).toBe(0);
  });
  it('recusa Casa desconhecida e retorna pendência quando falta seed',async()=>{
    const f=fixture();
    const unknown=await f.service().inspect(token,'house-b');
    expect(unknown.status).toBe('house_unavailable');
    expect(unknown.documentIntegrityConfirmed).toBe(false);
    f.docs.delete(f.op);
    const pending=await f.service().inspect(token,'house-a');
    expect(pending.status).toBe('operational_missing');
    expect(pending.readyForCutover).toBe(false);
  });
  it('reconhece hash da origem alterado, hash operacional e versão divergentes',async()=>{
    const f=fixture(),original=f.docs.get(f.op)!;
    f.docs.set(f.op,{...original,sourceStateHash:'c'.repeat(64)});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('source_hash_mismatch');
    f.docs.set(f.op,{...original,stateHash:'d'.repeat(64)});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('operational_hash_mismatch');
    f.docs.set(f.op,{...original,sourceSheetVersion:8});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('sheet_version_mismatch');
    expect(f.writes()).toBe(0);
  });
  it('compara estado inicial e calendário sem resolver inconsistências',async()=>{
    const f=fixture(),original=f.docs.get(f.op)!;
    const changed=structuredClone(original);
    const state=changed['state'] as HouseState;
    state.identity.notes='mudança sem compra';
    changed['stateHash']=constructionStateHash(state);
    f.docs.set(f.op,changed);
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('seed_mismatch');
    const newer=structuredClone(original);
    (newer['state'] as HouseState).month++;
    newer['stateHash']=constructionStateHash(newer['state']);
    newer['version']=1;
    f.docs.set(f.op,newer);
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('calendar_mismatch');
  });
  it('considera documento versão 1 consistente sem fingir auditar o ledger',async()=>{
    const f=fixture();
    const op=f.docs.get(f.op)!;
    f.docs.set(f.op,{...op,version:1,
      stateHash:constructionStateHash(op['state'])});
    const result=await f.service().inspect(token,'house-a');
    expect(result.status).toBe('operational_document_consistent');
    expect(result.auditHistoryVerified).toBe(false);
    expect(result.readyForCutover).toBe(false);
  });
  it('distingue runtime pendente, stage incompleto e calendário incorreto',async()=>{
    const f=fixture();
    const runtime=f.docs.get(f.runtime)!;
    f.docs.set(f.runtime,{...runtime,sourceSnapshotReconciled:false});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('runtime_unreconciled');
    f.docs.set(f.runtime,runtime);
    const time=f.docs.get(root('migrationTimeEngineStage'))!;
    f.docs.set(root('migrationTimeEngineStage'),{...time,status:'pending'});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('stage_incomplete');
    f.docs.set(root('migrationTimeEngineStage'),time);
    f.docs.set(f.calendar,{year:1522,month:6,day:1,festival:'shieldmeet',version:5});
    expect((await f.service().inspect(token,'house-a')).status)
      .toBe('calendar_unavailable');
  });
});
function sourceHashOf(v:unknown):string{return constructionStateHash(v);}
