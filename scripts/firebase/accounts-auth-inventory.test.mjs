import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAuthInventory,authInventorySummary} from './accounts-auth-inventory.mjs';
const snap='a'.repeat(64);
const fixture=({denied=false,disabled=false,missingHouse=false}={})=>{
 const root={status:'complete',private:true};
 const docs=new Map([
  ['migrationDomainStage',{docs:[{id:snap,data:()=>root}]}],
  ['migrationDomainStage/'+snap+'/access',{docs:[
   {id:'gm',data:()=>({userId:'gm',profile:'narrador',admin:true,
    active:true,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]})},
   {id:'p1',data:()=>({userId:'p1',profile:'jogador',admin:false,
    active:true,requirePasswordChange:true,
    memberHouseIds:missingHouse?[]:['house-1'],editHouseIds:['house-1']})},
  ]}],
  ['campaignCloudRuntime/'+snap+'/accountAccess',{docs:[]}],
  ['campaignCloudRuntime/'+snap,{exists:true,data:()=>({
   status:'active',private:true,sourceSnapshotId:snap,
   sourceSnapshotReconciled:true,applicationEnabled:true,
  })}],
 ]);
 const counts={get:0,writes:0};
 const ref=path=>({
  limit:()=>ref(path),doc:name=>ref(path+'/'+name),
  collection:name=>ref(path+'/'+name),
  get:async()=>{
   counts.get++;
   if(denied)throw Error('PRIVATE_EMAIL_SHOULD_NOT_PRINT');
   return docs.get(path)??{docs:[],exists:false,data:()=>undefined};
  },
 });
 const auth={listUsers:async()=>{
  if(denied)throw Error('PRIVATE_UID_SHOULD_NOT_PRINT');
  return {users:[{uid:'gm',disabled:false},
   {uid:'p1',disabled}]};
 }};
 const db={collection:name=>ref(name)};
 return{auth,db,counts};
};
test('somente inventário Auth e Firestore, sem senha, identificadores nem escrita',async()=>{
 const f=fixture();
 const r=await auditAuthInventory(f);
 assert.equal(r.authUsers,2);
 assert.equal(r.linkedAccounts,2);
 assert.equal(r.authDisabled,0);
 assert.equal(r.pendingPasswordRotation,1);
 assert.equal(r.inventoryVerified,true);
 assert.equal(r.releaseDecision,'NO_GO');
 assert.equal(f.counts.writes,0);
 const output=authInventorySummary(r);
 assert.doesNotMatch(output,/house-1|p1|@|PRIVATE_|a{64}/);
});
test('Auth desativado e jogador sem Casa são sinalizados sem reativar conta',async()=>{
 const f=fixture({disabled:true,missingHouse:true});
 const r=await auditAuthInventory(f);
 assert.equal(r.authDisabled,1);
 assert.equal(r.disabledAuthWithActiveAccess,1);
 assert.equal(r.playersWithoutHouse,1);
 assert.ok(r.blockers.includes('INCOMPLETE_ROLE_OR_HOUSE'));
 assert.equal(f.counts.writes,0);
});
test('falta de permissão IAM falha fechado sem vazamento',async()=>{
 const r=await auditAuthInventory(fixture({denied:true}));
 assert.equal(r.inventoryVerified,false);
 assert.equal(r.authUsers,0);
 assert.deepEqual(r.blockers,['AUTH_OR_FIRESTORE_READ_DENIED']);
 assert.doesNotMatch(authInventorySummary(r),/PRIVATE_EMAIL|PRIVATE_UID/);
});
