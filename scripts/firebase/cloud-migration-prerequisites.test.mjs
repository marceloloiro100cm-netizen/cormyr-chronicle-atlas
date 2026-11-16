import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCloudPrerequisites,summarizeCloudPrerequisites}
  from './cloud-migration-prerequisites.mjs';

const HASH='a'.repeat(64);
const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const B='https://storage.googleapis.com/storage/v1/b/cormyr-migration-homolog-477785088395?fields=name';
const root=BASE+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private';
const stageNames=['migrationPrivateGmStage','migrationDriveSyncStage','migrationPublicContentStage'];
const statusFields={status:{stringValue:'complete'},private:{booleanValue:true}};
const url=(stage)=>BASE+stage+'/'+HASH+'?mask.fieldPaths=status&mask.fieldPaths=private';
const runtime=BASE+'campaignCloudRuntime/'+HASH+
 '?mask.fieldPaths=status&mask.fieldPaths=private'+
 '&mask.fieldPaths=sourceSnapshotId&mask.fieldPaths=sourceSnapshotReconciled'+
 '&mask.fieldPaths=applicationEnabled&mask.fieldPaths=privateGmReadApproved';
function fake(overrides={}){
  const replies={
    [root]:{status:200,data:{documents:[{
      name:'projects/cormyr/databases/(default)/documents/migrationDomainStage/'+HASH,
      fields:statusFields,
    }]}},
    ...Object.fromEntries(stageNames.map(s=>[url(s),{status:200,data:{fields:statusFields}}])),
    [runtime]:{status:200,data:{fields:{
      status:{stringValue:'active'},private:{booleanValue:true},
      sourceSnapshotId:{stringValue:HASH},sourceSnapshotReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},privateGmReadApproved:{booleanValue:true},
      accountUid:'LEAK_IF_SERIALIZED',
    }}},
    [B]:{status:200,data:{name:'secret-private-bucket-objects'}},
    ...overrides,
  };
  const seen=[];
  const fetcher=async(dest,init)=>{
    seen.push({dest,init});
    const response=replies[dest]??{status:404,data:null};
    return {status:response.status,json:async()=>response.data};
  };
  return {seen,run:()=>auditCloudPrerequisites({tokenProvider:async()=> 'token-from-oidc',
    fetcher})};
}
test('bounded OIDC checks give metadata-only NO-GO without data leaks',async()=>{
 const f=fake();
 const result=await f.run();
 assert.equal(result.stageMetadataComplete,true);
 assert.equal(result.gmReadApproved,true);
 assert.equal(result.storageBytesReconciled,false);
 assert.equal(result.readyForPlayers,false);
 assert.equal(result.readyForCutover,false);
 assert.equal(result.writes,0);
 assert.equal(f.seen.length,6);
 assert.ok(f.seen.every(x=>x.init.method==='GET'));
 assert.ok(f.seen.every(x=>x.init.redirect==='error'));
 assert.ok(f.seen.every(x=>x.init.headers.Authorization==='Bearer token-from-oidc'));
 const serialized=JSON.stringify(result)+summarizeCloudPrerequisites(result);
 assert.equal(serialized.includes(HASH),false);
 assert.equal(serialized.includes('LEAK_IF_SERIALIZED'),false);
 assert.equal(serialized.includes('secret-private-bucket-objects'),false);
});
test('Firestore 403 never supplies a guessed snapshot or private stage',async()=>{
 const f=fake({[root]:{status:403,data:{message:'FORBIDDEN_PRIVATE'}}});
 const result=await f.run();
 assert.equal(result.firestoreHttpStatus,403);
 assert.equal(result.uniquePrivateSnapshot,false);
 assert.equal(result.stageMetadataComplete,false);
 assert.equal(result.privateGmStageStatus,null);
 assert.equal(result.driveStageStatus,null);
 assert.equal(result.readyForPlayers,false);
 assert.equal(f.seen.length,2);
 assert.equal(JSON.stringify(result).includes('FORBIDDEN_PRIVATE'),false);
});
test('unapproved and absent stages cannot turn into GO',async()=>{
 const f=fake({
  [url('migrationDriveSyncStage')]:{status:404,data:null},
  [runtime]:{status:200,data:{fields:{status:{stringValue:'active'}}}},
  [B]:{status:403,data:null},
 });
 const result=await f.run();
 assert.equal(result.driveStageStatus,404);
 assert.equal(result.stageMetadataComplete,false);
 assert.equal(result.gmReadApproved,false);
 assert.equal(result.privateBucketMetadataHttpStatus,403);
 assert.equal(result.readyForPlayers,false);
});
