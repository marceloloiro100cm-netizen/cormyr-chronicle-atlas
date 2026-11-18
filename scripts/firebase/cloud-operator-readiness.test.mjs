import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOperatorEvidence,inspectOperatorEvidence,safeOperatorSummary,
  classifyOperatorCredentialError,summarizeRoleLinkageEvidence,
  operatorAuditObservationComplete}
  from './cloud-operator-readiness.mjs';

const cloud=()=>({singleVerifiedSnapshot:true,stagesVerified:6,
  auxiliaryStagesComplete:true,auxiliaryStagesVerified:4,
  mailRuntimeEnabled:true,operationalRuntimeReconciled:true,
  mailWriteGatesAligned:true,historicalCalendarVersionVerified:true,
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
  assert.equal(r.fourBlocks.operations.mailWriteGatesAligned,true);
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
test('private ten-House candidate review appears as counts, never as approval',async()=>{
  const source={
    sourceStagesVerified:6,auxiliaryStagesVerified:3,
    reviewCandidates:{
      scope:'CORMYR_PRIVATE_PUBLIC_REVIEW_CANDIDATES_READ_ONLY',
      checked:true,activeHouses:10,matched:10,unmatched:0,ambiguous:0,
      invalidArchiveFields:0,candidatePlanComplete:true,
      privateDraft:{houses:[{id:'PRIVATE_HOUSE_ID',name:'PRIVATE_HOUSE'}]},
    },
  };
  const report=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),runtimeSources:source,
  });
  const candidates=report.fourBlocks.publicContent.editorialCandidates;
  assert.equal(candidates.checked,true);
  assert.equal(candidates.activeHouses,10);
  assert.equal(candidates.matched,10);
  assert.equal(candidates.privateDraftPrepared,true);
  assert.equal(candidates.approved,false);
  assert.equal(candidates.ready,false);
  assert.equal(report.fourBlocks.publicContent.ready,false);
  assert.equal(report.readyForPlayers,false);
  const log=JSON.stringify(report)+safeOperatorSummary(report);
  for(const forbidden of ['PRIVATE_HOUSE_ID','PRIVATE_HOUSE'])
    assert.equal(log.includes(forbidden),false);
  assert.match(safeOperatorSummary(report),
    /Dez Casas: candidatos editoriais preparados/);
  const forged=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    runtimeSources:{reviewCandidates:{
      checked:true,candidatePlanComplete:true,
      activeHouses:10,matched:10,scope:'UNTRUSTED_PRIVATE_REPORT',
    }},
  });
  assert.equal(forged.fourBlocks.publicContent.editorialCandidates.checked,false);
  assert.equal(forged.fourBlocks.publicContent.editorialCandidates.privateDraftPrepared,false);
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
test('operator report never treats independent runtime mismatch as mail acceptance',()=>{
  const r=evaluateOperatorEvidence({
    cloud:{...cloud(),mailWriteGatesAligned:false},authPreview:auth(),
  });
  assert.equal(r.fourBlocks.operations.mailWriteGatesAligned,false);
  assert.ok(r.blockingCodes.includes('MAIL_WRITE_GATES_UNALIGNED'));
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  const summary=safeOperatorSummary(r);
  assert.match(summary,/Rodada e versão do calendário alinhadas/);
  assert.ok(!summary.includes('SECRET_CLOUD_SNAPSHOT'));
});

