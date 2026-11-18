import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPrivateAccessRemediation as plan,
  safePrivateAccessProposalSummary as safe,
} from './access-remediation-preflight.mjs';

const snapshot='a'.repeat(64);
const houses=()=>Array.from({length:10},(_,i)=>({
  sourceId:'house-'+i,active:true,season:2,
}));
const access=()=>Array.from({length:14},(_,i)=>{
  const uid='account-'+(i+1);
  const value={userId:uid,profile:'jogador',active:true,admin:false,
    requirePasswordChange:false,memberHouseIds:['house-0'],
    editHouseIds:['house-0']};
  if(i===1)value.active=false;
  if(i===2){value.profile=null;value.memberHouseIds=[];value.editHouseIds=[];}
  if(i===3){value.memberHouseIds=[];value.editHouseIds=[];}
  if(i===4)value.requirePasswordChange=true;
  return {id:uid,data:value};
});
const confirm='NARRATOR_EXPLICIT_ACCOUNT_AND_HOUSE_REVIEW';
const decision=(uid,fields={})=>({
  uid,profile:'jogador',memberHouseIds:['house-0'],
  editHouseIds:['house-0'],active:true,reviewConfirmation:confirm,
  houseConsentVerified:true,
  reason:'O Narrador conferiu a titularidade e a Casa.',
  ...fields,
});
const input=(changes)=>({
  snapshotId:snapshot,accessDocs:access(),houses:houses(),
  reviewedChanges:changes,
});

test('private proposal strictly respects pending accounts, ten active Houses and immutable source',()=>{
  const i=input([
    decision('account-2'),
    decision('account-3',{memberHouseIds:['house-2'],editHouseIds:[]}),
    decision('account-4',{memberHouseIds:['house-3'],editHouseIds:['house-3']}),
    decision('account-5',{active:false,editHouseIds:[]}),
  ]);
  const frozen=structuredClone(i);
  const r=plan(i);
  assert.equal(r.summary.accountsChecked,14);
  assert.equal(r.summary.activeSeason2Houses,10);
  assert.equal(r.summary.pendingAtSource,4);
  assert.equal(r.summary.proposedChanges,4);
  assert.equal(r.summary.wouldActivate,1);
  assert.equal(r.summary.wouldDeactivate,1);
  assert.equal(r.summary.profilesCompleted,1);
  assert.equal(r.summary.membershipChanged,3);
  assert.equal(r.summary.passwordResetStillPending,1);
  assert.equal(r.summary.proposalValidated,true);
  assert.equal(r.summary.approvalRecorded,false);
  assert.equal(r.summary.releaseDecision,'NO_GO');
  assert.equal(r.summary.cloudWrites,0);
  assert.equal(r.summary.authWrites,0);
  assert.equal(r.summary.readyForPlayers,false);
  assert.equal(r.privatePlan.proposals.length,4);
  assert.match(r.privatePlan.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(r.privatePlan.proposals.every(x=>x.after.admin===false));
  assert.ok(r.privatePlan.proposals.some(x=>x.after.requirePasswordChange===true));
  assert.deepEqual(i,frozen);
  const clean=JSON.stringify(r.summary)+safe(r.summary);
  for(const item of ['account-2','house-2','O Narrador conferiu',
    r.privatePlan.fingerprint,snapshot])assert.ok(!clean.includes(item));
  assert.ok(safe(r.summary).includes('| Aprovação registrada e aplicada | **NÃO** |'));
});

test('never change historical password reset requirement or activate pending reset',()=>{
  const i=input([decision('account-5',{active:false,editHouseIds:[]})]);
  assert.equal(plan(i).privatePlan.proposals[0].after.requirePasswordChange,true);
  assert.throws(()=>plan(input([decision('account-5',{
    editHouseIds:[],
  })])),/password_reset_not_verified/);
  assert.throws(()=>plan(input([decision('account-5',{
    active:false,requirePasswordChange:false,
  })])),/decision_unverified/);
});

test('must reject unsupported privileges and editor House access',()=>{
  for(const changes of [
    [decision('account-3',{profile:'narrador'})],
    [decision('account-2',{profile:'editor',memberHouseIds:[],editHouseIds:[]})],
    [decision('account-3',{profile:'editor',memberHouseIds:['house-1'],editHouseIds:[]})],
    [decision('account-3',{profile:'editor',memberHouseIds:[],editHouseIds:['house-1']})],
    [decision('account-2',{profile:'jogador',memberHouseIds:['house-1'],
      editHouseIds:['house-7']})],
    [decision('account-2',{profile:'jogador',memberHouseIds:['house-1','house-1'],
      editHouseIds:['house-1']})],
    [decision('account-1')],
  ])assert.throws(()=>plan(input(changes)),/access_remediation_preflight_/);
});

test('no guessed House, no unchecked consent, no duplicated decision',()=>{
  for(const changes of [
    [decision('account-2',{reviewConfirmation:'yes'})],
    [decision('account-2',{houseConsentVerified:false})],
    [decision('account-2',{reason:'Approved'})],
    [decision('account-2',{memberHouseIds:['../private']})],
    [decision('account-2'),decision('account-2')],
    [decision('account-2',{profile:'jogador',memberHouseIds:['old-season']})],
    [decision('account-2',{uid:'unknown-account'})],
    [decision('account-2',{active:false})],
  ])assert.throws(()=>plan(input(changes)),/access_remediation_preflight_/);
});

test('fails closed on incomplete, duplicate and stale source catalogs',()=>{
  const bad=input([decision('account-2')]);
  bad.accessDocs.pop();
  assert.throws(()=>plan(bad),/inventory_unverified/);
  const duplicate=input([decision('account-2')]);
  duplicate.accessDocs[3].id=duplicate.accessDocs[2].id;
  assert.throws(()=>plan(duplicate),/access_inventory_invalid/);
  const absent=input([decision('account-2')]);
  absent.houses[0].active=false;
  assert.throws(()=>plan(absent),/active_house_catalog_unverified/);
  const old=input([decision('account-2')]);
  old.houses[0].season=1;
  assert.throws(()=>plan(old),/active_house_catalog_unverified/);
  assert.throws(()=>plan(input([])),/inventory_unverified/);
});

test('an otherwise active user with a legacy House is an explicit remediation candidate',()=>{
  const i=input([decision('account-1')]);
  i.houses.push({sourceId:'house-old',active:false,season:1});
  i.accessDocs[0].data.memberHouseIds=['house-old'];
  i.accessDocs[0].data.editHouseIds=['house-old'];
  const report=plan(i);
  assert.equal(report.summary.pendingAtSource,5);
  assert.equal(report.summary.proposedChanges,1);
  assert.equal(report.summary.membershipChanged,1);
  assert.equal(report.summary.wouldActivate,0);
  assert.equal(report.summary.releaseDecision,'NO_GO');
  assert.deepEqual(report.privatePlan.proposals[0].after.memberHouseIds,['house-0']);
});

test('deterministic private fingerprint independent of reviewed change ordering',()=>{
  const a=decision('account-2');
  const b=decision('account-3',{memberHouseIds:['house-3'],editHouseIds:[]});
  const p=plan(input([a,b]));
  const q=plan(input([b,a]));
  assert.equal(p.privatePlan.fingerprint,q.privatePlan.fingerprint);
  assert.deepEqual(p.privatePlan.proposals,q.privatePlan.proposals);
  assert.ok(!JSON.stringify(p.summary).includes('account-2'));
  assert.equal(safe({scope:'UNTRUSTED',proposalValidated:true,cloudWrites:0})
    .includes('indisponível'),true);
});
