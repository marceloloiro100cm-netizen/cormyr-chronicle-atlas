import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {
  isAuthorizedFirebaseDriveJob,inspectApprovedFirebaseDriveStage,
  DriveCloudJobUnavailable,
} from './firebase-cloud-drive-job.server';
import {readFileSync} from 'node:fs';
const SNAP='c'.repeat(64);
const secret='current-test-cron-secret-32-chars-and-more';
const old='previous-test-cron-secret-32-chars-and-more';
function fixture(extra:Record<string,unknown>={}){
  const docs:Record<string,unknown>={
    ['campaignCloudRuntime/'+SNAP]:{
      status:'active',private:true,sourceSnapshotId:SNAP,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      driveAuditApproved:true,privateUser:'should-never-appear',
    },
    ['migrationDriveSyncStage/'+SNAP]:{
      status:'complete',formatVersion:1,private:true,
      counts:{bindings:7,files:30,inbox:4,outbox:0,conflicts:1},
    },...extra,
  };
  const reads:string[]=[];
  const db={collection:(collection:string)=>({
    doc:(id:string)=>({get:async()=>{
      const path=collection+'/'+id;
      reads.push(path);return {data:()=>docs[path]??undefined};
    }}),
  })} as unknown as Firestore;
  return {docs,reads,opts:{db,projectId:'cormyr',
    snapshotId:SNAP,enabled:true,env:{}},
  };
}
const req=(authorization:string)=>new Request('https://atlas.cormyr.com.br/api/public/jobs/drive-sync',{
  method:'POST',headers:{Authorization:authorization},
});
describe('Firebase Drive Scheduler read-only boundary',()=>{
  it('uses constant-time digest comparison and supports explicit rotation',()=>{
    expect(isAuthorizedFirebaseDriveJob(req('Bearer '+secret),secret,old)).toBe(true);
    expect(isAuthorizedFirebaseDriveJob(req('Bearer '+old),secret,old)).toBe(true);
    expect(isAuthorizedFirebaseDriveJob(req('Bearer '+secret+'x'),secret,old)).toBe(false);
    expect(isAuthorizedFirebaseDriveJob(req('Bearer '+secret),'short')).toBe(false);
    expect(isAuthorizedFirebaseDriveJob(req('Bearer '+secret),secret,'short')).toBe(false);
    expect(isAuthorizedFirebaseDriveJob(req('Basic '+secret),secret,old)).toBe(false);
  });
  it('reads only checked Cloud stage counts, never folders, user IDs or tokens',async()=>{
    const f=fixture();
    const result=await inspectApprovedFirebaseDriveStage(f.opts);
    expect(result).toEqual({mode:'audit_only',cloudWrites:0,
      readyForReconciliation:false,
      counts:{bindings:7,files:30,inbox:4,outbox:0,conflicts:1}});
    expect(f.reads).toEqual(['campaignCloudRuntime/'+SNAP,
      'migrationDriveSyncStage/'+SNAP]);
    expect(JSON.stringify(result)).not.toContain('privateUser');
  });
  it('rejects unpublished runtime, incomplete staging and corrupt counts',async()=>{
    for(const patch of [
      {['campaignCloudRuntime/'+SNAP]:null},
      {['campaignCloudRuntime/'+SNAP]:{driveAuditApproved:true}},
      {['migrationDriveSyncStage/'+SNAP]:null},
      {['migrationDriveSyncStage/'+SNAP]:{status:'complete',private:true,
        formatVersion:1,counts:{bindings:-1,files:2,inbox:0,outbox:0,conflicts:0}}},
    ]){
      const f=fixture(patch);
      await expect(inspectApprovedFirebaseDriveStage(f.opts))
        .rejects.toBeInstanceOf(DriveCloudJobUnavailable);
    }
  });
  it('rejects emulator, missing flag and wrong snapshot before I/O',async()=>{
    for(const changes of [{enabled:false},{
      env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},
    },{snapshotId:'not-a-hash'}]){
      const f=fixture();
      await expect(inspectApprovedFirebaseDriveStage({...f.opts,...changes}))
        .rejects.toBeInstanceOf(DriveCloudJobUnavailable);
      expect(f.reads).toHaveLength(0);
    }
  });
  it('does not call legacy Supabase executor or claim unexecuted jobs succeeded',()=>{
    const route=readFileSync('src/routes/api/public/jobs/drive-sync.ts','utf8');
    expect(route).not.toMatch(/supabaseAdmin|runDriveSync|updatePublicArchive|authenticateCronRequest/);
    expect(route).toContain("kind==='reconcile'");
    expect(route).toContain("fail(503,'firebase_drive_write_not_authorized')");
  });
});
