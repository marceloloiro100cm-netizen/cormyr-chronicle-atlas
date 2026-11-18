import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAuthorizedAuthDeletions as reconcile}
  from './auth-deletion-reconciliation.mjs';

const fixtures=()=>{
  const historicalAccess=Array.from({length:14},(_,i)=>({
    id:'uid_'+i,
    data:{userId:'uid_'+i,profile:i===0?'narrador':'jogador',admin:i===0,
      memberHouseIds:[],editHouseIds:[]},
  }));
  const liveAuth=historicalAccess.slice(0,13).map(x=>({uid:x.id,disabled:false}));
  return {historicalAccess,liveAuth,approvedDeletedUids:['uid_13'],authListComplete:true};
};
test('one explicitly approved deletion is reconciled without writes',()=>{
  const report=reconcile(fixtures());
  assert.deepEqual(
    {historic:report.historicalAccounts,live:report.liveAccounts,
     deletions:report.authorizedDeletionsVerified,writes:report.authWrites},
    {historic:14,live:13,deletions:1,writes:0});
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.ok(!JSON.stringify(report).includes('uid_13'));
});
test('reject missing authorization and wrong identity',()=>{
  assert.throws(()=>reconcile({...fixtures(),approvedDeletedUids:[]}));
  assert.throws(()=>reconcile({...fixtures(),approvedDeletedUids:['uid_12']}));
  assert.throws(()=>reconcile({...fixtures(),approvedDeletedUids:['uid_12','uid_13']}));
});
test('reject deletion of a narrator or administrator',()=>{
  const f=fixtures();
  f.liveAuth=f.liveAuth.filter(x=>x.uid!=='uid_0').concat([{uid:'uid_13',disabled:false}]);
  assert.throws(()=>reconcile({...f,approvedDeletedUids:['uid_0']}));
});
test('reject new users, duplicate identities and partial pagination',()=>{
  assert.throws(()=>reconcile({...fixtures(),authListComplete:false}));
  assert.throws(()=>reconcile({...fixtures(),liveAuth:[...fixtures().liveAuth,
    {uid:'unknown',disabled:false}]}));
  assert.throws(()=>reconcile({...fixtures(),liveAuth:[...fixtures().liveAuth,
    fixtures().liveAuth[0]]}));
});
test('reject private history mismatches and malformed records',()=>{
  const f=fixtures();
  f.historicalAccess[1].data.userId='wrong';
  assert.throws(()=>reconcile(f));
  const g=fixtures();
  g.liveAuth[0].disabled='false';
  assert.throws(()=>reconcile(g));
});

test('reject approved deletion that still carries any House permission',()=>{
  for(const field of ['memberHouseIds','editHouseIds']){
    const f=fixtures();
    f.historicalAccess[13].data[field]=['active_house'];
    assert.throws(()=>reconcile(f));
  }
});

test('reject deletion of a historical editor even when House lists are empty',()=>{
  const f=fixtures();
  f.historicalAccess[13].data.profile='editor';
  assert.throws(()=>reconcile(f));
});

test('disabled surviving account invalidates proof even when count matches',()=>{
  const f=fixtures();
  f.liveAuth[0].disabled=true;
  assert.throws(()=>reconcile(f),/remaining_account_disabled/);
});
