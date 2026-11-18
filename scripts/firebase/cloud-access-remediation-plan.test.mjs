import test from 'node:test';
import assert from 'node:assert/strict';
import {planNarratorAccessRemediation} from './cloud-access-remediation-plan.mjs';

const snapshotId='a'.repeat(64);
const houses=Array.from({length:11},(_,i)=>({
  sourceId:'house-'+i,active:i<10,season:2,
}));
const current=(overrides={})=>({
  userId:'account-2',profile:'jogador',active:false,admin:false,
  requirePasswordChange:false,
  memberHouseIds:[],editHouseIds:[],...overrides,
});
const next=(overrides={})=>({
  profile:'jogador',active:true,memberHouseIds:['house-1'],
  editHouseIds:['house-1'],manualReviewConfirmed:true,...overrides,
});
const input=(sourceAccess=current(),proposal=next())=>({
  snapshotId,actorUid:'narrator-1',targetUid:'account-2',
  sourceAccess,authUser:{uid:'account-2',disabled:false},
  houseCatalog:houses,proposal,
});
test('previews a real but incomplete player with NO write or privilege',()=>{
  const plan=planNarratorAccessRemediation(input());
  assert.equal(plan.checked,true);
  assert.equal(plan.mode,'preview-only');
  assert.deepEqual(plan.changedFields,
    ['active','memberHouseIds','editHouseIds']);
  assert.equal(plan.proposedMemberHouseCount,1);
  assert.equal(plan.decisionApplied,false);
  assert.equal(plan.adminGranted,false);
  assert.equal(plan.authWrites,0);
  assert.equal(plan.firestoreWrites,0);
  assert.equal(plan.readyForPlayers,false);
  assert.equal(plan.releaseDecision,'NO_GO');
  assert.ok(plan.blockingCodes.includes('IMMUTABLE_MIGRATION_ACCESS_STAGE'));
  assert.ok(plan.blockingCodes.includes('SOURCE_LIVE_DELTA_NOT_RECONCILED'));
  const safe=JSON.stringify(plan);
  for(const forbidden of ['narrator-1','account-2','house-1',snapshotId,
    'PRIVATE_USER_EMAIL','PRIVATE_CAMPAIGN_NOTE'])
    assert.ok(!safe.includes(forbidden),forbidden);
});
test('unreviewed decisions, editor with Houses, and unrecognized memberships fail closed',()=>{
  for(const proposal of [
    next({manualReviewConfirmed:false}),
    next({profile:'narrador'}),
    next({profile:'editor'}),
    next({memberHouseIds:['house-10'],editHouseIds:[]}),
    next({memberHouseIds:['house-1','house-1']}),
    next({memberHouseIds:['house-1'],editHouseIds:['house-2']}),
    next({requirePasswordChange:false}),
    next({admin:true}),
  ])assert.throws(()=>planNarratorAccessRemediation(input(current(),proposal)),
    /access_remediation_preview_/);
});
test('editor without House is acceptable as nonmutating preflight only',()=>{
  const r=planNarratorAccessRemediation(input(
    current({profile:null}),
    next({profile:'editor',memberHouseIds:[],editHouseIds:[],active:false})));
  assert.equal(r.proposedProfile,'editor');
  assert.equal(r.adminGranted,false);
  assert.equal(r.proposedMemberHouseCount,0);
  assert.equal(r.readyForPlayers,false);
});
test('password reset is never cleared by dry run; disabled Auth remains blocker',()=>{
  const i=input(current({requirePasswordChange:true}));
  i.authUser.disabled=true;
  const r=planNarratorAccessRemediation(i);
  assert.equal(r.requiresPasswordResetProof,true);
  assert.equal(r.passwordFlagCleared,false);
  assert.ok(r.blockingCodes.includes('PASSWORD_RESET_PROOF_PENDING'));
  assert.ok(r.blockingCodes.includes('FIREBASE_AUTH_ACCOUNT_DISABLED'));
});
test('already eligible accounts, narrator escalation and self-remediation are forbidden',()=>{
  assert.throws(()=>planNarratorAccessRemediation(input(
    current({active:true,memberHouseIds:['house-1']}))),/subject_not_pending/);
  assert.throws(()=>planNarratorAccessRemediation(input(current({
    profile:'narrador',admin:true
  }))),/source_invalid/);
  const i=input();i.actorUid='account-2';
  assert.throws(()=>planNarratorAccessRemediation(i),/source_invalid/);
});
test('broken source, duplicate catalog and unexpected active house count deny',()=>{
  const i=input();i.sourceAccess.userId='another-uid';
  assert.throws(()=>planNarratorAccessRemediation(i),/source_invalid/);
  const duplicate=input();duplicate.houseCatalog=[...houses,houses[0]];
  assert.throws(()=>planNarratorAccessRemediation(duplicate),/house_catalog_invalid/);
  const incomplete=input();incomplete.houseCatalog=houses.slice(2);
  assert.throws(()=>planNarratorAccessRemediation(incomplete),
    /house_catalog_unverified/);
});
