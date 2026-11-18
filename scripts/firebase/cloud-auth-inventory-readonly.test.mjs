import test from 'node:test';
import assert from 'node:assert/strict';
import {compareHistoricalAuthInventory,inspectProtectedAuthInventory,
  safeInventorySummary} from './cloud-auth-inventory-readonly.mjs';
const fixture=()=>{
  const historicalAccess=Array.from({length:14},(_,i)=>({
    id:'test_'+i,data:{userId:'test_'+i},
  }));
  const liveUsers=historicalAccess.slice(0,13)
    .map(x=>({uid:x.id,disabled:false}));
  return {historicalAccess,liveUsers,complete:true};
};
test('one missing historical user reported without approving deletion',()=>{
  const report=compareHistoricalAuthInventory(fixture());
  assert.equal(report.historicalAccounts,14);
  assert.equal(report.liveAccounts,13);
  assert.equal(report.missingHistoricalAccounts,1);
  assert.equal(report.exactOneMissingObserved,true);
  assert.equal(report.deletionIdentityApproved,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.ok(!JSON.stringify(report).includes('test_13'));
  assert.ok(!safeInventorySummary(report).includes('test_13'));
});
test('unauthorized or unexpected variations never count as expected transition',()=>{
  const f=fixture();
  const report=compareHistoricalAuthInventory({...f,
    liveUsers:f.liveUsers.slice(0,12)});
  assert.equal(report.exactOneMissingObserved,false);
  const extra=compareHistoricalAuthInventory({...f,
    liveUsers:f.liveUsers.concat({uid:'unlisted',disabled:false})});
  assert.equal(extra.exactOneMissingObserved,false);
  assert.equal(extra.unexpectedLiveAccounts,1);
});
test('disabled current identity must be reported without revealing UID',()=>{
  const f=fixture();
  f.liveUsers[0].disabled=true;
  const r=compareHistoricalAuthInventory(f);
  assert.equal(r.disabledLiveAccounts,1);
  assert.equal(r.readyForPlayers,false);
});
test('fail closed on duplicate, malformed or incomplete inventories',()=>{
  const f=fixture();
  assert.throws(()=>compareHistoricalAuthInventory({...f,complete:false}));
  assert.throws(()=>compareHistoricalAuthInventory({...f,
    liveUsers:[...f.liveUsers,f.liveUsers[0]]}));
  assert.throws(()=>compareHistoricalAuthInventory({...f,
    historicalAccess:[...f.historicalAccess.slice(1)]}));
});
test('protected reader checks root and never emits source identities',async()=>{
  const f=fixture();
  const db={collection:()=>({
    limit:()=>({get:async()=>({docs:[{
      id:'a'.repeat(64),data:()=>({status:'complete',private:true}),
    }]})}),
    doc:()=>({collection:()=>({get:async()=>({docs:
      f.historicalAccess.map(x=>({id:x.id,data:()=>x.data}))})})}),
  })};
  const auth={listUsers:async()=>({users:f.liveUsers})};
  const r=await inspectProtectedAuthInventory({auth,db});
  assert.equal(r.missingHistoricalAccounts,1);
  assert.equal(r.deletionIdentityApproved,false);
  await assert.rejects(inspectProtectedAuthInventory({
    auth:{listUsers:async()=>({users:f.liveUsers,pageToken:'next'})},db,
  }));
});

test('an unchanged 14-account inventory does not impersonate an approved deletion',()=>{
  const f=fixture();
  const report=compareHistoricalAuthInventory({...f,
    liveUsers:f.historicalAccess.map(x=>({uid:x.id,disabled:false}))});
  assert.equal(report.liveAccounts,14);
  assert.equal(report.exactOneMissingObserved,false);
  assert.equal(report.deletionIdentityApproved,false);
});
test('unexpected account with a missing historical account never looks reconciled',()=>{
  const f=fixture();
  const report=compareHistoricalAuthInventory({...f,
    liveUsers:[...f.liveUsers.slice(0,12),{uid:'new_user',disabled:false}]});
  assert.equal(report.liveAccounts,13);
  assert.equal(report.missingHistoricalAccounts,2);
  assert.equal(report.unexpectedLiveAccounts,1);
  assert.equal(report.exactOneMissingObserved,false);
});