test('protected audit success is distinct from public-stage release NO_GO',()=>{
  const keys=[
    'missingProfile','unrecognizedProfile','accessInactiveOrInvalid',
    'passwordChangePendingOrInvalid','adminFlagMismatch','invalidHouseLists',
    'editScopeOutsideMembership','playerWithoutHouse','editorWithHouse',
  ];
  const report=evaluateOperatorEvidence({
    cloud:{...cloud(),auxiliaryStagesComplete:false,
      auxiliaryStagesVerified:3,auxiliaryPendingStages:['migrationPublicContentStage']},
    authPreview:auth(),
    roleLinkage:{scope:'FIREBASE_ROLE_LINKAGE_READ_ONLY',
      singleVerifiedSnapshot:true,authListComplete:true,
      accessListComplete:true,houseReferenceAuditComplete:true,
      accounts:14,linkedAccounts:14,writes:0,
      structurallyEligibleProfiles:10,unresolvedPlayerHouseReferences:0,
      blockingReasonCounts:Object.fromEntries(keys.map(k=>[k,0])),
      structurallyEligibleByProfile:{narrador:1,jogador:8,editor:1,other:0}},
    runtimeSources:{sourceStagesVerified:6,auxiliaryStagesVerified:3,
      calendarDocumentVerified:true},
  });
  assert.equal(operatorAuditObservationComplete(report),true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.ok(report.blockingCodes.includes('AUXILIARY_STAGES_UNVERIFIED'));
  assert.match(safeOperatorSummary(report),/Auditoria administrativa executada \\| Conferido/);
  assert.equal(operatorAuditObservationComplete(evaluateOperatorEvidence({
    cloudError:true})),false);
  assert.equal(operatorAuditObservationComplete({...report,
    runtimeSourceProbeFailed:true}),false);
  assert.equal(operatorAuditObservationComplete({...report,
    authInventoryValid:false}),false);
});

test('protected operator checks source and homologation by checksums without releasing',async()=>{
  const storage={
    scope:'read-only-gcs-prefix-integrity',
    sourceObjects:779,destinationObjects:779,
    sourceBytes:2107760075,destinationBytes:2107760075,
    missing:0,extra:0,sizeMismatch:0,crcMismatch:0,
    md5Mismatch:0,md5Compared:779,sourceToStagingBytesMatch:true,
    privatePath:'PRIVATE_OBJECT_NAME_NEVER_PRINT',
  };
  const assets={
    scope:'CORMYR_PUBLIC_ARCHIVE_ASSET_INVENTORY_OFFLINE',
    checked:true,houses:172,crestVerified:172,crestUnverified:0,
    historyVerified:170,historyUnverified:0,withoutHistoryReference:2,
    privateHistory:'PRIVATE_HISTORY_NEVER_PRINT',
  };
  const r=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),previewAuth:async()=>auth(),
    readStorageComparison:async()=>storage,
    readPublicAssets:async()=>assets,
  });
  assert.equal(r.storageCopyMetadataMatched,true);
  assert.equal(r.fourBlocks.operations.storageComparison.sourceReadVerified,true);
  assert.equal(r.fourBlocks.operations.storageComparison.md5Compared,779);
  assert.equal(r.fourBlocks.publicContent.assetInventory.validCrests,172);
  assert.equal(r.fourBlocks.publicContent.assetInventory.validHistories,170);
  assert.equal(r.fourBlocks.publicContent.assetInventory.reviewApproved,false);
  assert.equal(r.fourBlocks.operations.sourceDeltaReconciled,false);
  assert.equal(r.sourceLiveReconciliationVerified,false);
  assert.equal(r.storageVerified,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.ok(r.blockingCodes.includes('STORAGE_LIVE_DELTA_NOT_FROZEN'));
  const sanitized=JSON.stringify(r)+safeOperatorSummary(r);
  assert.ok(!sanitized.includes(storage.privatePath));
  assert.ok(!sanitized.includes(assets.privateHistory));
  assert.match(safeOperatorSummary(r),/Storage: cópia por metadados íntegra/);
});

