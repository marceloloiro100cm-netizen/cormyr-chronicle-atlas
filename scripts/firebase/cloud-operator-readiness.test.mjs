import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOperatorEvidence,inspectOperatorEvidence,safeOperatorSummary,
  classifyOperatorCredentialError,summarizeRoleLinkageEvidence}
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
  assert.equal(r.fourBlocks.publicContent.ready,false);
  assert.equal(r.fourBlocks.operations.ready,false);
  assert.equal(r.fourBlocks.playerAccess.ready,false);
  assert.equal(r.fourBlocks.acceptance.ready,false);
  assert.equal(r.fourBlocks.acceptance.authenticatedCloudRoleE2EVerified,false);
  const publicOutput=JSON.stringify(r)+safeOperatorSummary(r);
  for(const sensitive of ['SECRET_CLOUD_SNAPSHOT','SECRET_AUTH_UID'])
    assert.ok(!publicOutput.includes(sensitive));
});
test('operator reports only safe auxiliary stage names',()=>{
  const c=cloud();
  c.auxiliaryStagesVerified=3;
  c.auxiliaryStagesComplete=false;
  c.auxiliaryPendingStages=[
    'migrationPublicContentStage','PRIVATE_HOUSE_ID','migrationPublicContentStage',
  ];
  const r=evaluateOperatorEvidence({cloud:c,authPreview:auth()});
  assert.deepEqual(r.auxiliaryPendingStages,['migrationPublicContentStage']);
  assert.ok(r.blockingCodes.includes('AUXILIARY_STAGES_UNVERIFIED'));
  assert.match(safeOperatorSummary(r),/migrationPublicContentStage/);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_HOUSE_ID'));
  assert.ok(!safeOperatorSummary(r).includes('PRIVATE_HOUSE_ID'));
});

test('four independent Cloud blocks report only safe aggregate evidence',()=>{
  const c=cloud();
  c.publicContentStageHttpStatus=404;
  c.publicContentStageVerified=false;
  c.mailRuntimeHttpStatus=404;
  c.operationalRuntimeHttpStatus=404;
  const a=auth();
  a.missingProfiles=2;
  a.playersWithoutHouse=2;
  a.toEnable=0;
  a.alreadyEnabled=14;
  const r=evaluateOperatorEvidence({cloud:c,authPreview:a});
  assert.equal(r.fourBlocks.publicContent.stageHttpStatus,404);
  assert.equal(r.fourBlocks.publicContent.stageVerified,false);
  assert.equal(r.fourBlocks.operations.mailRuntimeHttpStatus,404);
  assert.equal(r.fourBlocks.operations.houseRuntimeHttpStatus,404);
  assert.equal(r.fourBlocks.playerAccess.authAccountsEnabled,true);
  assert.equal(r.fourBlocks.playerAccess.missingProfiles,2);
  assert.equal(r.fourBlocks.playerAccess.playersWithoutHouse,2);
  assert.equal(r.fourBlocks.playerAccess.inactiveAccess,3);
  assert.equal(r.fourBlocks.playerAccess.passwordResetPending,2);
  assert.equal(r.fourBlocks.acceptance.ready,false);
  assert.equal(r.readyForPlayers,false);
  const output=JSON.stringify(r)+safeOperatorSummary(r);
  for(const secret of ['SECRET_CLOUD_SNAPSHOT','SECRET_AUTH_UID',
    'PRIVATE_HOUSE_123'])assert.ok(!output.includes(secret));
});
test('malformed stage HTTP and missing inventory fail closed',()=>{
  const c=cloud();
  c.publicContentStageHttpStatus='PRIVATE_HOUSE_123';
  c.mailRuntimeHttpStatus=999;
  const r=evaluateOperatorEvidence({cloud:c,authError:'auth_inventory_request_failed'});
  assert.equal(r.fourBlocks.publicContent.stageHttpStatus,null);
  assert.equal(r.fourBlocks.operations.mailRuntimeHttpStatus,null);
  assert.equal(r.fourBlocks.playerAccess.missingProfiles,null);
  assert.equal(r.fourBlocks.playerAccess.authAccountsEnabled,false);
  assert.equal(r.readyForPlayers,false);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_HOUSE_123'));
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

test('optional live-source probe is sanitized and never issues authorization',async()=>{
  const probe={
    sourceStagesVerified:6,auxiliaryStagesVerified:3,
    calendarDocumentVerified:true,calendarHasHistoricalRound:true,
    houseDraftConfirmed:true,mailDraftConfirmed:true,
    disabledDraftsConfirmed:true,
    archiveCoverage:{
      checked:true,archivedHouses:172,archivedRegions:11,
      sourceHouses:11,activeSourceHouses:10,exactMatches:8,
      ambiguousMatches:0,unmatchedActive:2,
      privateData:'NEVER_PRINT_PRIVATE_HOUSE',
    },
    sensitiveCalendar:'PRIVATE_CALENDAR_DATE',
    sensitiveHouse:'PRIVATE_HOUSE_ID',
  };
  const report=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),previewAuth:async()=>auth(),
    readRuntimeSources:async()=>probe,
  });
  const pre=report.fourBlocks.operations.sourcePreflight;
  assert.equal(pre.checked,true);
  assert.equal(pre.completeStages,6);
  assert.equal(pre.completeAuxiliaryStages,3);
  assert.equal(pre.calendarDocumentVerified,true);
  assert.equal(pre.historicalRoundFound,true);
  assert.equal(pre.houseDraftConfirmed,true);
  assert.equal(pre.mailDraftConfirmed,true);
  assert.equal(pre.disabledDraftsConfirmed,true);
  assert.equal(pre.currentRoundApproved,false);
  assert.equal(pre.ready,false);
  assert.equal(report.readyForPlayers,false);
  const output=JSON.stringify(report)+safeOperatorSummary(report);
  assert.ok(!output.includes('PRIVATE_CALENDAR_DATE'));
  assert.ok(!output.includes('PRIVATE_HOUSE_ID'));
});
test('a failed third probe never leaks provider detail',async()=>{
  const report=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),previewAuth:async()=>auth(),
    readRuntimeSources:async()=>{throw Error('SECRET_PROVIDER_ERROR');},
  });
  assert.equal(report.runtimeSourceProbeFailed,true);
  assert.equal(report.fourBlocks.operations.sourcePreflight.checked,false);
  assert.equal(report.readyForCutover,false);
  assert.ok(!JSON.stringify(report).includes('SECRET_PROVIDER_ERROR'));
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

