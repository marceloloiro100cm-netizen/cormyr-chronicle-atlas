import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {readDriveCloudPreflight} from './drive-cloud-preflight.server';

const HASH='a'.repeat(64);
const runtime='campaignCloudRuntime/'+HASH;
const stage='migrationDriveSyncStage/'+HASH;
function fixture(changes:{docs?:Record<string,unknown>;enabled?:boolean;env?:NodeJS.ProcessEnv}={}){
  const docs:Record<string,unknown>={
    [runtime]:{
      status:'active',private:true,sourceSnapshotId:HASH,
      sourceSnapshotReconciled:true,applicationEnabled:true,
    },
    [stage]:{
      status:'complete',private:true,formatVersion:1,
      counts:{bindings:3,files:4,inbox:0,outbox:2,conflicts:1},
      privateFolderIds:['NEVER_RETURN_TO_CALLER'],
    },
    ...changes.docs,
  };
  const reads:string[]=[];
  const db={collection:(name:string)=>({doc:(id:string)=>({
    get:async()=>{const path=name+'/'+id;reads.push(path);
      return {exists:docs[path]!=null,data:()=>docs[path]??undefined};},
  })})} as unknown as Firestore;
  return {
    docs,reads,
    run:()=>readDriveCloudPreflight({
      db,snapshotId:HASH,projectId:'cormyr',
      enabled:changes.enabled??true,env:changes.env??{},
    }),
  };
}
describe('Firebase Drive scheduler safe preflight',()=>{
  it('returns only aggregate counts with no writes',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result).toMatchObject({
      mode:'preflight-only',stagedObjects:10,stagedBindings:3,
      googleDriveAuthenticated:false,realSyncEnabled:false,
      firestoreWrites:0,driveWrites:0,readyForCutover:false,
    });
    expect(JSON.stringify(result)).not.toContain('NEVER_RETURN_TO_CALLER');
    expect(f.reads).toEqual([runtime,stage]);
  });
  it('blocks the entire Cloud read while disabled',async()=>{
    const f=fixture({enabled:false});
    await expect(f.run()).rejects.toMatchObject({status:503});
    expect(f.reads).toEqual([]);
  });
  it('rejects emulator routing',async()=>{
    const f=fixture({env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}});
    await expect(f.run()).rejects.toMatchObject({status:503});
    expect(f.reads).toEqual([]);
  });
  it('rejects unreconciled runtime, incomplete stage and malformed counts',async()=>{
    const f=fixture();
    for(const docs of [
      {[runtime]:{...(f.docs[runtime] as object),applicationEnabled:false}},
      {[stage]:{...(f.docs[stage] as object),status:'pending'}},
      {[stage]:{...(f.docs[stage] as object),counts:{bindings:1.5}}},
    ]){
      const other=fixture({docs});
      await expect(other.run()).rejects.toMatchObject({status:503});
    }
  });
});
