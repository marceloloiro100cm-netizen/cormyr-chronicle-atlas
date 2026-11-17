import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOperatorEvidence,inspectOperatorEvidence,safeOperatorSummary,
  classifyOperatorCredentialError}
  from './cloud-operator-readiness.mjs';

const cloud=()=>({singleVerifiedSnapshot:true,stagesVerified:6,
  auxiliaryStagesComplete:true,auxiliaryStagesVerified:4,
  mailRuntimeEnabled:true,operationalRuntimeReconciled:true,
  firestoreHttpStatus:200,authHttpStatus:200,
  privateSecret:'SECRET_CLOUD_SNAPSHOT'});
const auth=()=>({mode:'preview',accounts:14,linkedAccounts:14,toEnable:14,
  alreadyEnabled:0,authUpdatesAttempted:0,authUsersEnabled:0,
  activationComplete:false,pendingRoleOrHouse:4,inactiveAccess:3,
  passwordResetPending:2,privatePlan:['SECRET_AUTH_UID']});

test('valid aggregate evidence is still NO_GO for players and cutover',()=>{
  const r=evaluateOperatorEvidence({cloud:cloud(),authPreview:auth()});
  assert.equal(r.authInventoryValid,true);
  assert.equal(r.disabledAccounts,14);
  assert.equal(r.pendingRoleOrHouse,4);
  assert.equal(r.privateStagesComplete,true);
  assert.equal(r.auxiliaryStagesComplete,true);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.readyForCutover,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.ok(r.blockingCodes.includes('CROSS_HOUSE_CLOUD_E2E_PENDING'));
  const publicOutput=JSON.stringify(r)+safeOperatorSummary(r);
  for(const sensitive of ['SECRET_CLOUD_SNAPSHOT','SECRET_AUTH_UID'])
    assert.ok(!publicOutput.includes(sensitive));
});
test('partial users or unexpected update makes Auth evidence invalid',()=>{
  for(const change of [
    v=>{v.accounts=13;},v=>{v.linkedAccounts=13;},
    v=>{v.toEnable=13;},v=>{v.authUpdatesAttempted=1;},
    v=>{v.authUsersEnabled=1;},v=>{v.mode='activate';},
    v=>{v.activationComplete=true;},
  ]){
    const a=auth();change(a);
    const r=evaluateOperatorEvidence({cloud:cloud(),authPreview:a});
    assert.equal(r.authInventoryValid,false);
    assert.equal(r.disabledAccounts,null);
  }
});
test('incomplete stages, auxiliary stages and runtimes remain blocked',()=>{
  for(const change of [
    v=>{v.singleVerifiedSnapshot=false;},
    v=>{v.stagesVerified=5;},
    v=>{v.auxiliaryStagesVerified=3;},
    v=>{v.auxiliaryStagesComplete=false;},
    v=>{v.mailRuntimeEnabled=false;},
    v=>{v.operationalRuntimeReconciled=false;},
  ]){
    const c=cloud();change(c);
    const r=evaluateOperatorEvidence({cloud:c,authPreview:auth()});
    assert.equal(r.releaseDecision,'NO_GO');
    assert.equal(r.readyForPlayers,false);
    assert.ok(r.blockingCodes.length>0);
  }
});
test('even if one read fails the other is attempted and no provider error leaks',async()=>{
  let second=0;
  const r=await inspectOperatorEvidence({
    readCloud:async()=>{throw Error('PRIVATE_PROVIDER_DETAIL');},
    previewAuth:async()=>{second++;return auth();},
  });
  assert.equal(second,1);
  assert.equal(r.authInventoryValid,true);
  assert.equal(r.privateStagesComplete,false);
  assert.ok(r.blockingCodes.includes('CLOUD_READ_FAILED'));
  assert.ok(!JSON.stringify(r).includes('PRIVATE_PROVIDER_DETAIL'));
});
test('Auth preflight failure exposes only fixed error classification',async()=>{
  const r=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),
    previewAuth:async()=>{throw Error('activation_preflight_auth_inventory_permission_denied');},
  });
  assert.equal(r.authPreflightFailure,'auth_inventory_permission_denied');
  assert.equal(r.authInventoryValid,false);
  assert.ok(safeOperatorSummary(r).includes('auth_inventory_permission_denied'));
  const unknown=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),
    previewAuth:async()=>{throw Error('PRIVATE_ACCOUNT_EMAIL');},
  });
  assert.equal(unknown.authPreflightFailure,'unclassified_cloud_or_runtime_error');
  assert.ok(!JSON.stringify(unknown).includes('PRIVATE_ACCOUNT_EMAIL'));
});
test('no implicit provider or cloud access',async()=>{
  await assert.rejects(inspectOperatorEvidence({
    readCloud:async()=>cloud()}),/two_read_probes_required/);
});
test('OIDC token denial has a stable code and never exposes provider details',()=>{
  const original=Error('Permission iam.serviceAccounts.getAccessToken denied for PRIVATE_SERVICE_ACCOUNT');
  assert.equal(classifyOperatorCredentialError(original),'oidc_impersonation_denied');
  const generic=Error('PRIVATE_IDENTITY_EMAIL and GOOGLE_TOKEN');
  assert.equal(classifyOperatorCredentialError(generic),'oidc_credential_unavailable');
  const report=evaluateOperatorEvidence({
    cloudError:true,authError:classifyOperatorCredentialError(original),
  });
  assert.ok(report.blockingCodes.includes('OIDC_OPERATOR_IMPERSONATION_DENIED'));
  assert.equal(report.authInventoryValid,false);
  assert.equal(report.disabledAccounts,null);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.authUpdatesAttempted,0);
  const published=JSON.stringify(report)+safeOperatorSummary(report);
  assert.ok(!published.includes('PRIVATE_SERVICE_ACCOUNT'));
  assert.ok(!published.includes('GOOGLE_TOKEN'));
});