test('a created inactive runtime never becomes a release authorization',()=>{
  const r=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    runtimeSources:{houseDraftConfirmed:true,mailDraftConfirmed:true,
      disabledDraftsConfirmed:true},
  });
  const pre=r.fourBlocks.operations.sourcePreflight;
  assert.equal(pre.disabledDraftsConfirmed,true);
  assert.equal(pre.ready,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.match(safeOperatorSummary(r),/inativo e íntegro/);
});

test('protected archive matching is coverage only and does not publish content',()=>{
  const r=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    runtimeSources:{archiveCoverage:{
      checked:true,archivedHouses:172,archivedRegions:11,
      sourceHouses:11,activeSourceHouses:10,exactMatches:8,
      ambiguousMatches:0,unmatchedActive:2,
      privateValue:'HIDDEN_PERSONAL',
    }},
  });
  const coverage=r.fourBlocks.publicContent.archiveCoverage;
  assert.equal(coverage.checked,true);
  assert.equal(coverage.exactMatches,8);
  assert.equal(coverage.unmatchedActive,2);
  assert.equal(coverage.reviewApproved,false);
  assert.equal(coverage.ready,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.ok(!JSON.stringify(r).includes('HIDDEN_PERSONAL'));
  assert.match(safeOperatorSummary(r),/somente nomes/);
});
test('missing/invalid archive coverage does not silently become zero',()=>{
  const r=evaluateOperatorEvidence({cloud:cloud(),authPreview:auth()});
  assert.equal(r.fourBlocks.publicContent.archiveCoverage.checked,false);
  assert.equal(r.fourBlocks.publicContent.archiveCoverage.exactMatches,null);
  assert.equal(r.fourBlocks.publicContent.archiveCoverage.reviewApproved,false);
});

test('Cloud role linkage yields sanitized per-cause aggregates, never identities',()=>{
  const source={
    scope:'FIREBASE_ROLE_LINKAGE_READ_ONLY',singleVerifiedSnapshot:true,
    authListComplete:true,accessListComplete:true,
    houseReferenceAuditComplete:true,accounts:14,linkedAccounts:14,
    writes:0,structurallyEligibleProfiles:10,
    unresolvedPlayerHouseReferences:2,privateUid:'NEVER_EXPOSE_UID',
    blockingReasonCounts:{
      missingProfile:2,unrecognizedProfile:0,
      accessInactiveOrInvalid:4,passwordChangePendingOrInvalid:2,
      adminFlagMismatch:0,invalidHouseLists:0,
      editScopeOutsideMembership:0,playerWithoutHouse:2,
      editorWithHouse:0,privateSecret:'PRIVATE_ERROR',
    },
    structurallyEligibleByProfile:{narrador:1,jogador:8,editor:1,other:0},
  };
  const a=summarizeRoleLinkageEvidence(source);
  assert.equal(a.checked,true);
  assert.equal(a.eligible,10);
  assert.equal(a.blockingReasonCounts.missingProfile,2);
  assert.equal(a.blockingReasonCounts.playerWithoutHouse,2);
  assert.equal(a.unresolvedHouseReferences,2);
  assert.equal(a.ready,false);
  const report=evaluateOperatorEvidence({cloud:cloud(),authPreview:auth(),roleLinkage:source});
  assert.equal(report.fourBlocks.playerAccess.linkageDiagnostics.checked,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.releaseDecision,'NO_GO');
  const out=JSON.stringify(report)+safeOperatorSummary(report);
  for(const s of ['PRIVATE_ERROR','NEVER_EXPOSE_UID'])assert.ok(!out.includes(s));
});
test('unexpected role report structure is fail closed, with no sensitive fields',()=>{
  for(const source of [
    {scope:'WRONG',privateUid:'SECRET_UID'},
    {scope:'FIREBASE_ROLE_LINKAGE_READ_ONLY',accounts:14,linkedAccounts:14,
      privateUid:'SECRET_UID'},
  ]){
    const a=summarizeRoleLinkageEvidence(source);
    assert.equal(a.checked,false);
    assert.equal(a.eligible,null);
    assert.ok(!JSON.stringify(a).includes('SECRET_UID'));
  }
});
test('linkage audit failure does not hide other evidence or release players',async()=>{
  const r=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),
    previewAuth:async()=>auth(),
    readRoleLinkage:async()=>{throw Error('SECRET_PROVIDER_ERROR');},
  });
  assert.equal(r.authInventoryValid,true);
  assert.equal(r.fourBlocks.playerAccess.linkageDiagnostics.checked,false);
  assert.ok(r.blockingCodes.includes('ROLE_LINKAGE_DIAGNOSIS_INCOMPLETE'));
  assert.equal(r.readyForPlayers,false);
  assert.ok(!JSON.stringify(r).includes('SECRET_PROVIDER_ERROR'));
});
