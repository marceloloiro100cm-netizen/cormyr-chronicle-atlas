import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {commitOperationalRecord,RecordWriteError} from './operational-record-write';
import type {Scope} from './service';

const snap='a'.repeat(64);
const actor:Scope={uid:'user-one',profile:'jogador',playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:['h1']};
const source={id:'11111111-1111-4111-8111-111111111111',house_id:'h1',player_id:null,
 visibility:'house',kind:'document',title:'Antigo',content:'Versão original',
 version:1,updated_by:'before',updated_at:'2026-11-10T10:00:00Z'};
const root={status:'active',private:true,applicationEnabled:true,
 sourceSnapshotId:snap,sourceSnapshotReconciled:true,
 recordsReadApproved:true,recordsWriteApproved:true};

function fakeDb(){
 const data=new Map<string,any>([['campaignCloudRuntime/'+snap,root]]);
 const ref=(path:string):any=>({path,
  collection:(name:string)=>collection(path+'/'+name)});
 const collection=(path:string):any=>({doc:(id:string)=>ref(path+'/'+id)});
 return {data,
  db:{
   collection,
   runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
    const pending=new Map<string,any>();
    const tx={
     get:async(r:any)=>({exists:data.has(r.path),data:()=>data.get(r.path)}),
     set:(r:any,value:any)=>pending.set(r.path,structuredClone(value)),
    };
    const out=await fn(tx);
    for(const [path,value] of pending)data.set(path,value);
    return out;
   },
  },
 };
}
const old=process.env['CORMYR_FIREBASE_RECORDS_ENABLED'];
beforeEach(()=>{process.env['CORMYR_FIREBASE_RECORDS_ENABLED']='true';});
afterEach(()=>{if(old===undefined)delete process.env['CORMYR_FIREBASE_RECORDS_ENABLED'];
 else process.env['CORMYR_FIREBASE_RECORDS_ENABLED']=old;});
describe('registros operacionais: transação, histórico e autorização',()=>{
 it('preserva a origem, grava versões, audita e não duplica a mesma tentativa',async()=>{
  const f=fakeDb(),original=structuredClone(source);
  const input={action:'save' as const,recordId:source.id,expectedVersion:1,
   title:'Novo',content:'Conteúdo revisado'};
  const first=await commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],input,
  });
  expect(first['version']).toBe(2);
  expect(source).toEqual(original);
  const saved=await commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],input,
  });
  expect(saved).toEqual(first);
  expect([...f.data.keys()].filter(k=>k.includes('recordAudits/'))).toHaveLength(1);
  expect([...f.data.keys()].filter(k=>k.includes('recordVersions/'))).toHaveLength(2);
  const second=await commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],
   input:{...input,expectedVersion:2,content:'Terceira versão'},
  });
  expect(second['version']).toBe(3);
  expect([...f.data.keys()].filter(k=>k.includes('recordVersions/'))).toHaveLength(3);
  await expect(commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],
   input:{...input,content:'Alteração concorrente'},
  })).rejects.toMatchObject({code:'record_version_conflict',status:409});
 });
 it('recusa jogador de outra Casa, edição gm e versão adulterada',async()=>{
  const f=fakeDb();
  for(const record of [
   {...source,house_id:'h2'},
   {...source,visibility:'gm'},
   {...source,visibility:'player',player_id:'outro'},
  ]){
   await expect(commitOperationalRecord({
    db:f.db,snapshotId:snap,actor,imported:[record],
    input:{action:'save',recordId:record.id,expectedVersion:1,
     title:'Fraude',content:'Texto'},
   })).rejects.toMatchObject({code:'access_denied',status:403});
  }
 });
 it('cria somente registro com identidade, visibilidade e Casa editáveis',async()=>{
  const f=fakeDb();
  const row={id:'22222222-2222-4222-8222-222222222222',
   house_id:'h1',player_id:'p1',visibility:'player',kind:'character',
   title:'Personagem',content:'Ficha',created_by:actor.uid,updated_by:actor.uid};
  const created=await commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[],input:{action:'create',row},
  });
  expect(created['version']).toBe(1);
  await expect(commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[],
   input:{action:'create',row:{...row,id:'33333333-3333-4333-8333-333333333333',house_id:'h2'}},
  })).rejects.toMatchObject({code:'access_denied'});
 });
 it('exige aprovações explícitas de escrita e a flag do servidor',async()=>{
  const f=fakeDb();
  f.data.set('campaignCloudRuntime/'+snap,{...root,recordsWriteApproved:false});
  await expect(commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],
   input:{action:'save',recordId:source.id,expectedVersion:1,title:'X',content:'Y'},
  })).rejects.toMatchObject({code:'record_write_not_approved'});
  process.env['CORMYR_FIREBASE_RECORDS_ENABLED']='false';
  await expect(commitOperationalRecord({
   db:f.db,snapshotId:snap,actor,imported:[source],
   input:{action:'save',recordId:source.id,expectedVersion:1,title:'X',content:'Y'},
  })).rejects.toBeInstanceOf(RecordWriteError);
 });
});
