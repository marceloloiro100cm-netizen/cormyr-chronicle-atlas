import test from 'node:test';
import assert from 'node:assert/strict';
import {auditProtectedAuthDeletion,safeDeletionSummary}
  from './cloud-auth-deletion-readonly.mjs';
const fixture=()=>{
  const historic=Array.from({length:14},(_,i)=>({
    id:'uid_'+i,data:{userId:'uid_'+i,profile:i===0?'narrador':'jogador',
      admin:i===0,memberHouseIds:[],editHouseIds:[]},
  }));
  const auth={listUsers:async()=>({users:historic.slice(0,13)
    .map(d=>({uid:d.id,disabled:false})),pageToken:undefined})};
  const db={collection:(name)=>{
    assert.equal(name,'migrationDomainStage');
    return {
      limit:()=>({get:async()=>({docs:[{id:'a'.repeat(64),
        data:()=>({private:true,status:'complete'})]})}),
      doc:()=>({collection:(child)=>{
        assert.equal(child,'access');
        return {get:async()=>({docs:historic.map(d=>({
          id:d.id,data:()=>d.data}))})};
      }}),
    };
  }};
  return {auth,db,approvedDeletedUids:['uid_13']};
};
test('private proof accepts only reviewed deletion and never exposes UID',async()=>{
  const report=await auditProtectedAuthDeletion(fixture());
  assert.equal(report.liveAccounts,13);
  assert.equal(report.authorizedDeletionsVerified,1);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.ok(!JSON.stringify(report).includes('uid_13'));
  assert.ok(!safeDeletionSummary(report).includes('uid_13'));
});
test('unapproved deletion fails without mutation',async()=>{
  await assert.rejects(auditProtectedAuthDeletion({...fixture(),
    approvedDeletedUids:['uid_12']}));
});
test('incomplete Auth page fails closed',async()=>{
  const f=fixture();
  f.auth.listUsers=async()=>({users:[],pageToken:'more'});
  await assert.rejects(auditProtectedAuthDeletion(f));
});
test('missing private authorization fails closed',async()=>{
  await assert.rejects(auditProtectedAuthDeletion({...fixture(),
    approvedDeletedUids:[]}));
});
