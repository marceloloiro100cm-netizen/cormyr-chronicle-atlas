import test from 'node:test';
import assert from 'node:assert/strict';
import {CUTOVER_REQUIREMENTS,evaluateLot9CutoverGate,inspectLot9RepositorySafety}
  from './lot9-cutover-gate.mjs';

const safe={safeToMergeCode:true,checks:{
  productionFirestoreDenyAll:true,productionStorageDenyAll:true,
  supabaseStillActiveUntilCutover:true,noProductionFirebaseDomainBridge:true,
  noProductionFirebaseDomainPreview:true,cloudCredentialsNotCommitted:true,
}};

test('repository audit stays safe while all Cloud and cutover requirements are unverified',async()=>{
 const inspected=await inspectLot9RepositorySafety();
 assert.equal(inspected.safeToMergeCode,true);
 const report=evaluateLot9CutoverGate({sourceSafety:inspected});
 assert.equal(report.decision,'NO_GO');
 assert.equal(report.missing.length,CUTOVER_REQUIREMENTS.length);
 assert.ok(report.missing.includes('appHostingSSRRoutesPublished'));
 assert.ok(report.missing.includes('allFiveStorageBucketsByteVerified'));
 assert.ok(report.missing.includes('ownerExplicitlyApprovedCutover'));
 assert.equal(report.productionReleaseAuthorized,false);
 assert.equal(report.readyForCutover,false);
 assert.equal(report.cloudWrites,0);
});

test('even all user-asserted flags cannot automatically authorize a cutover',()=>{
 const all=Object.fromEntries(CUTOVER_REQUIREMENTS.map(x=>[x,true]));
 const report=evaluateLot9CutoverGate({sourceSafety:safe,externalEvidence:all});
 assert.equal(report.selfReportedComplete,true);
 assert.equal(report.eligibleForHumanAudit,true);
 assert.equal(report.independentExternalEvidenceVerified,false);
 assert.equal(report.decision,'NO_GO');
 assert.equal(report.readyForCutover,false);
});

test('missing any one gate requires audit before release',()=>{
 const all=Object.fromEntries(CUTOVER_REQUIREMENTS.map(x=>[x,true]));
 delete all.realCloudRoleE2EPassed;
 const report=evaluateLot9CutoverGate({sourceSafety:safe,externalEvidence:all});
 assert.deepEqual(report.missing,['realCloudRoleE2EPassed']);
 assert.equal(report.eligibleForHumanAudit,false);
});

test('repository is blocked if auth wiring, deny-all rules or secret controls change',()=>{
 const broken={...safe,checks:{...safe.checks,productionFirestoreDenyAll:false}};
 assert.throws(()=>evaluateLot9CutoverGate({sourceSafety:broken}),/safety preflight failed/);
 assert.throws(()=>evaluateLot9CutoverGate({sourceSafety:{...safe,safeToMergeCode:false}}),/safety preflight failed/);
 assert.throws(()=>evaluateLot9CutoverGate({sourceSafety:safe,externalEvidence:null}),/Invalid/);
});