test('source bucket IAM denial is redacted and does not block Auth diagnostics',async()=>{
  const r=await inspectOperatorEvidence({
    readCloud:async()=>cloud(),previewAuth:async()=>auth(),
    readStorageComparison:async()=>{
      const e=Error('PRIVATE_BUCKET_URL_AND_CREDENTIAL');
      e.auditCode='SOURCE_GCS_HTTP_403';
      throw e;
    },
    readPublicAssets:async()=>{throw Error('PRIVATE_ASSET_TEXT');},
  });
  assert.equal(r.fourBlocks.operations.storageComparison.failureCode,
    'SOURCE_GCS_HTTP_403');
  assert.equal(r.storageCopyMetadataMatched,false);
  assert.equal(r.publicAssetInventoryChecked,false);
  assert.equal(r.readyForCutover,false);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_BUCKET_URL_AND_CREDENTIAL'));
  assert.ok(!JSON.stringify(r).includes('PRIVATE_ASSET_TEXT'));
  assert.ok(r.blockingCodes.includes('STORAGE_COPY_COMPARISON_UNVERIFIED'));
  const malformed=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    storageError:'PRIVATE_STORAGE_TOKEN',
    storageComparison:{scope:'spoofed',sourceToStagingBytesMatch:true,
      sourceObjects:1,privatePath:'PRIVATE_SOURCE_PATH'},
  });
  assert.equal(malformed.storageCopyMetadataMatched,false);
  assert.equal(malformed.fourBlocks.operations.storageComparison.failureCode,null);
  assert.ok(!JSON.stringify(malformed).includes('PRIVATE_STORAGE_TOKEN'));
  assert.ok(!JSON.stringify(malformed).includes('PRIVATE_SOURCE_PATH'));
});

test('season-2 checked candidate assets are aggregated but never editorially approved',()=>{
  const r=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    runtimeSources:{
      sourceStagesVerified:6,auxiliaryStagesVerified:3,
      archiveCoverage:{
        checked:true,archivedHouses:172,archivedRegions:11,
        sourceHouses:11,activeSourceHouses:10,exactMatches:10,
        unmatchedActive:0,ambiguousMatches:0,
        assetVerification:{
          checked:true,uniqueSeason2MatchesWithValidCrests:10,
          uniqueSeason2MatchesWithValidHistories:9,
          uniqueSeason2MatchesWithBothValid:9,
          uniqueSeason2MatchesWithUnverifiedAssets:1,
          PRIVATE_FILE:'DO_NOT_LOG_THIS_PRIVATE_PATH',
        },
        PRIVATE_HOUSE:'DO_NOT_LOG_THIS_PRIVATE_HOUSE',
      },
    },
  });
  const a=r.fourBlocks.publicContent.archiveCoverage;
  assert.equal(a.candidateAssetVerification.checked,true);
  assert.equal(a.candidateAssetVerification.crests,10);
  assert.equal(a.candidateAssetVerification.histories,9);
  assert.equal(a.candidateAssetVerification.bothValid,9);
  assert.equal(a.candidateAssetVerification.unverified,1);
  assert.equal(a.candidateAssetVerification.reviewApproved,false);
  assert.equal(a.reviewApproved,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(r.readyForPlayers,false);
  const safe=JSON.stringify(r)+safeOperatorSummary(r);
  assert.ok(!safe.includes('DO_NOT_LOG_THIS_PRIVATE_PATH'));
  assert.ok(!safe.includes('DO_NOT_LOG_THIS_PRIVATE_HOUSE'));
  assert.match(safeOperatorSummary(r),/Casas ativas com ambos os arquivos íntegros/);
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

test('public archive candidate field metadata is sanitized, never reviewed',()=>{
  const r=evaluateOperatorEvidence({
    cloud:cloud(),authPreview:auth(),
    runtimeSources:{
      archiveCoverage:{
        checked:true,archivedHouses:172,archivedRegions:11,sourceHouses:11,
        activeSourceHouses:10,exactMatches:10,ambiguousMatches:0,
        unmatchedActive:0,candidateFields:{
          region:10,classification:10,crest:10,historyReference:9,
          directDescription:0,secret:'VERY_PRIVATE',
        },
      },
    },
  });
  const candidates=r.fourBlocks.publicContent.archiveCoverage.candidateFields;
  assert.equal(candidates.region,10);
  assert.equal(candidates.historyReference,9);
  assert.equal(r.fourBlocks.publicContent.archiveCoverage.reviewApproved,false);
  assert.equal(r.readyForPlayers,false);
  assert.ok(!JSON.stringify(r).includes('VERY_PRIVATE'));
  assert.match(safeOperatorSummary(r),/Histórias com referência pública/);
});
